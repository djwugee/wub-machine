"""
dubstep.py <ex: dubstepize.py, wubmachine.py, wubwub.py, etc...>

Turns a song into a dubstep remix.
ElectroHouse inherits from the Remixer class.
Dependencies:
    FastModify
    Remixer
    lame (command line binary)
    shntool (command line binary)
    soundstretch (command line binary)

by Peter Sobot <hi@petersobot.com>
    v1: started Jan. 2011
    v2: August 2011
based off of code by Ben Lacker, 2009-02-24.
"""

from remixer import * # Imports Remixer, CMDRemix
from helpers.fastmodify import FastModify
# from echonest.modify import Modify # Removed
# from echonest.action import make_stereo # Removed
# import numpy # Retain for direct numpy use if any, though np is conventional -> Removed, use np from now on
import librosa
import numpy as np # Standard alias for numpy
import soundfile as sf

tempo = 128.0 # BPM
FIXED_SR = 44100 # Global sample rate for rests and potentially for processed notes if not dynamic

def _ensure_stereo(y_audio):
    if y_audio.ndim == 1: # Mono
        return np.vstack([y_audio, y_audio])
    elif y_audio.ndim == 2 and y_audio.shape[0] == 1: # Mono represented as (1, N)
        return np.vstack([y_audio[0], y_audio[0]])
    return y_audio # Already stereo or other format (e.g. (2, N))

# Audio Division Helper Functions (NumPy based)
# These functions will now take (y_audio, sr_audio) and return (y_processed, sr_audio)
# y_audio is expected to be (channels, samples) or (samples,) for mono

def half_of(y_audio_tuple):
    # y_audio, sr_audio = y_audio_tuple # No need to unpack here
    return divide(y_audio_tuple, 2)[0] # divide will return list of (y,sr) tuples

def third_of(y_audio_tuple):
    return divide(y_audio_tuple, 3)[0]

def quarter_of(y_audio_tuple):
    return divide(y_audio_tuple, 4)[0]

def eighth_of(y_audio_tuple):
    return divide(y_audio_tuple, 8)[0]

# Note duration functions based on cutnote
def eighth_triplet(y_audio_tuple): return cutnote(y_audio_tuple, 6)
def quarter_triplet(y_audio_tuple): return cutnote(y_audio_tuple, 3)
def sixteenth_note(y_audio_tuple): return cutnote(y_audio_tuple, 4)
def eighth_note(y_audio_tuple): return cutnote(y_audio_tuple, 2)
# Dotted eighth note is 0.75 of a beat. So, 1 / 0.75 = 4/3 such notes fit in a beat.
# length_division_factor is "how many of these notes fit in a beat"
def dotted_eighth_note(y_audio_tuple): return cutnote(y_audio_tuple, 1.0/0.75) 
def quarter_note(y_audio_tuple): return cutnote(y_audio_tuple, 1)

def cutnote(y_audio_tuple, length_division_factor):
    """
    Cuts a note from y_audio to a specific rhythmic length.
    y_audio_tuple: (NumPy array, sample_rate) - the audio data to cut from.
                   Array shape (channels, samples) or (samples,) if mono.
    length_division_factor: How many of these notes fit in a beat.
                            e.g., 4 for sixteenth_note (cuts 1/4 of a beat's length).
    Returns: (NumPy array, sample_rate) - the cut audio segment, stereo.
    """
    y_audio, sr_audio = y_audio_tuple
    
    beatlength_samples = int((float(sr_audio) * 60.0) / tempo) 
    desired_length_samples = int(beatlength_samples / length_division_factor)

    if y_audio.ndim > 1: # (channels, samples)
        y_cut = y_audio[:, :desired_length_samples]
        current_length_samples = y_cut.shape[1]
    else: # (samples,) mono
        y_cut = y_audio[:desired_length_samples]
        current_length_samples = y_cut.shape[0]

    if current_length_samples < desired_length_samples:
        samples_to_pad = desired_length_samples - current_length_samples
        if y_audio.ndim > 1: 
            num_channels = y_audio.shape[0]
            padding = np.zeros((num_channels, samples_to_pad), dtype=y_audio.dtype)
            y_cut = np.concatenate((y_cut, padding), axis=1)
        else: 
            padding = np.zeros(samples_to_pad, dtype=y_audio.dtype)
            y_cut = np.concatenate((y_cut, padding))
            
    return _ensure_stereo(y_cut), sr_audio

