#!/usr/bin/env python
"""
remixer.py

Provides a basic remix superclass to build music remixers into bigger apps. (i.e.: web apps)
The heart of the Wub Machine (wubmachine.com) and hopefully more to come.

by Peter Sobot <hi@petersobot.com>
    v1: started Jan. 2011
    v2: August-Sept 2011
"""
from numpy import array
from os import rename, unlink, path, access, W_OK
from threading import Thread
from multiprocessing import Queue, Process
from traceback import print_exception, format_exc
from subprocess import check_call, call
from mutagen import File, id3
from PIL import Image
import librosa
import numpy as np
import soundfile as sf
import time, sys, wave, mimetypes, config, logging, traceback

class Remixer(Thread):
    """
        Generic song remixer to be inherited from and
        embedded in something bigger - i.e. a web app.
        (like the Wub Machine...)

        Inherits from Thread to allow for asynchronous processing.

        Workhorse function (run()) spawns a child process for the remixer,
        then blocks for progress updates and calls callback functions when they occur.
        Progress updates are kept in a queue and callbacks fired immediately if the
        queue is not empty. Otherwise, the callback is fired when the progress update comes in.

        Child process is used for memory efficiency and to leverage multiple cores better.
        Spawn 4 remixers on a quad-core machine, and remix 4 tracks at once!

        Includes convenience methods for all remixers to use, as well as metadata functions
        and a memory-light alternative to AudioQuantumList: partialEncode().
    """
    def __init__(self, parent, infile, outfile=None, callbacks=None):
        """
            Takes in parent (whatever class spawns the remixer), in/out filenames,
            and a UID to identify the remix by.
            Logger should be a non-blocking function that needs to know *all* progress updates.
        """
        #   Thread variables
        if isinstance(callbacks, list):
            self.callbacks =   callbacks
        else:
            self.callbacks =   [callbacks]
        self.being_watched = False #  If nobody is watching, this remix can/should be killed.
        self.parent =    parent
        self.uid =       path.splitext(path.basename(infile))[0]
        self.extension = path.splitext(infile)[-1]
        self.timeout =   600     #   seconds
        self.queue =     None    #   queue between thread and process
        self.errortext = "Sorry, that song didn't work. Try another!"
        self.started =   None
        self.status =    0
        self.added =     time.time()

        #   Remixer variables
        self.keys =      {0: "C", 1: "C#", 2: "D", 3: "Eb", 4: "E", 5: "F", 6: "F#", 7: "G", 8: "G#", 9: "A", 10: "Bb", 11: "B"}
        self.infile  =   str(infile)
        if access('tmp/', W_OK):
            self.tempdir =   'tmp/'
        else:
            self.tempdir =   './'
        self.tempfile =  path.join(self.tempdir, "%s.wav" % self.uid)
        self.outdir =    'static/songs/'
        self.overlay =   'static/img/overlay.png' # Transparent overlay to put on top of song artwork
        self.outfile =   outfile or path.join(path.dirname(self.infile), "%s.out.mp3" % self.uid)
        self.artmime = None
        self.artpath = None
        self.artprocessed = False
        self.progress =  0.0
        self.step =      None
        self.encoded =   0
        self.deleteOriginal = True

        self.sample_path = 'samples/%s/' % str(self.__class__.__name__).lower()
        
        self.tag =       {}      #   Remix metadata tag
        self.original =  None    #   audio.LocalAudioFile-returned analysis
        self.tonic =     None
        self.tempo =     None
        self.bars =      None
        self.beats =     None
        self.sections =  None

        Thread.__init__(self)


    """
        All of the following progress methods should be of the form:
        {
            'status':
                -1 is error
                0 is waiting
                1 is OK
            'uid':
                uid of the track
            'time':
                current timestamp (not yet used)
            'text':
                progress text or user string to display for errors
            'progress':
                0-1 measure of progress, 1 being finished, 0 being not started
            'tag':
                Song-specific tag including all of its metadata
            ['debug']:
                Optional debug info if error.
        }
    """
    def logbase(self):
        return { 'status': self.status, 'text': self.step, 'progress': self.progress, 'tag': self.tag, 'uid': self.uid, 'time': time.time() }

    def log(self, text, progress):
        """
            Pass progress updates back to the run() function, which then bubbles up to everybody watching this remix.
            Automatically increments progress, which can be a fractional percentage or decimal percentage.
        """
        if progress > 1:
            progress *= 0.01
        self.progress += progress
        self.step = text

        self.processqueue.put(self.logbase())

    def handleError(self, e):
        self.step = "Hmm... something went wrong. Please try again later!"
        progress = self.logbase()
        progress['debug'] = str(e) # Python 3: unicode() is str()
        self.last = progress

    def error(self, text):
        """
            In case of emergency, break glass.
            In case of remixer error, log an error and close the queue.
        """
        self.step = text
        self.status = -1

        update = self.logbase()
        update['text'] = self.errortext
        update['debug'] = text

        self.processqueue.put(update)
        self.close()

    def finish(self, text):
        """
            When the remixing's all done, log it and close the queue.
        """
        self.progress = 1
        self.step = text
        self.processqueue.put(self.logbase())
        self.close()

    def close(self):
        """
            When it's all over, the run() function needs to know when to go home.
        """
        self.processqueue.put(False)

    def stop(self):
        """
            Set status flag to error, which stops the remixing, terminates the child process and returns.
        """
        print(("Trying to stop remixer %s" % self.uid))
        self.status = -1

    def attach(self, callback): 
        """
            Attaches a given callback to the remix, to be called on the next progress update.
            Intended to send asynchronous updates to a user who's remixing a song. (i.e.: via HTTP)
        """
        if callback not in self.callbacks:
            self.callbacks.append(callback)

    def cleanup(self):
        """
            Remove all temporary files, and clear unused memory.
            Remixin's a messy business.
        """
        if path.isfile(self.tempfile):
            unlink(self.tempfile)
        if self.deleteOriginal and path.isfile(self.infile):
            unlink(self.infile)

        i = 0
        f = "%s%s%s.wav" % (self.tempdir, self.uid, i)
        while path.isfile(f):
            unlink(f)
            i += 1
            f = "%s%s%s.wav" % (self.tempdir, self.uid, i)
        if self.original:
            self.original.unload()

    def run(self):
        """
            Spawns a child process to do the actual remixing.
            Blocks until a progress update comes from the child process.
            When a progress update comes through:
                if someone is watching (i.e.: there's a callback) then fire the callback
                if not, put the progress update into a queue
                if somebody is *monitoring* and doesn't care about missing an update,
                  fire the monitors callback. (Useful for watching an entire server of remixers.)
            The "loggers" callback gets fired on each update, no matter what.

            After remixing is complete and the communication queue is closed,
            the subprocess is joined, deleted, and the parent's "finish" method
            is called if it exists.
        """
        self.started = time.time()
        self.status = 1
        self.processqueue = Queue()
        self.p = Process(target=self._remix)                    #   Actual remix process started with Multiprocessing
        self.p.start()

        self.last = None
        try:
            progress = self.processqueue.get(True, self.timeout)          #   Queue that blocks until progress updates happen
            while progress and self.status != -1:                       #   MUST END WITH False value, or else this will block forever
                self.last = progress
                for callback in self.callbacks:                             #   Send all progress updates
                    callback(progress)
                progress = self.processqueue.get(True, self.timeout)      #   Grab another progress update from the process
        except Exception as e: # Python 3 syntax
            self.status = -1
            self.handleError(e)
        else: # Python 3 'else' for try/except/else
            if self.status == -1:
                try:
                  # Ensure 'last' is defined in this scope if used. It's defined in the try block.
                  # If the loop doesn't run, 'last' might not be defined.
                  # It's safer to use self.last which is updated in the loop.
                  self.handleError(Exception("RemixTermination. Last was:\n%s" % self.last))
                except:
                    self.handleError(Exception("RemixTermination"))
        self.processqueue.close()
        self.p.terminate()
        self.cleanup()
        del self.p
        if hasattr(self.parent, 'finish'):
            self.parent.finish(self.uid, self.last)

    def _remix(self):
        """
          Failure-tolerant wrapper around main remix method that allows for cleanup and such.
        """
        try:
            self.tag['style'] = str(self.__class__.__name__)
            self.tag['remixed'] = self.remix()
            self.finish("Done!")
        except:
            exc_type, exc_value, exc_traceback = sys.exc_info()
            print_exception(exc_type, exc_value, exc_traceback,limit=4, file=sys.stderr)
            fname = path.split(exc_traceback.tb_frame.f_code.co_filename)[1]
            lines = format_exc().splitlines()
            self.error("%s @ %s:%s\n\n%s" % (exc_value, fname, exc_traceback.tb_lineno, '\n'.join(lines)))
        finally:
            self.cleanup()

    """
    Audio methods for encoding, partial encoding, custom mixing, 
    """
    def lame(self, infile, outfile):
        """
            Use the installed (hopefully latest) build of
            LAME to get a really, really high quality MP3.
        """
        r = check_call(['lame', '-S', '--preset', 'fast', 'medium', str(infile), str(outfile)])
        return r

    def mono_to_stereo(self, y_mono):
        """
            Converts a mono NumPy array to a stereo NumPy array.
        """
        if y_mono.ndim == 1:
            return np.vstack([y_mono, y_mono])
        elif y_mono.ndim == 2 and y_mono.shape[0] == 1: # Check if it's (1, N)
            return np.vstack([y_mono[0], y_mono[0]])
        # If already stereo or other format, return as is, or raise error
        return y_mono

    def truncatemix(self, y_a, y_b, mix=0.5):
        """
        Mixes two NumPy arrays representing audio data. Assumes they have the same sample rate
        and number of channels.

        Mix takes a float 0-1 and determines the relative mix of two audios.
        i.e., mix=0.9 yields greater presence of y_a in the final mix.

        If y_b is longer than y_a, y_b is truncated to y_a's length.
        """
        # Ensure y_a is float for multiplication
        y_a_float = y_a.astype(np.float32)
        
        # Create a copy for the new data to avoid modifying original y_a
        mixed_y = y_a_float * float(mix)
        
        len_a = y_a.shape[1]
        len_b = y_b.shape[1]

        # Determine the length of the mix
        mix_len = min(len_a, len_b)

        # Add the second audio stream
        if len_b > len_a: # y_b is longer, truncate y_b
            mixed_y[:, :len_a] += y_b[:, :len_a].astype(np.float32) * (1.0 - float(mix))
        else: # y_a is longer or equal length, truncate y_b (or use full if equal)
            mixed_y[:, :len_b] += y_b[:, :len_b].astype(np.float32) * (1.0 - float(mix))
            # If y_a was longer, the end part of mixed_y (from y_a) is already there.
            # If y_b was longer, it's truncated.
            # If they were equal, it's a full mix.
            # If y_a is longer than y_b, we need to ensure the remaining part of y_a is correctly scaled or handled.
            # The current logic: mixed_y starts as scaled y_a. We add scaled y_b.
            # If y_a is longer, mixed_y already contains the tail of y_a * mix. This is correct.

        return mixed_y

    def partialEncode(self, y, sr):
        """
            Encodes a NumPy array to a WAV file.
            Each call creates a new numbered WAV file. These are later concatenated by mixwav.
        """
        filename = "%s%s%03d.wav" % (self.tempdir, self.uid, self.encoded)
        # Soundfile expects data in (samples, channels) or (samples,) for mono
        # Librosa usually gives (channels, samples) or (samples,) for mono
        # If y is (channels, samples), transpose it. If mono (N,), it's fine.
        if y.ndim == 2 and y.shape[0] < y.shape[1]: # Assuming channels are the smaller dimension
            y_to_write = y.T 
        else:
            y_to_write = y
        sf.write(filename, y_to_write, sr)
        self.encoded += 1

    def mixwav(self, filename):
        """
            When used after partialEncode(), this concatenates a number of audio
            files into one with a given filename. (Super fast, super memory-efficient.)
            
            Requires the shntool binary to be installed.
        """
        if self.encoded == 1:
            rename("%s%s%03d.wav" % (self.tempdir, self.uid, 0), filename)
            return
        args = ['shntool', 'join', '-z', self.uid, '-q', '-d', self.tempdir]
        for i in range(0, self.encoded):
            args.append("%s%s%03d.wav" % (self.tempdir, self.uid, i))
        call(args)
        rename("%sjoined%s.wav" % (self.tempdir, self.uid), filename)
        for i in range(0, self.encoded):
            unlink("%s%s%03d.wav" % (self.tempdir, self.uid, i))

    """
    Metadata methods for tagging
    """
    def getTag(self):
        """
            Tries to get the metadata tag from the input file.
            May not work. Only set up to do mp3, m4a and wav.
            Returns its success value as a boolean.
        """
        try:
            self.mt = File(self.infile)
            tag = {}

            # technical track metadata
            if hasattr(self.mt, 'info'):
                tag['bitrate'] = self.mt.info.bitrate if hasattr(self.mt.info, 'bitrate') else None
                tag['length'] = self.mt.info.length if hasattr(self.mt.info, 'length') else None
                tag['samplerate'] = self.mt.info.sample_rate if hasattr(self.mt.info, 'sample_rate') else None
                tag['channels'] = self.mt.info.channels if hasattr(self.mt.info, 'channels') else None
            elif self.extension == ".wav":
                wav = wave.open(self.infile)
                tag['samplerate'] = wav.getframerate()
                tag['channels'] = wav.getnchannels()
                tag['length'] = float(wav.getnframes()) / tag['samplerate']
                tag['bitrate'] = (wav._file.getsize() / tag['length']) / 0.125  # value in kilobits
                wav.close()
                del wav

            if self.mt:
                if self.extension == ".mp3":
                    if 'TIT2' in self.mt: tag["title"] = self.mt['TIT2'].text[0]
                    if 'TPE1' in self.mt: tag["artist"] = self.mt['TPE1'].text[0]
                    if 'TALB' in self.mt: tag["album"] = self.mt['TALB'].text[0]
                elif self.extension == ".m4a":
                    if '\xa9nam' in self.mt: tag["title"] = self.mt['\xa9nam'][0]
                    if '\xa9ART' in self.mt: tag["artist"] = self.mt['\xa9ART'][0]
                    if '\xa9alb' in self.mt: tag["album"] = self.mt['\xa9alb'][0]

            self.tag = dict(self.tag.items() + tag.items()) # Merge all new tags into tag object
            if hasattr(self.parent, 'updateTrack'):
                self.parent.updateTrack(self.uid, tag)
            return True
        except:
            return False

    def detectSong(self, analysis_unused): # Parameter kept for compatibility if subclasses call it
        """
            Placeholder for song detection. Original Echonest functionality removed.
            Metadata detection primarily relies on mutagen in getTag.
        """
        # The original implementation relied on self.original.analysis.metadata
        # which is no longer available with Librosa.
        # Subclasses might have their own ways to use the 'analysis' (now 'analysis_unused')
        # if they perform their own analysis and want to update tags.
        # For the base Remixer class, this function no longer has a specific role
        # in populating tags from Echonest.
        pass


    def processArt(self):
        """
            Tries to parse artwork from the incoming file.
            Saves artwork in a configurable location, along with a thumbnail.
            Useful for web frontends and the like.
            If an overlay is provided, that overlay is pasted on top of the artwork.

            Returns success value as a boolean.
        """
        try:
            if not self.mt:
                return False
            imgmime = False
            imgdata = False
            if self.extension == ".mp3":
                if "APIC:" in self.mt:
                    imgmime = self.mt['APIC:'].mime
                    imgdata = self.mt['APIC:'].data
            elif self.extension == ".m4a":
                if "covr" in self.mt:
                    if self.mt['covr'][0][0:4] == '\x89PNG':
                        imgmime = u'image/png'
                    elif self.mt['covr'][0][0:10] == '\xff\xd8\xff\xe0\x00\x10JFIF':  # I think this is right...
                        imgmime = u'image/jpeg'
                    imgdata = self.mt['covr'][0]
            if imgmime and imgdata:
                self.artmime = imgmime
                ext = mimetypes.guess_extension(imgmime)
                if not ext:
                    raise Exception("Unknown artwork format!")
                artname = path.join(self.tempdir, "%s%s" % (self.uid, ext))
                self.artpath = path.join(self.outdir, "%s%s" % (self.uid, ext))
                self.thumbpath = path.join(self.outdir, "%s.thumb%s" % (self.uid, ext))

                artwork = open(artname, "w")
                artwork.write(imgdata)
                artwork.close()
                
                if self.overlay:
                    overlay = Image.open(self.overlay)
                    artwork = Image.open(artname).resize(overlay.size, Image.BICUBIC)
                    artwork.paste(overlay, None, overlay)

                artwork.save(self.artpath)
                artwork.resize((config.thumbnail_size,config.thumbnail_size), Image.ANTIALIAS).convert("RGB").save(self.thumbpath)

                unlink(artname)

                self.tag["art"] = self.artpath
                self.tag["thumbnail"] = self.thumbpath
                self.artprocessed = True
                if hasattr(self.parent, 'updateTrack'):
                    self.parent.updateTrack(self.uid, self.tag)
                return True
        except:
            logging.getLogger().warning("Artwork processing failed for %s:\n%s" % (self.uid, traceback.format_exc()))
            self.artprocessed = False
            return False

    def updateTags(self, titleSuffix=''):
        """
            Updates the MP3 tag.
            Can use a mutagen tag (mt) from an MP3 or an M4A.
        """
        try:
            self.tag['new_title'] = "%s%s" % (
              (self.tag['title']
                if ('title' in self.tag and self.tag['title'].strip() != '')
                else '[untitled]'),
              titleSuffix
            )

            if 'TIT2' in self.mt:
                self.mt['TIT2'].text[0] += titleSuffix
            elif '\xa9nam' in self.mt:
                self.mt['\xa9nam'][0] += titleSuffix

            outtag = File(self.outfile)  
            outtag.add_tags()
            outtag.tags.add(id3.TBPM(encoding=0, text=str(self.template['tempo'])))
            if self.extension == ".mp3":
                for k, v in self.mt.items():
                    if k != 'APIC:':
                        outtag.tags.add(v)
            elif self.extension == ".m4a":
                tags = {
                    '\xa9alb': id3.TALB,
                    '\xa9ART': id3.TPE1,
                    '\xa9nam': id3.TIT2,
                    '\xa9gen': id3.TCON                    
                }
                for k, v in self.mt.items():
                    if k in tags:
                        outtag.tags.add(tags[ k ](encoding=0, text=v[0]))
                if 'trkn' in self.mt:
                    if type(self.mt['trkn'][0] == tuple):
                        outtag.tags.add(id3.TRCK(encoding=0, text=("%s/%s" % (self.mt['trkn'][0][0], self.mt['trkn'][0][1]))))
                    else:
                        outtag.tags.add(id3.TRCK(encoding=0, text=(self.mt['trkn'][0])))
                if 'disk' in self.mt:
                    if type(self.mt['disk'][0] == tuple):
                        outtag.tags.add(id3.TPOS(encoding=0, text=("%s/%s" % (self.mt['disk'][0][0], self.mt['disk'][0][1]))))
                    else:
                        outtag.tags.add(id3.TPOS(encoding=0, text=(self.mt['disk'][0])))     

            if self.artprocessed:
                outtag.tags.add(
                    id3.APIC(
                        encoding=3, # 3 is for utf-8
                        mime=self.artmime, # image/jpeg or image/png
                        type=3, # 3 is for the cover image
                        desc=u'Cover',
                        data=open(self.artpath).read()
                    )
                )
            outtag.save()
        except:
            pass

    def loudness(self, y, sr, segments_time, target_indices):
        """
            Calculates the average RMS energy for specified segments.
            'y' is the audio waveform (NumPy array).
            'sr' is the sample rate.
            'segments_time' is a list of (start_time, end_time) tuples for audio segments.
            'target_indices' is a list of indices into 'segments_time' to calculate loudness for.

            This is a placeholder replacement for the Echonest-based loudness.
            Actual usage will depend on how segments/bars are defined by subclasses using Librosa.
        """
        if y is None or sr is None:
            logging.warning("Loudness calculation skipped: audio data not available.")
            return None

        all_rms = []
        for i in target_indices:
            if i < 0 or i >= len(segments_time):
                logging.warning("Loudness calculation: invalid segment index %d" % i)
                continue
            
            start_time, end_time = segments_time[i]
            start_sample = librosa.time_to_samples(start_time, sr=sr)
            end_sample = librosa.time_to_samples(end_time, sr=sr)
            
            if end_sample > start_sample:
                segment_audio = y[..., start_sample:end_sample]
                if segment_audio.size > 0:
                    rms = librosa.feature.rms(y=segment_audio)
                    if rms.size > 0:
                        all_rms.append(np.mean(rms))

        if len(all_rms) > 0:
            return float(np.mean(all_rms))
        else:
            logging.warning("Loudness calculation: No valid RMS values found for the given segments.")
            return None


class CMDRemix():
    """
        Remix from the command line with this handy little class.
        Instantiate this class from any remixer, and this wraps around
        the remixer, pushes progress updates to the console, and allows
        command line based remixing. Very basic, but useful.

        Instantiate the class, but don't try to call any functions, i.e.:
            if __name__ == "__main__":
                CMDRemix(Dubstep)
        will handle all command line remixing for the "Dubstep" remixer.
    """
    def __init__(self, remixer):
        """
            Handles command line argument parsing and sets up a new remixer.
        """
        if len(sys.argv) < 2:
            print("Error: no file specified!")
            print(("Usage: python -m remixers.%s <song.[mp3|m4a|wav|aif]>" % str(remixer.__name__.lower())))
        elif not path.exists(sys.argv[1]):
            print("Error: song does not exist!")
        else:
            r = remixer(self, sys.argv[1], callbacks=self.log)
            r.deleteOriginal = False
            r.start()
            r.join()

    def log(self, s):
        """
            Prints progress updates to the console.
        """
        print(("(%s%%) %s" % (round(s['progress']*100, 2), s['text'])))

if __name__ == "__main__":
    raise Exception("This class is a superclass of all remixers. Call the appropriate remixer instead.")
