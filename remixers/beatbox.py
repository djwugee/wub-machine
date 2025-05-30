"""
Dependencies:
    Remixer
    lame (command line binary)
"""

from remixer import * # Remixer class should now be Librosa-based
import librosa
import numpy as np
import soundfile as sf
# import math # Unused import
# numpy (as np) is used, sf for soundfile

def avg(xArr):
    return round(float(sum(xArr)/len(xArr)),1)

def stddev(xArr):
    return np.std(xArr) if len(xArr) > 0 else 0.0

# features: [rms_loud, centroid_bright, flatness, attack_proxy] (scaled)
# IMPORTANT: Thresholds below are initial guesses and WILL require tuning
# based on the scaled Librosa features from the previous step.

def are_kicks(features):
    # Original: bright = x.timbre[1] < 20, attack = x.timbre[3] > 80
    # features[1] is centroid_bright, features[3] is attack_proxy
    # Assuming scaling: centroid/100, attack_proxy*100
    # So, new bright condition: features[1] < 0.2 (orig Echonest bright was low for kicks)
    # And new attack condition: features[3] > 80 (orig Echonest attack was high for kicks)
    # Kick characteristics: low brightness (centroid), strong attack
    # Let's try to match:
    # brightness (spectral centroid) is low
    # attack (onset strength proxy) is high
    # loudness (rms) is relatively high
    is_low_brightness = features[1] < 30 # Lower spectral centroid (needs tuning)
    is_high_attack = features[3] > 50   # Higher onset strength (needs tuning)
    is_loud_enough = features[0] > 30 # RMS loudness (needs tuning)
    #return is_low_brightness and is_high_attack
    return is_loud_enough and is_low_brightness # Prioritizing loudness and low centroid for kicks

def are_snares(features):
    # Original: loud = x.timbre[0] > 10, bright = x.timbre[1] > 100 and x.timbre[1] < 150,
    # flat =  x.timbre[2] < 30, attack = x.timbre[3] > 20
    # Snare characteristics: mid-high brightness, moderate attack, presence of noise (flatter spectrum)
    # loudness (rms)
    # brightness (spectral centroid)
    # flatness (spectral flatness)
    # attack (onset strength proxy)
    is_loud = features[0] > 20 # (needs tuning)
    is_mid_high_brightness = features[1] > 50 and features[1] < 200 # (needs tuning)
    is_relatively_flat = features[2] > 0.3 # Higher flatness indicates noise (needs tuning)
    is_moderate_attack = features[3] > 30 # (needs tuning)
    #return is_loud and is_mid_high_brightness and is_relatively_flat and is_moderate_attack
    return is_loud and is_mid_high_brightness and is_relatively_flat

def are_hats(features):
    # Original: loud = x.timbre[0] < 45, bright = x.timbre[1] > 90,
    # flat =  x.timbre[2] < 0 (this was likely an error, flatness is usually > 0)
    # attack = x.timbre[3] > 70, what = x.timbre[4] < 40
    # Hat characteristics: high brightness, sharp attack, often less loud
    # Echonest flatness < 0 for hats seems odd. Spectral flatness is typically [0,1].
    # Let's assume it meant low tonal content or perhaps it was a different scale.
    # For Librosa, high flatness = more noise-like. Low flatness = more tonal.
    # Hats are noisy but also have sharp attacks.
    is_not_too_loud = features[0] < 70 # (needs tuning)
    is_high_brightness = features[1] > 150 # (needs tuning)
    # For flatness, Echonest's timbre[2] < 0 might have meant "very noisy" or "not tonal".
    # With Librosa's spectral_flatness (0 to 1), higher means more noise-like.
    # So we might want higher flatness for hats. Let's use features[2] > 0.5 as a starting point.
    is_noisy = features[2] > 0.4 # (needs tuning)
    is_sharp_attack = features[3] > 40 # (needs tuning)
    #return is_not_too_loud and is_high_brightness and is_noisy and is_sharp_attack
    return is_high_brightness and is_sharp_attack and is_noisy