def divide(y_audio_tuple, by_factor):
    """
    Divides y_audio into 'by_factor' equal parts.
    y_audio_tuple: (NumPy array, sample_rate)
    by_factor: integer number of parts to divide into.
    Returns: list of (NumPy array, sample_rate) tuples.
    """
    y_audio, sr_audio = y_audio_tuple
    
    total_samples = y_audio.shape[-1] 
    # Ensure samples_per_part is integer, handle potential empty y_audio
    samples_per_part = total_samples // by_factor if total_samples > 0 else 0
    if samples_per_part == 0 and total_samples > 0 and by_factor > 0 : # If total_samples < by_factor
        samples_per_part = 1 # Ensure at least 1 sample if possible, or handle as error/empty
        # print "Warning: total_samples < by_factor in divide(). Resulting parts might be very short or empty."


    divided_parts = []
    for i in xrange(by_factor): 
        start_sample = i * samples_per_part
        end_sample = (i + 1) * samples_per_part if i < by_factor - 1 else total_samples
        
        # Ensure end_sample does not exceed total_samples, esp. with integer division
        end_sample = min(end_sample, total_samples)
        # Ensure start_sample does not exceed end_sample
        start_sample = min(start_sample, end_sample)

        if y_audio.ndim > 1: 
            part_y = y_audio[:, start_sample:end_sample]
        else: 
            part_y = y_audio[start_sample:end_sample]
        divided_parts.append( (part_y, sr_audio) )
    return divided_parts

# Rests: NumPy arrays (stereo float32) at FIXED_SR
# duration_division_factor: how many of these rests fit into one beat.
def _create_rest(duration_division_factor, sr=FIXED_SR): 
    beatlength_samples = (float(sr) * 60.0) / tempo
    num_samples = int(beatlength_samples / duration_division_factor)
    return np.zeros((2, num_samples), dtype=np.float32) 

quarter_rest_y = _create_rest(1.0) 
eighth_rest_y = _create_rest(2.0)
# Dotted eighth rest: duration is 0.75 of a beat. So, 1/0.75 of these fit in a beat.
dotted_eighth_rest_y = _create_rest(1.0 / 0.75) 
quarter_triplet_rest_y = _create_rest(3.0) 
sixteenth_rest_y = _create_rest(4.0)

rhythm_map = {
    1: sixteenth_note, 2: eighth_note, 
    3: dotted_eighth_note, 4: quarter_note
}
rest_map = { # Stores (numpy_array, sample_rate) tuples
    1: (sixteenth_rest_y, FIXED_SR), 2: (eighth_rest_y, FIXED_SR), 
    3: (dotted_eighth_rest_y, FIXED_SR), 4: (quarter_rest_y, FIXED_SR)
    # Add more if pattern files use other length keys for rests.
}

class note():
  def __init__(self, pitch_value=None, length_key=1): # length_key matches keys in rhythm_map/rest_map
        self.pitch = pitch_value # MIDI note number (0-11 relative to tonic) or None for rest
        self.length_key = length_key # Key for rhythm_map and rest_map (e.g., 1, 2, 3, 4)
        
        # self.data_tuple will be a tuple (numpy_array_for_rest, sample_rate)
        # self.function will be a function like sixteenth_note, quarter_note, etc.
        if length_key in rest_map:
            self.data_tuple = rest_map[length_key] 
        else:
            # Fallback if length_key is somehow invalid, use a default rest
            print "Warning: Invalid length_key '%s' for note rest. Defaulting to sixteenth_rest (key 1)." % length_key
            self.data_tuple = rest_map[1] # Default to a 16th note rest

        if length_key in rhythm_map:
            self.function = rhythm_map[length_key]
        else:
            # Fallback to a default function
            print "Warning: Invalid length_key '%s' for note function. Defaulting to sixteenth_note (key 1)." % length_key
            self.function = rhythm_map[1] # Default to a 16th note function

  def __repr__(self):
        # For clarity, length_key maps to specific rhythmic values.
        return "len_key:%s, pitch:%s" % (self.length_key, self.pitch if self.pitch is not None else "Rest")

