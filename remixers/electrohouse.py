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
import librosa
import numpy as np # Standard alias for numpy
import soundfile as sf
from os import path # Added for path.join

# This global tempo is used by cutnote and _create_rest.
# It should ideally be set dynamically based on the track's tempo in the class instance.
# For now, keeping it as a global default as per original structure.
ELECTRO_HOUSE_TARGET_TEMPO = 128.0 # BPM
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
    
    # Use ELECTRO_HOUSE_TARGET_TEMPO for beat length calculation
    beatlength_samples = int((float(sr_audio) * 60.0) / ELECTRO_HOUSE_TARGET_TEMPO)
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
        # print("Warning: total_samples < by_factor in divide(). Resulting parts might be very short or empty.")


    divided_parts = []
    for i in range(by_factor): 
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
    # Use ELECTRO_HOUSE_TARGET_TEMPO for rest length calculation
    beatlength_samples = (float(sr) * 60.0) / ELECTRO_HOUSE_TARGET_TEMPO
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
            print(("Warning: Invalid length_key '%s' for note rest. Defaulting to sixteenth_rest (key 1)." % length_key))
            self.data_tuple = rest_map[1] # Default to a 16th note rest

        if length_key in rhythm_map:
            self.function = rhythm_map[length_key]
        else:
            # Fallback to a default function
            print(("Warning: Invalid length_key '%s' for note function. Defaulting to sixteenth_note (key 1)." % length_key))
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
        pattern_chars.extend([''.join(x) for x in zip(*[list(s[z::2]) for z in range(2)])])
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
                print("Warning: Pattern continuation '-' found at the beginning of a bar. Treating as rest.")
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
                print(("Warning: Could not parse pitch from pattern: '%s'. Treating as rest." % sixteenth_repr))
                bar_notes.append(note(pitch_value=None, length_key=1))
    return bar_notes

