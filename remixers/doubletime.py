"""
doubletime.py

Double-speed remix template.
Dependencies:
    FastModify
    Remixer
    lame (command line binary)
    soundstretch (command line binary)
"""

from remixer import *
from helpers.fastmodify import FastModify # Updated import path
import librosa
import numpy as np
import soundfile as sf

class DoubleTime(Remixer):
    speedFactor = 2
    def remix(self):
        """
            Remixing happens here. Take your input file from self.infile and write your remix to self.outfile.
            NumPy arrays are used for audio data.
        """
        # Load audio using Librosa
        y, sr = librosa.load(self.infile, sr=None, mono=False) # Load as stereo/mono based on file

        # Tell somebody about our progress (add 25%)
        self.log("Shifting tempo...", 25)

        # Use FastModify (now Librosa-based) to stretch audio
        # FastModify().shiftTempo returns (y_modified, sr_modified)
        y_doubled, sr_doubled = FastModify().shiftTempo(y, sr, self.speedFactor)
        
        # Use partialEncode and mixwav for consistency and robustness
        self.log("Saving temporary file...", 25)
        self.partialEncode(y_doubled, sr_doubled)
        self.mixwav(self.tempfile)


        self.log("Encoding MP3...", 25) # This was originally 25%

        # Encode the temporary file (WAV) into the output file (MP3)
        self.lame(self.tempfile, self.outfile)
        
        # The base class's _remix method sets self.tag['remixed'] = self.remix().
        # Returning True indicates success.
        return True

if __name__ == "__main__":
    CMDRemix(DoubleTime)


