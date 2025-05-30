"""
blank.py

Blank remix template.
Dependencies:
    Remixer
    lame (command line binary)
"""

from remixer import *

class Blank(Remixer):
    def remix(self):
        """
            Remixing happens here. Take your input file from self.infile and write your remix to self.outfile.
            If necessary, self.tempfile can be used for temp files. 
        """
        # Open files in binary mode for WAV/MP3 files
        with open(self.infile, 'rb') as f_in:
            with open(self.outfile, 'wb') as f_out:
                f_out.write(f_in.read())
        return True # Indicate success

if __name__ == "__main__":
    CMDRemix(Blank)