class ElectroHouse(Remixer):
    template = {
        'tempo':        ELECTRO_HOUSE_TARGET_TEMPO, # Use the defined constant
        'beat':        ['beat_%s.wav' % i for i in range(0, 4)], # Changed xrange
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
                 # print("Warning: No sections or bars available. Searching full track in searchSamples for section_idx %s." % section_idx)
                 pool_time_bounds = (0, librosa.get_duration(y=self.y, sr=self.sr) if hasattr(self, 'y') and self.y is not None else 10.0) # Default 10s if y not ready
        else: # Fallback to entire track if no sections or bars
            # print("Warning: No sections or bars available. Searching full track in searchSamples for section_idx %s." % section_idx)
            pool_time_bounds = (0, librosa.get_duration(y=self.y, sr=self.sr) if hasattr(self, 'y') and self.y is not None else 10.0)


        key_to_try = initial_key
        # `target` is defined in self.template (e.g., "beats", "bars")
        target_val = self.template.get('target', "beats")
        found_samples_times = self.getSamples(pool_time_bounds, key_to_try, target=target_val)
        
        # Try fifths if no samples found
        for _ in range(5): # Try up to 5 fifths
            if len(found_samples_times): break
            key_to_try = (key_to_try + 7) % 12 # Move by a perfect fifth
            found_samples_times = self.getSamples(pool_time_bounds, key_to_try, target=target_val)
        
        # If still no samples, try chromatic steps in the same pool_time_bounds
        # Original logic also iterated through other sections here, which was more complex.
        # This simplified version only tries other keys in the *same* section/pool.
        if not len(found_samples_times):
            key_to_try = initial_key # Reset to initial key
            for _ in range(12): 
                if len(found_samples_times): break # Found some samples
                found_samples_times = self.getSamples(pool_time_bounds, key_to_try, target=target_val)
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
        if not hasattr(self, 'y') or self.y is None or not hasattr(self, 'sr'): # Ensure audio is loaded
            self.log("Error: Audio data not loaded in getSamples.")
            return matching_segments_times

        section_start_time, section_end_time = section_time_bounds

        # Determine which set of rhythmic elements to check (beats or bars)
        elements_to_analyze = []
        # Ensure self.tempo is valid for beat duration calculation.
        current_tempo_for_analysis = self.tempo if hasattr(self, 'tempo') and self.tempo and self.tempo > 0 else ELECTRO_HOUSE_TARGET_TEMPO

        if target == "beats":
            if not hasattr(self, 'beat_times') or not self.beat_times: return []
            beat_duration = 60.0 / current_tempo_for_analysis
            for i, start_t in enumerate(self.beat_times):
                end_t = self.beat_times[i+1] if i+1 < len(self.beat_times) else start_t + beat_duration
                elements_to_analyze.append((start_t, end_t))
        elif target == "bars":
            if not hasattr(self, 'bar_times') or not self.bar_times: return []
            elements_to_analyze = self.bar_times
        
        for elem_start_time, elem_end_time in elements_to_analyze:
            if elem_start_time < section_end_time and elem_end_time > section_start_time:
                analysis_start_time = max(elem_start_time, section_start_time)
                analysis_end_time = min(elem_end_time, section_end_time)

                if analysis_start_time >= analysis_end_time: continue

                start_sample = librosa.time_to_samples(analysis_start_time, sr=self.sr)
                end_sample = librosa.time_to_samples(analysis_end_time, sr=self.sr)
                
                # Ensure self.y has more than one dimension if slicing with [:, start:end]
                if self.y.ndim > 1 and start_sample < end_sample and start_sample < self.y.shape[1] and end_sample <= self.y.shape[1]:
                    segment_audio = self.y[:, start_sample:end_sample]
                elif self.y.ndim == 1 and start_sample < end_sample and start_sample < self.y.shape[0] and end_sample <= self.y.shape[0]:
                     segment_audio = self.y[start_sample:end_sample]
                else: # Slice not valid
                    continue
                    
                segment_audio_mono = librosa.to_mono(segment_audio)

                if segment_audio_mono.size > 0:
                    chromagram = librosa.feature.chroma_stft(y=segment_audio_mono, sr=self.sr)
                    segment_chroma_energies = np.sum(chromagram, axis=1)
                    dominant_pitch_class_in_segment = np.argmax(segment_chroma_energies)
                    
                    if dominant_pitch_class_in_segment == pitch_class:
                        matching_segments_times.append((elem_start_time, elem_end_time))
        
        self.sampleCache[cache_key] = matching_segments_times
        return matching_segments_times

    def mixfactor(self, segment_time_bounds):
        """
        Computes a mix factor based on the loudness of the original audio in the given time bounds.
        segment_time_bounds: tuple (start_time, end_time)
        Returns a float between 0.0 and 1.0.
        Higher RMS of original -> lower mix factor (less electro sample presence).
        """
        if not hasattr(self, 'y') or self.y is None:
            self.log("Warning: Original audio self.y not available for mixfactor calculation. Returning default.")
            return 0.5

        start_sample = librosa.time_to_samples(segment_time_bounds[0], sr=self.sr)
        end_sample = librosa.time_to_samples(segment_time_bounds[1], sr=self.sr)

        # Ensure slice is valid
        if start_sample >= end_sample or start_sample >= self.y.shape[-1] or end_sample <= 0:
            segment_rms = 0.0 # Treat as silence if bounds are invalid
        else:
            start_sample = max(0, start_sample)
            end_sample = min(self.y.shape[-1], end_sample)
            
            segment_y = self.y[..., start_sample:end_sample]
            if segment_y.size == 0:
                segment_rms = 0.0
            else:
                segment_y_mono = librosa.to_mono(segment_y)
                segment_rms = np.mean(librosa.feature.rms(y=segment_y_mono))

        # Map RMS [0.0, 0.5] to mix factor [0.8, 0.3]
        # rms_low means high electro presence (mixfactor_high)
        # rms_high means low electro presence (mixfactor_low)
        rms_low = 0.0
        mixfactor_high = 0.8  # More electro sample
        rms_high = self.template.get('loudness_rms_high_for_min_electro', 0.4) # Configurable
        mixfactor_low = 0.3   # Less electro sample (more original)

        if segment_rms <= rms_low:
            mix_f = mixfactor_high
        elif segment_rms >= rms_high:
            mix_f = mixfactor_low
        else:
            mix_f = mixfactor_high + (segment_rms - rms_low) * \
                      (mixfactor_low - mixfactor_high) / (rms_high - rms_low)
        
        return np.clip(mix_f, 0.0, 1.0) # Ensure it's strictly between 0 and 1

    def compileIntro(self, section_idx=0): # section_idx instead of Echonest section object
        # Load intro sample
        intro_sample_path = path.join(self.sample_path, self.template['intro'])
        intro_y, intro_sr = librosa.load(intro_sample_path, sr=self.sr) # Resample to self.sr
        intro_y = _ensure_stereo(intro_y)

        # This will hold concatenated audio pieces (NumPy arrays, stereo)
        compiled_pattern_audio_pieces = [] 

        pattern_notes = readPattern(path.join(self.sample_path, '../electrohouse/intro.txt')) # Correct path

        for i, item_note in enumerate(pattern_notes):
            if item_note.pitch is None: # Rest
                # item_note.data_tuple is (numpy_array, sample_rate)
                # Ensure sample rate matches self.sr for rests if they are pre-generated at FIXED_SR
                rest_y, rest_sr = item_note.data_tuple
                if rest_sr != self.sr: # This shouldn't happen if FIXED_SR is self.sr or if used carefully
                    # If it could happen, resample rest_y here. For now, assume sr matches or is close enough.
                    # A proper resample: rest_y = librosa.resample(rest_y, orig_sr=rest_sr, target_sr=self.sr)
                    # For simplicity, let's assume rest_map uses FIXED_SR and self.sr is also FIXED_SR or similar.
                    pass # Assuming sr matches for rests for now.
                compiled_pattern_audio_pieces.append(rest_y)
            else:
                # Get audio segments from original track
                # item_note.pitch is 0-11 relative to pattern's '1'
                # self.tonic is 0-11 absolute (C=0)
                # Target pitch class for searchSamples is absolute
                target_pitch_class = (item_note.pitch + self.tonic) % 12
                
                # searchSamples returns list of (start_time, end_time) tuples
                source_segments_times = self.searchSamples(section_idx, target_pitch_class)
                
                if not source_segments_times:
                    rest_y, _ = item_note.data_tuple # Use the note's default rest if no samples found
                    compiled_pattern_audio_pieces.append(rest_y)
                else:
                    # Pick one segment (e.g., round robin)
                    selected_segment_times = source_segments_times[i % len(source_segments_times)]
                    
                    # Extract audio for this segment
                    start_s, end_s = selected_segment_times
                    start_sample = librosa.time_to_samples(start_s, sr=self.sr)
                    end_sample = librosa.time_to_samples(end_s, sr=self.sr)
                    
                    # Ensure slice is valid and self.y is stereo
                    if start_sample < end_sample and start_sample < self.y.shape[1] and end_sample <= self.y.shape[1]:
                        original_piece_y = self.y[:, start_sample:end_sample]
                    else: # Fallback to rest if slice invalid
                        original_piece_y, _ = item_note.data_tuple 
                        compiled_pattern_audio_pieces.append(original_piece_y)
                        continue

                    # Tempo shift the original piece
                    # self.template['tempo'] is target tempo (e.g. 128), self.tempo is original song's tempo
                    tempo_ratio = self.template['tempo'] / self.tempo if self.tempo > 0 else 1.0
                    
                    # Cache key for shifted audio (y_audio_tuple, ratio)
                    # For simplicity, not implementing complex caching for shifted pieces in this pass.
                    shifted_piece_y, _ = self.st.shiftTempo(original_piece_y, self.sr, tempo_ratio)
                    shifted_piece_y = _ensure_stereo(shifted_piece_y)
                    
                    # Apply the note's rhythm function (e.g., sixteenth_note)
                    # item_note.function expects (numpy_array, sample_rate)
                    final_note_y, _ = item_note.function((shifted_piece_y, self.sr))
                    compiled_pattern_audio_pieces.append(final_note_y)

        # Concatenate all processed audio pieces for the pattern
        if not compiled_pattern_audio_pieces: # Should not happen if pattern_notes is not empty
            # Return silence if pattern somehow yields no audio
            return np.zeros((2,1), dtype=np.float32) 
            
        shifted_pattern_y = np.concatenate(compiled_pattern_audio_pieces, axis=1)
        shifted_pattern_y = _ensure_stereo(shifted_pattern_y)
        
        # Mix the compiled pattern with the main intro sample
        # Use mixfactor based on the overall loudness of where the intro pattern's source audio comes from.
        # For simplicity, using a fixed mix for now, or could pass relevant segment_time_bounds.
        # The original used 0.3. Let's stick to that for now as mixfactor might be too generic.
        # A more advanced mixfactor could be calculated based on the source audio segments used for the intro.
        # For now, the placeholder 0.3 is fine.
        # final_mix_factor = self.mixfactor(some_relevant_time_bounds_from_self.y)
        final_mix_factor = 0.7 # Closer to electro sample (main audio is electro, overlay is original song)
                               # self.truncatemix(main, overlay, ratio_of_main)
                               # So, intro_y is main. shifted_pattern_y is overlay.
                               # if ratio is 0.7, it's 70% intro_y, 30% shifted_pattern_y
        return self.truncatemix(intro_y, shifted_pattern_y, final_mix_factor)

    def compileSection(self, section_idx, section_time_bounds, backing_sample_y):
        # This will hold concatenated audio pieces (NumPy arrays, stereo)
        compiled_pattern_audio_pieces = []
        pattern_notes = readPattern(path.join(self.sample_path, '../electrohouse/section.txt')) # Correct path

        for i, item_note in enumerate(pattern_notes):
            if item_note.pitch is None: # Rest
                rest_y, _ = item_note.data_tuple
                compiled_pattern_audio_pieces.append(rest_y)
            else:
                target_pitch_class = (item_note.pitch + self.tonic) % 12
                source_segments_times = self.searchSamples(section_idx, target_pitch_class)
                
                if not source_segments_times:
                    rest_y, _ = item_note.data_tuple
                    compiled_pattern_audio_pieces.append(rest_y)
                else:
                    selected_segment_times = source_segments_times[i % len(source_segments_times)]
                    start_s, end_s = selected_segment_times
                    start_sample = librosa.time_to_samples(start_s, sr=self.sr)
                    end_sample = librosa.time_to_samples(end_s, sr=self.sr)

                    if start_sample < end_sample and start_sample < self.y.shape[1] and end_sample <= self.y.shape[1]:
                        original_piece_y = self.y[:, start_sample:end_sample]
                    else:
                        original_piece_y, _ = item_note.data_tuple
                        compiled_pattern_audio_pieces.append(original_piece_y)
                        continue
                        
                    tempo_ratio = self.template['tempo'] / self.tempo if self.tempo > 0 else 1.0
                    shifted_piece_y, _ = self.st.shiftTempo(original_piece_y, self.sr, tempo_ratio)
                    shifted_piece_y = _ensure_stereo(shifted_piece_y)
                    
                    final_note_y, _ = item_note.function((shifted_piece_y, self.sr))
                    compiled_pattern_audio_pieces.append(final_note_y)

        if not compiled_pattern_audio_pieces:
            return np.zeros((2,1), dtype=np.float32)

        shifted_pattern_y = np.concatenate(compiled_pattern_audio_pieces, axis=1)
        shifted_pattern_y = _ensure_stereo(shifted_pattern_y)
        
        # Mix with backing track
        # Calculate mixfactor based on the current section's original audio loudness
        final_mix_factor = self.mixfactor(section_time_bounds)
        # self.truncatemix(main, overlay, ratio_of_main)
        # Here, backing_sample_y (electro sample) is main. shifted_pattern_y (from original song) is overlay.
        return self.truncatemix(backing_sample_y, shifted_pattern_y, final_mix_factor)


    def remix(self):
        self.log("Looking up track...", 5)
        self.getTag() # From base Remixer
        self.processArt() # From base Remixer

        self.log("Listening to %s..." % ('"%s"' % self.tag['title'] if 'title' in self.tag else 'song'), 5)
        # Load audio using Librosa
        self.y, self.sr = librosa.load(self.infile, sr=FIXED_SR, mono=False) # Resample to FIXED_SR
        self.y = _ensure_stereo(self.y)
        
        # self.detectSong() is a placeholder in base Remixer, not strictly needed if getTag() works.
        # if not 'title' in self.tag:
        #    self.detectSong(None) # Original took Echonest audio object, now takes None

        self.st = FastModify() # Librosa-based
        
        self.log("Analyzing track for tempo, beats, sections, and key...", 10)
        y_mono_for_analysis = librosa.to_mono(self.y)
        
        # Tempo and Beats
        # self.tempo (original song's tempo) vs self.template['tempo'] (target electro house tempo)
        detected_tempo, beat_frames = librosa.beat.beat_track(y=y_mono_for_analysis, sr=self.sr)
        self.tempo = detected_tempo if detected_tempo > 0 else ELECTRO_HOUSE_TARGET_TEMPO # Use detected, fallback to target
        self.beat_times = librosa.frames_to_time(beat_frames, sr=self.sr)
        
        # Sections
        section_sample_boundaries = librosa.effects.split(y_mono_for_analysis, top_db=30)
        self.sections = [(librosa.samples_to_time(s[0], sr=self.sr), librosa.samples_to_time(s[1], sr=self.sr)) for s in section_sample_boundaries]

        # Bars (simplified grouping of beats)
        self.bar_times = []
        if self.beat_times.size > 0:
            beats_per_bar = 4 # Common assumption
            for i in range(0, len(self.beat_times), beats_per_bar):
                bar_start_time = self.beat_times[i]
                # Determine end_time for the bar
                if i + beats_per_bar < len(self.beat_times):
                    bar_end_time = self.beat_times[i + beats_per_bar]
                else: # Last bar
                    beat_duration_approx = 60.0 / self.tempo if self.tempo > 0 else 0.5
                    bar_end_time = self.beat_times[-1] + beat_duration_approx 
                    song_total_duration = librosa.get_duration(y=self.y, sr=self.sr)
                    if bar_end_time > song_total_duration: bar_end_time = song_total_duration
                self.bar_times.append((bar_start_time, bar_end_time))

        # Tonic (Key)
        chromagram = librosa.feature.chroma_stft(y=y_mono_for_analysis, sr=self.sr)
        self.tonic = np.argmax(np.sum(chromagram, axis=1))

        self.tag['key'] = self.keys[self.tonic % 12] # Ensure self.keys is accessible
        # Special case from original code for "I Wish" - adjust tonic
        if 'title' in self.tag and self.tag['title'] == 'I Wish': # Removed u'' for Python 3
            self.tonic = (self.tonic + 2) % 12 # Shifted by +2
            self.tag['key'] = self.keys[self.tonic]
        self.tag['tempo'] = self.template['tempo'] # Set final tempo tag to target

        # --- Intro ---
        num_sections_for_log = len(self.sections) if self.sections else 1
        self.log("Arranging intro...", 40.0 / (num_sections_for_log + 1))
        # compileIntro no longer takes Echonest audio.section or intro Echonest object
        intro_final_y = self.compileIntro(section_idx=0) # Pass section index
        self.partialEncode(intro_final_y, self.sr) # Use self.sr (FIXED_SR)
        del intro_final_y

        # --- Sections ---
        # Original logic for selecting sections to process:
        # sections_to_process = self.sections[1:] if len(self.sections) % 2 else self.sections
        # This seems to skip the first section if total number of sections is odd.
        # Let's process all sections for simplicity in this refactor stage.
        sections_to_process_indices = range(len(self.sections))

        # Load backing sample (body) - choose one based on tonic
        backing_sample_path = path.join(self.sample_path, self.template['body'][self.tonic % len(self.template['body'])])
        backing_y, backing_sr = librosa.load(backing_sample_path, sr=self.sr) # Resample to self.sr
        backing_y = _ensure_stereo(backing_y)

        current_section_loop_idx = 0 # For splash_ends indexing if sections are processed
        if self.sections:
            for i, section_idx_val in enumerate(sections_to_process_indices):
                current_section_loop_idx = i # Update for splash end
                self.log("Arranging section %s of %s..." % (i + 1, len(sections_to_process_indices)), 40.0 / (num_sections_for_log + 1))
                
                # Original logic: if i != (len(sections_to_process)/2 + 1) then compileSection else compileIntro
                # This was to insert an intro-like part in the middle.
                # For this pass, we simplify: always compileSection.
                # A more faithful port might re-introduce this compileIntro call for a middle section.
                # The section_idx_val should be passed to compileSection for its searchSamples context.
                # section_time_bounds is needed for mixfactor calculation within compileSection.
                current_section_time_bounds = self.sections[section_idx_val] if self.sections and section_idx_val < len(self.sections) else (0,0)

                section_audio_y = self.compileSection(section_idx_val, current_section_time_bounds, backing_y)
                self.partialEncode(section_audio_y, self.sr)
                del section_audio_y
        
        if backing_y is not None: # Ensure it was loaded before trying to delete
            del backing_y

        # --- Ending ---
        self.log("Adding ending...", 5)
        end_splash_path_key = self.template['splash_ends'][(current_section_loop_idx + 1) % len(self.template['splash_ends'])]
        end_splash_path = path.join(self.sample_path, end_splash_path_key)
        end_splash_y, _ = librosa.load(end_splash_path, sr=self.sr)
        end_splash_y = _ensure_stereo(end_splash_y)
        self.partialEncode(end_splash_y, self.sr)
        del end_splash_y
        
        self.log("Mixing down WAV...", 5)
        self.mixwav(self.tempfile) # Concatenates all partially encoded WAVs (from self.partialEncode)

        if self.deleteOriginal and hasattr(self, 'infile') and self.infile:
            try:
                unlink(self.infile) # os.unlink already imported via remixer
            except OSError:
                pass

        self.log("Encoding to MP3...", 5)
        self.lame(self.tempfile, self.outfile) # self.tempfile is WAV, self.outfile is MP3
        
        try:
            unlink(self.tempfile) # Remove large temporary WAV
        except OSError:
            pass

        self.log("Adding ID3 tags and artwork...", 20)
        self.updateTags(titleSuffix=" (Wub Machine Electro Remix)")
        
        return self.outfile
        # return True # Alternative: base class might expect boolean

if __name__ == "__main__":
    CMDRemix(ElectroHouse)