def readPattern(filename):
    f = open(filename)
    f.readline()
    # Two spaces for each beat.
    # number 1 through 12 means that note (rather, that interval from root, 1-indexed)
    # dash means continue previous
    pattern_chars = []
    for s in f:
        if "+" in s or '#' in s or s == "\n": # Skip comment/separator lines
            continue
        # This parsing creates pairs of characters, e.g., "1 ", "- ", "  "
        # Each pair represents a 16th note position in the pattern.
        pattern_chars.extend([''.join(x) for x in zip(*[list(s[z::2]) for z in xrange(2)])])
    f.close() # Close the file

    bar_notes = [] 
    for sixteenth_repr in pattern_chars:
        sixteenth_repr = sixteenth_repr.strip() # Remove leading/trailing whitespace like '\n' if any
        if not sixteenth_repr: # Skip if empty after strip (e.g. line ending was " \n")
            continue
        elif sixteenth_repr == "": # This case might be redundant due to strip, but keep for safety
            bar_notes.append(note(pitch_value=None, length_key=1)) 
        elif sixteenth_repr == "-": # Continuation
            if not bar_notes:
                print "Warning: Pattern continuation '-' found at the beginning of a bar. Treating as rest."
                bar_notes.append(note(pitch_value=None, length_key=1))
                continue
            last_note_obj = bar_notes.pop()
            # Increment length_key. Original: last.length+1.
            # This needs a defined mapping for how length keys progress.
            # Example: 1 (16th) -> 2 (8th), 2 (8th) -> 4 (quarter).
            # Dotted (key 3) is tricky with simple +1.
            # For now, a simple +1, capped at 4 (quarter note). This might need refinement.
            new_length_key = last_note_obj.length_key + 1 
            if new_length_key == 3 and last_note_obj.length_key == 2: # 8th + 16th = dotted 8th
                pass # new_length_key is fine
            elif new_length_key > 4: 
                new_length_key = 4 
            
            bar_notes.append(note(pitch_value=last_note_obj.pitch, length_key=new_length_key ))
        else: # Pitched note
            try:
                # Pitches in pattern are 1-12 relative to tonic. Convert to 0-11 for calculations.
                pitch_val_from_pattern = int(sixteenth_repr)
                # Storing pitch as 0-11 relative to pattern's '1' (which is tonic later)
                bar_notes.append(note(pitch_value=pitch_val_from_pattern -1, length_key=1)) # Default length_key 1 (16th)
            except ValueError:
                print "Warning: Could not parse pitch from pattern: '%s'. Treating as rest." % sixteenth_repr
                bar_notes.append(note(pitch_value=None, length_key=1))
    return bar_notes

