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
        
        # Write the modified audio to self.tempfile (WAV)
        # Soundfile expects (samples, channels) or (samples,) for mono.
        # Librosa y_doubled is (channels, samples) for stereo or (samples,) for mono.
        # Transpose if stereo.
        if y_doubled.ndim > 1:
            sf.write(self.tempfile, y_doubled.T, sr_doubled)
        else:
            sf.write(self.tempfile, y_doubled, sr_doubled)

        # self.log("Cleaning up...", 25) # No explicit unload needed for NumPy arrays
        # The original log for "Cleaning up" was 25%, if we remove it, we might need to adjust progress elsewhere
        # For now, let's keep the progress consistent by logging another step or adjusting existing ones.
        # Let's say FastModify and writing to tempfile is 50% of the remix specific work.
        # So, previous log was 25. This step (tempo shift + write) is another 25.
        self.log("Tempo shifted and saved to temp file.", 25)


        self.log("Encoding MP3...", 25) # This was originally 25%

        # Encode the temporary file (WAV) into the output file (MP3)
        self.lame(self.tempfile, self.outfile)
        
        # The base class's _remix method sets self.tag['remixed'] = self.remix().
        # Returning True indicates success.
        return True

if __name__ == "__main__":
    CMDRemix(DoubleTime)


