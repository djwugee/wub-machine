"""
fastmodify.py

Provides functionality for audio modification.
Requires soundstretch command-line binary to be installed.

Based on code by Ben Lacker on 2009-06-12.
Modified by Peter Sobot for speed on 2011-08-12
"""
import librosa
import numpy as np
import soundfile as sf
import uuid
import os
import subprocess

class FastModify():
    def processAudio( self, y, sr, arg, tempdir="tmp/" ):
        if not os.access( tempdir, os.W_OK ):
            tempdir = './'
        u = str( uuid.uuid1() )
        
        # Transpose y if it's (channels, samples) for soundfile
        y_to_write = y.T if y.ndim == 2 and y.shape[0] < y.shape[1] else y
        sf.write( '%s%s.wav' % ( tempdir, u ), y_to_write, sr )
        
        process = subprocess.Popen(   ['soundstretch', '%s%s.wav' % ( tempdir, u ), '%s%s.out.wav' % ( tempdir, u ), arg],
                            stdin=None,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE
                        )
        # Capture stdout and stderr to check for errors
        stdout, stderr = process.communicate()
        retcode = process.wait()
        if retcode != 0:
            # Consider logging stdout and stderr here for debugging
            print("Error during soundstretch processing:")
            print("STDOUT:", stdout.decode() if stdout else "N/A")
            print("STDERR:", stderr.decode() if stderr else "N/A")
            # Potentially raise an exception if soundstretch failed
            raise Exception("soundstretch command failed with return code %s" % retcode)

        os.unlink( '%s%s.wav' % ( tempdir, u ) )
        y_out, sr_out = librosa.load( '%s%s.out.wav' % ( tempdir, u ), sr=None, mono=False )
        os.unlink( '%s%s.out.wav' % ( tempdir, u ) )
        return y_out, sr_out

    def shiftTempo(self, y, sr, ratio):
        if not isinstance(y, np.ndarray):
            raise TypeError('First argument must be a NumPy array.')
        # Add check for sr
        if not isinstance(sr, (int, float)):
            raise TypeError('Second argument (sr) must be an int or float (sample rate).')
        if not (isinstance(ratio, int) or isinstance(ratio, float)):
            raise ValueError('Ratio must be an int or float.')
        if (ratio < 0) or (ratio > 10): # soundstretch might have its own limits, but this was original logic
            raise ValueError('Ratio must be between 0 and 10.')
        return self.processAudio(y, sr, '-tempo=%s' % float((ratio-1)*100))