class ElectroHouse(Remixer):
    template = {
        'tempo':        128,
        'beat':        ['beat_%s.wav' % i for i in xrange(0, 4)],
        'intro': 'intro_16.wav',
        'splash':     'splash.wav',
        'build':      'build.wav',
        'body' : [
          'body/c.wav',
          'body/c-sharp.wav',
          'body/d.wav',
          'body/d-sharp.wav',
          'body/e.wav',
          'body/f.wav',
          'body/f-sharp.wav',
          'body/g.wav',
          'body/g-sharp.wav',
          'body/a.wav',
          'body/a-sharp.wav',
          'body/b.wav'
        ],
        'mixpoint': 18,     # "db factor" of wubs - 0 is softest wubs, infinity is... probably extremely loud 
        'target': "beats",
        'splash_ends':  [  'splash-ends/1.wav',
                            'splash-ends/2.wav',
                            'splash-ends/3.wav',
                            'splash-ends/4.wav'
                        ],
    }
    st = None
    sampleCache = {} # Will store:
                     # 1. Key: "_sectionidx-pitch" -> Value: list of (start,end) time tuples (from searchSamples)
                     # 2. Key: "__sectionbounds_tuple_str-pitch-target" -> Value: list of (start,end) time tuples (from getSamples)
                     # 3. Key: "segment_times_tuple_str_pitch_targettempo" -> Value: (y_processed_audio, sr) (tempo-shifted, cut notes)

    def searchSamples(self, section_idx, initial_key):
        """
            Finds all relevant source audio segments (as (start_time, end_time) tuples)
            of a given key in a given section.
            Uses caching for the list of (start_time, end_time) tuples.
            This version is adapted from dubstep.py's implementation.
        """
        cache_key = "_%s-%s" % (section_idx, initial_key)
        if cache_key in self.sampleCache:
            return self.sampleCache[cache_key]

        # self.sections, self.bar_times, self.y, self.sr must be initialized in self.remix()
        # before this method is called.
        pool_time_bounds = None
        # Ensure self.sections exists and section_idx is valid
        if hasattr(self, 'sections') and self.sections and 0 <= section_idx < len(self.sections):
            pool_time_bounds = self.sections[section_idx]
        elif hasattr(self, 'bar_times') and self.bar_times: # Fallback to bars
            # Using section_idx to pick a bar if sections are not aligned or available.
            idx_to_use = section_idx % len(self.bar_times) if len(self.bar_times) > 0 else 0
            if 0 <= idx_to_use < len(self.bar_times):
                 pool_time_bounds = self.bar_times[idx_to_use]
                 # print "Warning: Section %s not found, falling back to bar %s for searchSamples." % (section_idx, idx_to_use)
            else: # Fallback to entire track if no bars
                 # print "Warning: No sections or bars available. Searching full track in searchSamples for section_idx %s." % section_idx
                 pool_time_bounds = (0, librosa.get_duration(y=self.y, sr=self.sr) if hasattr(self, 'y') else 10.0) # Default 10s if y not ready
        else: # Fallback to entire track if no sections or bars
            # print "Warning: No sections or bars available. Searching full track in searchSamples for section_idx %s." % section_idx
            pool_time_bounds = (0, librosa.get_duration(y=self.y, sr=self.sr) if hasattr(self, 'y') else 10.0)


        key_to_try = initial_key
        # `target` is defined in self.template (e.g., "beats", "bars")
        found_samples_times = self.getSamples(pool_time_bounds, key_to_try, target=self.template.get('target', "beats"))
        
        # Try fifths if no samples found
        for _ in xrange(5): # Try up to 5 fifths
            if len(found_samples_times): break
            key_to_try = (key_to_try + 7) % 12 # Move by a perfect fifth
            found_samples_times = self.getSamples(pool_time_bounds, key_to_try, target=self.template.get('target', "beats"))
        
        # If still no samples, try chromatic steps in the same pool_time_bounds
        # Original logic also iterated through other sections here, which was more complex.
        # This simplified version only tries other keys in the *same* section/pool.
        if not len(found_samples_times):
            key_to_try = initial_key # Reset to initial key
            for _ in xrange(12): 
                if len(found_samples_times): break # Found some samples
                found_samples_times = self.getSamples(pool_time_bounds, key_to_try, target=self.template.get('target', "beats"))
                key_to_try = (key_to_try + 1) % 12 # Chromatic step
        
        self.sampleCache[cache_key] = found_samples_times
        return found_samples_times

    def getSamples(self, section_time_bounds, pitch_class, target="beats"):
        """
            Finds all beats/bars in a given time-defined section that match a given pitch class.
            section_time_bounds: tuple (start_time, end_time) defining the search window.
            pitch_class: integer 0-11 representing the target pitch class (C=0, C#=1, ...).
            target: string "beats" or "bars", indicating what rhythmic elements to analyze.
            Returns a list of (start_time, end_time) tuples for matching segments.
            Caches results. This version is adapted from dubstep.py.
        """
        cache_key = "__%s-%s-%s" % (str(section_time_bounds), pitch_class, target)
        if cache_key in self.sampleCache:
            return self.sampleCache[cache_key]

        matching_segments_times = []
        if not hasattr(self, 'y') or not hasattr(self, 'sr'): # Ensure audio is loaded
            return matching_segments_times

        section_start_time, section_end_time = section_time_bounds

        # Determine which set of rhythmic elements to check (beats or bars)
        elements_to_analyze = []
        if target == "beats":
            if not hasattr(self, 'beat_times') or not self.beat_times: return []
            # Convert beat_times (list of start times) to (start_time, end_time) tuples
            # Use detected tempo for beat duration, or a default if tempo is bad
            current_tempo = self.tempo if hasattr(self, 'tempo') and self.tempo and self.tempo > 0 else 120.0
            beat_duration = 60.0 / current_tempo 
            for i, start_t in enumerate(self.beat_times):
                end_t = self.beat_times[i+1] if i+1 < len(self.beat_times) else start_t + beat_duration
                elements_to_analyze.append((start_t, end_t))
        elif target == "bars":
            if not hasattr(self, 'bar_times') or not self.bar_times: return []
            elements_to_analyze = self.bar_times # self.bar_times should be list of (start,end)
        
        for elem_start_time, elem_end_time in elements_to_analyze:
            # Check if the element's midpoint is within the given section_time_bounds
            elem_mid_point = (elem_start_time + elem_end_time) / 2.0
            # Ensure element overlaps with the section, not just midpoint
            # Overlap condition: elem_start < section_end and elem_end > section_start
            if elem_start_time < section_end_time and elem_end_time > section_start_time:
                
                # Confine the element to the section boundaries for analysis
                analysis_start_time = max(elem_start_time, section_start_time)
                analysis_end_time = min(elem_end_time, section_end_time)

                if analysis_start_time >= analysis_end_time: continue # Skip if no overlap

                start_sample = librosa.time_to_samples(analysis_start_time, sr=self.sr)
                end_sample = librosa.time_to_samples(analysis_end_time, sr=self.sr)
                
                if start_sample < end_sample and start_sample < self.y.shape[1] and end_sample <= self.y.shape[1]:
                    segment_audio = self.y[:, start_sample:end_sample] 
                    segment_audio_mono = librosa.to_mono(segment_audio)

                    if segment_audio_mono.size > 0:
                        chromagram = librosa.feature.chroma_stft(y=segment_audio_mono, sr=self.sr)
                        segment_chroma_energies = np.sum(chromagram, axis=1)
                        dominant_pitch_class_in_segment = np.argmax(segment_chroma_energies)
                        
                        if dominant_pitch_class_in_segment == pitch_class:
                            # Return the original element times, not the analysis window times
                            matching_segments_times.append((elem_start_time, elem_end_time)) 
        
        self.sampleCache[cache_key] = matching_segments_times
        return matching_segments_times

    def mixfactor(self, segment_time_bounds): # Changed arg from Echonest segment
        """
            Computes a rough "mixfactor" - the balance between wubs and original audio for a given segment.
            Mixfactor returned:
              1: full wub
              0: full original
            Result can be fed into echonest.audio.mix() as the third parameter.
        """
        mixfactor = 0
        a = (89.0/1.5) + self.template['mixpoint']
        b = (188.0/1.5) + self.template['mixpoint']
        loud = self.loudness(self.original.analysis.segments, segment)
        if not loud:
            loud = self.original.analysis.loudness
        if loud != -1 * b:
            mixfactor = float(float(loud + a)/float(loud + b))
        if mixfactor > 0.8:
            mixfactor = 0.8
        elif mixfactor < 0.3:
            mixfactor = 0.3
        return mixfactor

    def compileIntro(self, section=0, intro=None):
        if not intro:
            intro = audio.AudioData(self.sample_path + self.template['intro'], sampleRate=44100, numChannels=2, verbose=False)
        out = audio.AudioQuantumList()
        section_hash_keys = []

        for i, item in enumerate(readPattern('samples/electrohouse/intro.txt')):
            if item.pitch is None:
                out.append(item.data)
            else:
                samples = self.searchSamples(section, (item.pitch + self.tonic) % 12) 
                if not samples:
                    out.append(item.data)
                else:
                    hash_key = str(samples[i%len(samples)])
                    if not hash_key in self.sampleCache:
                        self.sampleCache[hash_key] = self.st.shiftTempo(samples[i%len(samples)].render(), self.template['tempo']/self.tempo)
                        section_hash_keys.append(hash_key)
                    out.append(
                      item.function(
                        self.sampleCache[hash_key]
                      )
                    )
        shifted = audio.assemble(out, numChannels = 2)
        if shifted.numChannels == 1:    
            shifted = self.mono_to_stereo(shifted)
        for hash_key in section_hash_keys:
            del self.sampleCache[hash_key]
        return self.truncatemix(intro, shifted, 0.3)

    def compileSection(self, j, section, backing):
        out = audio.AudioQuantumList()
        section_hash_keys = []

        for i, item in enumerate(readPattern('samples/electrohouse/section.txt')):
            if item.pitch is None:
                out.append(item.data)
            else:
                samples = self.searchSamples(j, (item.pitch + self.tonic) % 12)
                if not samples:
                    out.append(item.data)
                else:
                    hash_key = str(samples[i%len(samples)])
                    if not hash_key in self.sampleCache:
                        self.sampleCache[hash_key] = self.st.shiftTempo(samples[i%len(samples)].render(), self.template['tempo']/self.tempo)
                        section_hash_keys.append(hash_key)
                    out.append(
                      item.function(
                          self.sampleCache[hash_key]
                      )
                    )
        shifted = audio.assemble(out, numChannels = 2)
        if shifted.numChannels == 1:
            shifted = self.mono_to_stereo(shifted)
        for hash_key in section_hash_keys:
            del self.sampleCache[hash_key]
        return self.truncatemix(backing, shifted, 0.3)

    def remix(self):
        """
            Wub wub wub wub wub wub wub wub wub wub wub wub wub wub wub wub wub wub.
        """
        self.log("Looking up track...", 5)
        self.getTag()
        self.processArt()

        self.log("Listening to %s..." % ('"%s"' % self.tag['title'] if 'title' in self.tag else 'song'), 5)
        self.original = audio.LocalAudioFile(self.infile, False)
        if not 'title' in self.tag:
            self.detectSong(self.original)
        self.st = FastModify()
        
        self.log("Choosing key and tempo...", 10)
        self.tonic = self.original.analysis.key['value']
        self.tempo = self.original.analysis.tempo['value']
        if not self.tempo:
            self.tempo = 128.0
        self.bars = self.original.analysis.bars
        self.beats = self.original.analysis.beats
        self.sections = self.original.analysis.sections
        self.tag['key'] = self.keys[self.tonic] if self.tonic >= 0 and self.tonic < 12 else '?'
        if 'title' in self.tag and self.tag['title'] == u'I Wish':
            self.tonic += 2
            self.tag['key'] = 'D#'
        self.tag['tempo'] = self.template['tempo']

        self.log("Arranging intro...", 40.0/(len(self.sections) + 1))
        intro = audio.AudioData(self.sample_path + self.template['intro'], sampleRate=44100, numChannels=2, verbose=False)
        self.partialEncode(self.compileIntro(0, intro))

        i = 0 # Required if there are no sections
        sections = self.sections[1:] if len(self.sections) % 2 else self.sections
        if len(sections) > 2:
            backing = audio.AudioData(self.sample_path + self.template['body'][self.tonic], sampleRate=44100, numChannels=2, verbose=False)
            for i, section in enumerate(sections):
                self.log("Arranging section %s of %s..." % (i+1, len(sections)), 40.0/(len(sections) + 1))
                a = self.compileSection(i, section, backing) if i != (len(sections)/2 + 1) else self.compileIntro(i, intro)
                self.partialEncode(a)
                del a
        self.original.unload()

        self.log("Adding ending...", 5)
        self.partialEncode(
            audio.AudioData(
                self.sample_path + self.template['splash_ends'][(i + 1) % len(self.template['splash_ends'])],
                sampleRate=44100,
                numChannels=2,
                verbose=False
            )
        )
        
        self.log("Mixing...", 5)
        self.mixwav(self.tempfile)

        if self.deleteOriginal:
            try:
                unlink(self.infile)
            except:
                pass  # File could have been deleted by an eager cleanup script

        self.log("Mastering...", 5)
        self.lame(self.tempfile, self.outfile)
        unlink(self.tempfile)
        
        self.log("Adding artwork...", 20)
        self.updateTags(titleSuffix = " (Wub Machine Electro Remix)")
        
        return self.outfile

if __name__ == "__main__":
    CMDRemix(ElectroHouse)