class Beatbox(Remixer):
    template = {
      'hats': 'hat.wav',
      'kick': 'kick.wav',
      'snare': 'snare.wav'
        }

    def remix(self):
        """
            Remixing happens here. Take your input file from self.infile and write your remix to self.outfile.
            If necessary, self.tempfile can be used for temp files. 
        """
        self.y, self.sr = librosa.load(self.infile, sr=None, mono=False)
        # If y is mono, make it stereo for consistency with old code if needed downstream
        # However, most librosa features work fine with mono, and mixing logic will need to be mindful.
        # For now, let's assume functions will handle mono/stereo as appropriate.
        # If stereo is strictly required by later logic (e.g. mixing with stereo samples):
        if self.y.ndim == 1:
            self.y = np.vstack([self.y, self.y])


        #for i, segment in enumerate(self.original.analysis.segments):
        #    segment.encode("seg_%s.mp3" % i)
        print("\n\n\n") # Python 3 print
        #loudnesses = [x.timbre[0] for i, x in enumerate(self.original.analysis.segments)] # OLD ECHONEST
        # Replace with Librosa based segmentation and feature extraction
        # This will be a significant change. For now, I'll comment out the old timbre processing.
        # And prepare for new feature extraction.

        # Placeholder for segments (start_time, end_time)
        # This needs a proper segmentation strategy. Using silence splitting for now.
        # top_db=30 might need tuning.
        segment_intervals_rms = librosa.effects.split(self.y, top_db=30) # Returns (N, 2) array of start and end samples

        # Convert segment_intervals from samples to time for easier comparison with Echonest logic if needed
        segments_time = librosa.samples_to_time(segment_intervals_rms, sr=self.sr)

        # Extract features for each segment
        # This is a simplified example. Echonest timbre is a complex vector.
        # We'll try to map some features.
        # Echonest timbre: [loudness, brightness, flatness, attack, and 8 more]
        
        librosa_segments = []
        for i in range(segment_intervals_rms.shape[0]):
            start_sample, end_sample = segment_intervals_rms[i, 0], segment_intervals_rms[i, 1]
            segment_y = self.y[..., start_sample:end_sample] # Works for mono and stereo
            
            if segment_y.size == 0: continue # Skip empty segments

            # Ensure segment_y is mono for some feature extractions if they expect 1D array
            segment_y_mono = librosa.to_mono(segment_y) if segment_y.ndim > 1 else segment_y

            # 0: Loudness (RMS)
            rms = librosa.feature.rms(y=segment_y_mono)
            avg_rms = np.mean(rms) if rms.size > 0 else 0.0
            
            # 1: Brightness (Spectral Centroid)
            spectral_centroid = librosa.feature.spectral_centroid(y=segment_y_mono, sr=self.sr)
            avg_centroid = np.mean(spectral_centroid) if spectral_centroid.size > 0 else 0.0
            
            # 2: Flatness (Spectral Flatness)
            spectral_flatness = librosa.feature.spectral_flatness(y=segment_y_mono)
            avg_flatness = np.mean(spectral_flatness) if spectral_flatness.size > 0 else 0.0

            # 3: Attack (Onset strength - as a proxy, might need more sophisticated like librosa.onset.onset_strength)
            # For simplicity, let's use spectral flux (related to changes, could indicate attack)
            # Or, more directly, onset_strength. Onset strength is usually computed over frames.
            # Let's use Zero Crossing Rate as a simple proxy for "attack" or sharpness for now, it's not ideal.
            # Echonest's "attack" was likely more complex.
            # A better proxy for "attack" might be the max of the onset envelope over the segment.
            onset_env = librosa.onset.onset_strength(y=segment_y_mono, sr=self.sr)
            avg_attack_proxy = np.max(onset_env) if onset_env.size > 0 else 0.0


            # Store features in a dictionary or a simple list for now
            # The original code used x.timbre[0], x.timbre[1], etc.
            # We'll create a list of feature lists/arrays for each segment
            # For are_kicks etc. functions, we'll pass this feature list/array
            current_features = {
                "start": segments_time[i,0], # start time
                "end": segments_time[i,1], # end time
                "duration": segments_time[i,1] - segments_time[i,0],
                "librosa_features": [avg_rms * 100, avg_centroid / 100, avg_flatness * 10, avg_attack_proxy * 100] # Scaled to roughly match old ranges - NEEDS TUNING
                # Add more features if needed to mimic the 12 Echonest timbre dimensions
            }
            librosa_segments.append(current_features)

        # The old print statements:
        # Replace with new feature names and values
        if librosa_segments:
            # Assuming librosa_features in each segment dict is [rms, centroid, flatness, attack_proxy]
            # These names are for the printout, matching the feature order.
            feature_names = ['RMS_Loud', 'Centroid_Bright', 'Flatness', 'AttackProxy']
            
            # Extract each feature into its own list for avg/stddev calculation
            features_matrix = np.array([seg['librosa_features'][:len(feature_names)] for seg in librosa_segments])

            print("AVERAGES") # Python 3 print
            print("\t".join(feature_names)) # Python 3 print
            avg_values = [avg(features_matrix[:, i]) for i in range(features_matrix.shape[1])]
            print("\t".join(map(str, avg_values))) # Python 3 print
            print() # Python 3 print
            print("STDVS") # Python 3 print
            print("\t".join(feature_names)) # Python 3 print
            stddev_values = [stddev(features_matrix[:, i]) for i in range(features_matrix.shape[1])] # Make sure stddev is implemented
            print("\t".join(map(str, stddev_values))) # Python 3 print
            print() # Python 3 print

            print("\t" + "\t".join(feature_names)) # Python 3 print # Header for individual segments
            for seg_data in librosa_segments:
                # seg_data contains 'start', 'duration', 'librosa_features'
                features = seg_data['librosa_features']
                
                # Pass the features list to the classification functions
                # The classification functions will need to be updated to expect this list
                label = ""
                if are_kicks(features): label = "Kick"
                elif are_snares(features): label = "Snar"
                elif are_hats(features): label = "Hats"
                else: label = "else"
                # Python 3 print, note the end=" " for "Kick", "Snar" etc.
                print(label, end=" ") 
                print("\t" + "\t".join(map(lambda x: "%.2f" % x, features[:len(feature_names)]))) # Python 3 print
        else:
            print("No segments found by Librosa.") # Python 3 print

        # Update selection logic
        # The new `are_kicks` etc. will take the list/array of features
        kicks = [seg for seg in librosa_segments if are_kicks(seg['librosa_features'])]
        snares = [seg for seg in librosa_segments if are_snares(seg['librosa_features'])]
        hats = [seg for seg in librosa_segments if are_hats(seg['librosa_features'])]

        # Time to replace
        #hat_sample = audio.AudioData(self.sample_path + self.template['hats'], sampleRate=44100, numChannels=2, verbose=False) # OLD
        # Load samples using librosa - this will be done in the next step as per instructions.
        # For now, this part is reached.
        # The rest of the original code involving sample loading and mixing will be handled next.
        
        # Load samples using librosa, ensuring they are resampled to self.sr
        # And convert to stereo if they are mono, to match potential self.y stereo format
        def load_and_prepare_sample(path, target_sr):
            y, sr = librosa.load(path, sr=target_sr)
            if y.ndim == 1: # if mono
                y = np.vstack([y,y]) # convert to stereo
            return y

        hat_sample_y = load_and_prepare_sample(self.sample_path + self.template['hats'], self.sr)
        kick_sample_y = load_and_prepare_sample(self.sample_path + self.template['kick'], self.sr)
        snare_sample_y = load_and_prepare_sample(self.sample_path + self.template['snare'], self.sr)
  
        # Create an empty audio array matching self.y's properties
        # self.y could be mono (1D from librosa.load if mono=True) or stereo (2D)
        # The previous step ensured self.y is 2D (stereo)
        empty_audio = np.zeros_like(self.y) # self.y is already (channels, samples)

        # Mixing logic
        # The old code had a `last + len(sample.data) > segment.start` condition
        # This seems to be a flawed attempt to prevent overlaps from the *same* sample type if segments are too close.
        # A more robust way for preventing overlap would be to check if the current segment.start is too close to the *previous* segment.start
        # For now, I'll simplify and just add the sample at segment.start
        # The original Echonest segment.start was in seconds. librosa_segments also store start in seconds.

        for seg_data in kicks: # seg_data is a dict with 'start', 'duration', 'librosa_features'
            start_time = seg_data['start']
            start_sample = librosa.time_to_samples(start_time, sr=self.sr)
            end_sample = start_sample + kick_sample_y.shape[1] # kick_sample_y is (channels, samples)
            
            print("Adding kick at %s (sample %d)" % (start_time, start_sample)) # Python 3 print
            if end_sample <= empty_audio.shape[1]:
                empty_audio[:, start_sample:end_sample] += kick_sample_y
            else: # Handle cases where sample runs past end of empty_audio
                len_to_add = empty_audio.shape[1] - start_sample
                if len_to_add > 0:
                    empty_audio[:, start_sample:] += kick_sample_y[:, :len_to_add]
        
        for seg_data in snares:
            start_time = seg_data['start']
            start_sample = librosa.time_to_samples(start_time, sr=self.sr)
            end_sample = start_sample + snare_sample_y.shape[1]

            print("Adding snare at %s (sample %d)" % (start_time, start_sample)) # Python 3 print
            if end_sample <= empty_audio.shape[1]:
                empty_audio[:, start_sample:end_sample] += snare_sample_y
            else:
                len_to_add = empty_audio.shape[1] - start_sample
                if len_to_add > 0:
                    empty_audio[:, start_sample:] += snare_sample_y[:, :len_to_add]

        for seg_data in hats:
            start_time = seg_data['start']
            start_sample = librosa.time_to_samples(start_time, sr=self.sr)
            end_sample = start_sample + hat_sample_y.shape[1]

            print("Adding hat at %s (sample %d)" % (start_time, start_sample)) # Python 3 print
            if end_sample <= empty_audio.shape[1]:
                empty_audio[:, start_sample:end_sample] += hat_sample_y
            else:
                len_to_add = empty_audio.shape[1] - start_sample
                if len_to_add > 0:
                    empty_audio[:, start_sample:] += hat_sample_y[:, :len_to_add]
        
        # Normalize empty_audio to prevent clipping if sums are too large
        # This wasn't in the original, but good practice if adding many samples
        max_val = np.max(np.abs(empty_audio))
        if max_val > 1.0:
            empty_audio /= max_val

        # Final Mix and Encoding
        # Original: audio.mix(empty, self.original, 0.5).encode('mixed.mp3')
        # self.y is the original audio, empty_audio is the beatbox samples
        # Mix: 50% beatbox samples, 50% original audio
        mixed_audio = (empty_audio * 0.5) + (self.y * 0.5)

        # Normalize final mix too
        max_mixed_val = np.max(np.abs(mixed_audio))
        if max_mixed_val > 1.0:
            mixed_audio /= max_mixed_val
        
        # Output:
        # The instruction: "write to self.tempfile (a WAV), and the base Remixer class will handle the lame encoding to self.outfile (MP3)"
        # This is the preferred way. self.tempfile is usually like "tmp/uid.wav"
        # self.outfile is usually "path/to/uid.out.mp3"
        
        # Soundfile expects data as (samples, channels) or (samples,) for mono
        # Librosa gives (channels, samples) for stereo, or (samples,) for mono
        # self.y and mixed_audio are (channels, samples) format due to earlier vstack and mixing.
        # So, transpose before writing.
        sf.write(self.tempfile, mixed_audio.T, self.sr)
        
        # After writing to self.tempfile, the base Remixer's run() method
        # should call self.lame(self.tempfile, self.outfile) if outfile is mp3.
        # The old code `audio.mix(empty, self.original, 0.5).encode('mixed.mp3')`
        # created 'mixed.mp3' directly. We are now following the standard pattern.
        # The `self.tag['remixed'] = self.remix()` in base Remixer implies remix() should return something.
        # What it should return is not super clear from base class, maybe a success boolean or path.
        # For now, let's assume it doesn't need to return a specific path if it writes to self.tempfile.
        # The original remix() methods in other remixers often don't have explicit return.
        # The base class's _remix method: self.tag['remixed'] = self.remix()
        # Let's return True for success.
        return True

if __name__ == "__main__":
    CMDRemix(Beatbox)

