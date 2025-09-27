"""
dubstep.py <ex: dubstepize.py, wubmachine.py, wubwub.py, etc...>

Turns a song into a dubstep remix.
Dubstep inherits from the Remixer class.
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

from remixer import Remixer, CMDRemix
from helpers.fastmodify import FastModify

from os import unlink
import librosa
import numpy as np
import soundfile as sf

class Dubstep(Remixer):
    """
        The heart of the Wub Machine. The wubalizer, the dubstepper - or the Dubstep class, as it's now been refactored.
        Inherits from Remixer. Call the remix() method to start a remix. (This is forked and called by RemixQueue in the web interface.)
        Template defined in the self.template object: tempo and locations of audio samples.

        A couple custom modifications to the Remix API:
            FastModify is used instead of Modify, which requires the `soundstretch` binary to be installed.
            Remixer.partialEncode() and Remixer.mixwav() are used instead of an AudioQuantumList,
            to save memory and increase processing speed at the expense of disk space. (Requires `shntool` binary.)
            
    """
    template = {
        'tempo':        140,
        'intro':        'intro-eight.wav',
        'hats':         'hats.wav',
        'wubs':         [  'wubs/c.wav',
                            'wubs/c-sharp.wav',
                            'wubs/d.wav',
                            'wubs/d-sharp.wav',
                            'wubs/e.wav',
                            'wubs/f.wav',
                            'wubs/f-sharp.wav',
                            'wubs/g.wav',
                            'wubs/g-sharp.wav',
                            'wubs/a.wav',
                            'wubs/a-sharp.wav',
                            'wubs/b.wav'
                        ],
        'wub_breaks':   [  'break-ends/c.wav',
                            'break-ends/c-sharp.wav',
                            'break-ends/d.wav',
                            'break-ends/d-sharp.wav',
                            'break-ends/e.wav',
                            'break-ends/f.wav',
                            'break-ends/f-sharp.wav',
                            'break-ends/g.wav',
                            'break-ends/g-sharp.wav',
                            'break-ends/a.wav',
                            'break-ends/a-sharp.wav',
                            'break-ends/b.wav'
                        ],
        'splashes':     [  'splashes/splash_03.wav',
                            'splashes/splash_04.wav',
                            'splashes/splash_02.wav',
                            'splashes/splash_01.wav',
                            'splashes/splash_05.wav',
                            'splashes/splash_07.wav',
                            'splashes/splash_06.wav',
                            'splashes/splash_08.wav',
                            'splashes/splash_10.wav',
                            'splashes/splash_09.wav',
                            'splashes/splash_11.wav'
                        ],
        'splash_ends':  [  'splash-ends/1.wav',
                            'splash-ends/2.wav',
                            'splash-ends/3.wav',
                            'splash-ends/4.wav'
                        ],
        'mixpoint': 18,     # "db factor" of wubs - 0 is softest wubs, infinity is... probably extremely loud 
        'target': "beats"
    }
    st = None

    def searchSamples(self, section_idx, initial_key):
        """
            Find all samples (beats or bars, based on self.template['target']) 
            of a given key in a given section.
            Iteratively tries different keys (fifths, then chromatic) and sections if no samples are found.
            section_idx: index of the section in self.sections
            initial_key: the initial pitch class (0-11) to search for
            Returns a list of (start_time, end_time) tuples.
        """
        key_to_try = initial_key
        current_section_idx = section_idx

        # Ensure self.sections is not empty and section_idx is valid
        if not self.sections or not (0 <= current_section_idx < len(self.sections)):
            return []

        # Try the initial key in the given section
        # self.sections[current_section_idx] is a [start_time, end_time] ndarray
        section_bounds = tuple(self.sections[current_section_idx])
        found_samples = self.getSamples(section_bounds, key_to_try, target=self.template['target'])

        # Try fifths if no samples found
        for _ in range(5): # Try up to 5 fifths
            if len(found_samples):
                return found_samples
            key_to_try = (key_to_try + 7) % 12 # Move by a perfect fifth
            found_samples = self.getSamples(section_bounds, key_to_try, target=self.template['target'])
        
        # If still no samples, try moving to next sections and trying chromatic steps from the initial_key
        # This part of the original logic was:
        # else: # This 'else' corresponds to the 'for tries in xrange(0,5)' for fifths
        #     for tries in range(0, 5):
        #         if len(a): break
        #         j = (j + 1) % len(self.sections)
        #         key = (key + 2) % 12 # This was odd, +2 is whole step, not chromatic or fifth
        #         a = self.getSamples(self.sections[j], key)
        # Let's refine this: try chromatic steps in other sections if initial section + fifths failed.
        
        if not len(found_samples): # If fifths didn't work in the current section
            for i in range(len(self.sections)): # Iterate through all sections
                current_section_idx = (section_idx + i) % len(self.sections) # Start with current, then wrap around
                section_bounds = tuple(self.sections[current_section_idx])
                key_to_try = initial_key # Reset to initial key for a new section
                for _ in range(12): # Try all 12 chromatic keys
                    if len(found_samples):
                        return found_samples
                    found_samples = self.getSamples(section_bounds, key_to_try, target=self.template['target'])
                    key_to_try = (key_to_try + 1) % 12 # Chromatic step
        
        return found_samples # Return whatever was found, possibly empty

    def getSamples(self, section_time_bounds, pitch_class, target="beats"):
        """
            Finds all beats/bars in a given time-defined section, of a given pitch class.
            section_time_bounds: tuple (start_time, end_time)
            pitch_class: integer 0-11
            target: "beats" or "bars"
            Returns a list of (start_time, end_time) tuples for matching segments.
        """
        matching_segments_times = []
        section_start_time, section_end_time = section_time_bounds

        elements_to_use_pitch_data = []
        if target == "beats":
            elements_to_use_pitch_data = self.beat_pitch_data # List of (start_time, end_time, pitch_class)
        elif target == "bars":
            elements_to_use_pitch_data = self.bar_pitch_data # List of (start_time, end_time, pitch_class)
        
        for elem_start_time, elem_end_time, elem_pitch_class in elements_to_use_pitch_data:
            # Check if element is within the given section_time_bounds and matches pitch_class
            if elem_start_time >= section_start_time and \
               elem_end_time <= section_end_time and \
               elem_pitch_class == pitch_class:
                matching_segments_times.append((elem_start_time, elem_end_time))
        
        return matching_segments_times

    def mixfactor(self, segment_time_bounds):
        """
            Computes a rough "mixfactor" - the balance between wubs and original audio for a given segment.
            segment_time_bounds: tuple (start_time, end_time)
            Mixfactor returned:
              1: full wub
              0: full original
            Result can be fed into a mixing function as the mix ratio.
        """
        mixfactor = 0
        # The updated Remixer.loudness calculates mean RMS, which is positive.
        # This part needs careful re-evaluation of the original intent of 'a' and 'b'.
        # Let's assume self.loudness now returns RMS (0 to 1).
        # To make it somewhat comparable to a dB-like scale for this formula, we can convert RMS to dB.
        # However, the formula (loud+a)/(loud+b) is sensitive to the scale of loud, a, and b.
        # If self.loudness returns RMS (e.g. 0.0 to 1.0)
        # The original formula might not make sense.
        # Let's try to use the RMS value directly and simplify the factor calculation.
        # A simple approach: higher RMS of original segment -> less wub (lower mixfactor)

        # The self.loudness in remixer.py was updated to take (y, sr, segments_time, target_indices)
        # and returns mean RMS for the specified segments.
        
        current_segment_loudness_rms = self.loudness(self.y, self.sr, [segment_time_bounds], [0])

        if current_segment_loudness_rms is None:
            # Calculate overall loudness of self.y if segment specific is None
            y_mono_for_overall_loudness = librosa.to_mono(self.y)
            overall_loudness_rms = np.mean(librosa.feature.rms(y=y_mono_for_overall_loudness))
            current_segment_loudness_rms = overall_loudness_rms
            if current_segment_loudness_rms is None: # Still None (e.g. empty audio)
                current_segment_loudness_rms = 0.05 # Default to a low RMS

        # Original formula: mixfactor = (loud + a) / (loud + b)
        # where a = (89.0/1.5) + mixpoint, b = (188.0/1.5) + mixpoint
        # mixpoint = self.template['mixpoint'] = 18
        # a = 59.33 + 18 = 77.33
        # b = 125.33 + 18 = 143.33
        # This formula needs to be inverted or re-thought for RMS.
        # If RMS is high (e.g. 0.8), we want mixfactor to be low (less wub).
        # If RMS is low (e.g. 0.1), we want mixfactor to be high (more wub).
        
        # Let's try a simple linear mapping from RMS to mixfactor.
        # Assume RMS range [0, 0.5] for typical audio after normalization. Max RMS is 1.
        # If RMS = 0.0 (silence), mixfactor = 0.8 (max wub based on original caps)
        # If RMS = 0.5 (loud), mixfactor = 0.3 (min wub based on original caps)
        # This is a linear interpolation: y = y1 + (x-x1)*(y2-y1)/(x2-x1)
        # x = current_segment_loudness_rms
        # (x1,y1) = (0.0, 0.8)  (rms_low, wub_high)
        # (x2,y2) = (0.5, 0.3)  (rms_high, wub_low)
        
        rms_low = 0.0
        wub_high = 0.8 
        rms_high = self.template.get('loudness_rms_high_for_min_wub', 0.5) # configurable upper RMS for min wub
        wub_low = 0.3

        if current_segment_loudness_rms <= rms_low:
            mixfactor = wub_high
        elif current_segment_loudness_rms >= rms_high:
            mixfactor = wub_low
        else:
            mixfactor = wub_high + (current_segment_loudness_rms - rms_low) * \
                        (wub_low - wub_high) / (rms_high - rms_low)
        
        # Clamping, just in case, though linear interp should be within bounds if rms is within [rms_low, rms_high]
        mixfactor = np.clip(mixfactor, wub_low, wub_high)
        
        return mixfactor

    def _get_audio_pieces(self, y_audio, sr_audio, segment_times_list):
        """
        Helper function to extract and concatenate audio segments from y_audio.
        y_audio: The source audio data (NumPy array, channels x samples or samples).
        sr_audio: Sample rate of y_audio.
        segment_times_list: A list of (start_time, end_time) tuples.
        Returns a concatenated NumPy array (channels x samples or samples).
        """
        pieces = []
        for start_time, end_time in segment_times_list:
            start_sample = librosa.time_to_samples(start_time, sr=sr_audio)
            end_sample = librosa.time_to_samples(end_time, sr=sr_audio)
            
            # Ensure slice is valid
            if end_sample > start_sample and start_sample < y_audio.shape[-1]:
                # Clamp end_sample to prevent overshooting
                end_sample = min(end_sample, y_audio.shape[-1])
                if y_audio.ndim > 1:
                    pieces.append(y_audio[:, start_sample:end_sample])
                else:
                    pieces.append(y_audio[start_sample:end_sample])
        
        if not pieces:
            # Return a short silent array if no pieces found, matching y_audio's channel count
            num_channels = y_audio.shape[0] if y_audio.ndim > 1 else 1
            return np.zeros((num_channels, 1)) if num_channels > 1 else np.zeros(1)

        if y_audio.ndim > 1:
            return np.concatenate(pieces, axis=1)
        else:
            return np.concatenate(pieces)

    def compileIntro(self):
        """
            Compiles the dubstep introduction. Returns a NumPy array of the intro audio.
            (8 bars at 140 bpm = ~13.71 seconds of audio)
        """
        # This list will store (start_time, end_time) tuples for audio segments from the original track
        source_audio_segments_times = [] 
        
        intro_sample_y, intro_sample_sr = librosa.load(self.sample_path + self.template['intro'], sr=self.sr)
        if intro_sample_y.ndim == 1: # Ensure stereo
             intro_sample_y = np.vstack([intro_sample_y, intro_sample_y])

        # custom_bars will be a list of lists of (start_time, end_time) tuples, representing beats in bars
        custom_bars_times = []

        # Use self.beat_times (list of start times) and self.bar_times (list of (start,end) tuples)
        # The original code expected at least 16 beats for the first 4 bars.
        if self.beat_times.size == 0 or len(self.beat_times) < 16:
            # Fallback: Song is not long or identifiable enough. Create synthetic beat timings.
            song_duration_sec = librosa.get_duration(y=self.y, sr=self.sr)
            if song_duration_sec == 0: song_duration_sec = 1.0 # Avoid division by zero for empty audio
            # self.tempo might not be reliable if beat tracking failed.
            # Use a default tempo or estimate if needed. Assume 120 if self.tempo is bad.
            current_tempo = self.tempo if self.tempo and self.tempo > 0 else 120.0
            
            # Calculate duration of 16 "beats" based on this tempo.
            # This is just for timing generation, not for changing song's actual tempo here.
            total_16_beat_duration = 16 * (60.0 / current_tempo)
            beat_duration_sec = total_16_beat_duration / 16.0
            
            # If song is shorter than these 16 beats, scale beat_duration down.
            if song_duration_sec < total_16_beat_duration:
                beat_duration_sec = song_duration_sec / 16.0

            for i in range(4): # 4 bars
                bar_segment_times = []
                for j in range(4): # 4 beats per bar
                    start = ((i * 4) + j) * beat_duration_sec
                    end = start + beat_duration_sec
                    bar_segment_times.append((start, end))
                custom_bars_times.append(bar_segment_times)
        else:
            # We have enough beats from librosa.beat.beat_track
            # Group self.beat_times into bars. self.bar_times already does this.
            # Ensure we take the first 4 bars.
            for i in range(min(4, len(self.bar_times))):
                bar_start_time, bar_end_time = self.bar_times[i]
                # Get beats within this bar
                beats_in_bar_times = []
                current_beat_idx = 0
                # Find first beat that belongs to this bar
                while current_beat_idx < len(self.beat_times) and self.beat_times[current_beat_idx] < bar_start_time:
                    current_beat_idx +=1
                
                while current_beat_idx < len(self.beat_times) and self.beat_times[current_beat_idx] < bar_end_time:
                    beat_s = self.beat_times[current_beat_idx]
                    beat_e = self.beat_times[current_beat_idx+1] if current_beat_idx+1 < len(self.beat_times) else beat_s + (60.0/self.tempo)
                    beats_in_bar_times.append((beat_s, beat_e))
                    current_beat_idx +=1
                
                # If a bar from self.bar_times didn't perfectly yield 4 beats (e.g. end of song)
                # Pad it synthetically if needed, or truncate. For intro, we prefer 4 beats.
                while len(beats_in_bar_times) < 4 and len(beats_in_bar_times)>0 : # Pad if some beats found
                    last_beat_s, last_beat_e = beats_in_bar_times[-1]
                    beats_in_bar_times.append( (last_beat_e, last_beat_e + (last_beat_e-last_beat_s)) )
                if not beats_in_bar_times: # Bar was empty, create synthetic beats for this bar
                    avg_beat_dur = 60.0/self.tempo
                    for k_beat in range(4):
                        beats_in_bar_times.append((bar_start_time + k_beat*avg_beat_dur, bar_start_time + (k_beat+1)*avg_beat_dur))

                custom_bars_times.append(beats_in_bar_times[:4]) # Ensure only 4 beats per bar
            # If less than 4 bars were populated from self.bar_times
            while len(custom_bars_times) < 4:
                # Add synthetic bars
                last_time = custom_bars_times[-1][-1][1] if custom_bars_times and custom_bars_times[-1] else 0
                avg_beat_dur = 60.0/self.tempo
                new_bar = []
                for k_beat in range(4): new_bar.append((last_time + k_beat*avg_beat_dur, last_time + (k_beat+1)*avg_beat_dur))
                custom_bars_times.append(new_bar)


        # First 4 bars of song from custom_bars_times
        for bar_segments in custom_bars_times: # custom_bars_times is list of lists of (start,end)
            source_audio_segments_times.extend(bar_segments)

        # Ensure custom_bars_times has enough data for the stutter patterns
        # These reference specific beats within the first 4 bars.
        # Example: custom_bars_times[0][0] is the first beat of the first bar.
        first_beat_first_bar = custom_bars_times[0][0]
        first_beat_second_bar = custom_bars_times[1][0]
        first_beat_third_bar = custom_bars_times[2][0]
        first_beat_fourth_bar = custom_bars_times[3][0]
        third_beat_fourth_bar = custom_bars_times[3][2]

        # Stutter patterns:
        # First beat of first bar x 4 (quarter notes implies full duration of original beat)
        for _ in range(4): source_audio_segments_times.append(first_beat_first_bar)
        # First beat of second bar x 4
        for _ in range(4): source_audio_segments_times.append(first_beat_second_bar)
        
        # First beat of third bar x 8 (eighth notes - half duration)
        s, e = first_beat_third_bar
        dur = (e - s) / 2.0
        for _ in range(8): source_audio_segments_times.append((s, s + dur)) # Take first half
        
        # First beat of fourth bar x 8 (sixteenth notes - quarter duration)
        s, e = first_beat_fourth_bar
        dur = (e - s) / 4.0
        for _ in range(8): source_audio_segments_times.append((s, s + dur))
        
        # Third beat of fourth bar x 8 (sixteenth notes - quarter duration)
        s, e = third_beat_fourth_bar
        dur = (e - s) / 4.0
        for _ in range(8): source_audio_segments_times.append((s, s + dur))
        
        # Concatenate pieces from original song based on source_audio_segments_times
        concatenated_song_pieces = self._get_audio_pieces(self.y, self.sr, source_audio_segments_times)

        # Tempo shifting
        # Librosa's beat_track gives tempo, but not discrete time signature changes.
        # For now, assume constant time signature or rely on self.st.shiftTempo to handle duration adjustments.
        # The target tempo is self.template['tempo'] (140 BPM). Original tempo is self.tempo.
        # If self.tempo is 0, avoid division by zero.
        tempo_ratio = self.template['tempo'] / self.tempo if self.tempo > 0 else 1.0
        
        shifted_song_pieces_y, _ = self.st.shiftTempo(concatenated_song_pieces, self.sr, tempo_ratio)
        
        if shifted_song_pieces_y.ndim == 1:    
            shifted_song_pieces_y = self.mono_to_stereo(shifted_song_pieces_y) # Ensure stereo

        # Calculate mixfactor for the intro. The original used 'out' which was the AudioQuantumList.
        # We need to define the time bounds of the original concatenated pieces *before* tempo shifting.
        # This is a bit tricky as source_audio_segments_times can have overlapping/disordered segments for stutters.
        # Let's take the overall span of the source material used for the intro.
        intro_source_start = source_audio_segments_times[0][0]
        intro_source_end = source_audio_segments_times[3*4+3][1] # End of the first 4 bars (16th beat)
        
        mix_f = self.mixfactor((intro_source_start, intro_source_end))

        # Final mix of intro sample with shifted song pieces
        # Ensure intro_sample_y and shifted_song_pieces_y are compatible for truncatemix
        # self.truncatemix expects (y_a, y_b, mix_ratio)
        # intro_sample_y is the dubstep intro sound
        # shifted_song_pieces_y is the processed original song
        return self.truncatemix(intro_sample_y, shifted_song_pieces_y, mix_f)


    def compileSection(self, section_idx, section_time_bounds, hats_y):
        """
            Compiles one "section" of dubstep.
            section_idx: index of the current section (for sample selection variation)
            section_time_bounds: (start_time, end_time) for this section from self.sections
            hats_y: NumPy array for the hat sample audio.
            Returns a tuple of two NumPy arrays (mixed_audio_a, mixed_audio_b)
        """
        # This list will store (start_time, end_time) tuples from the original song for this section's pattern
        onebar_source_segments_times = []

        # searchSamples now takes section_idx and initial_key
        s1_times = self.searchSamples(section_idx, self.tonic)
        s2_times = self.searchSamples(section_idx, (self.tonic + 3) % 12)
        s3_times = self.searchSamples(section_idx, (self.tonic + 9) % 12)
        
        # Determine the most fallback list of times if specific ones are empty
        # The original logic used `max([s1, s2, s3])` which worked on AudioQuantumLists by their length.
        # For lists of time tuples, we check lengths.
        all_searched_times = [s1_times, s2_times, s3_times]
        biggest_times = []
        for i in range(12): # Try all keys if initial searches yield nothing broad
            if any(all_searched_times): # if any list in all_searched_times is not empty
                biggest_times = max(all_searched_times, key=len) # Max by length of list
                if biggest_times: break # Found a non-empty list
            # If all are empty, try searching more broadly for the "biggest" set
            temp_search_key = (self.tonic + i) % 12
            temp_times = self.searchSamples(section_idx, temp_search_key)
            if len(temp_times) > len(biggest_times):
                biggest_times = temp_times
            if not any(all_searched_times) and biggest_times: # If s1,s2,s3 were all empty, but this search found something
                 all_searched_times.append(biggest_times) # Add it so the any() check can pass next iteration

        if not biggest_times and not any(s_list for s_list in [s1_times, s2_times, s3_times]):
             # If absolutely nothing found even after trying all keys for current section,
             # this is a problem. The original raised an exception.
             # For robustness, we could return silence or try a default sound.
             # Let's create a short silent array of the expected channel count (stereo)
             print("Warning: No samples found for section %s. Using silence." % section_idx) # Python 3 print
             silent_bar = np.zeros((2, self.sr)) # 1 second of stereo silence
             return silent_bar, silent_bar

        if not s1_times: s1_times = biggest_times
        if not s2_times: s2_times = biggest_times
        if not s3_times: s3_times = biggest_times
        
        # If any are still empty (e.g., biggest_times itself was empty), this is an issue.
        # The compileIntro had a fallback to generate synthetic beats. Here, it's harder.
        # For now, rely on searchSamples returning *something*, even if it's repeated.
        # If s1_times is empty here, it means biggest_times was also empty. Catastrophic.
        if not s1_times: # Should have been caught by "if not biggest_times" earlier
            raise Exception('Critical error: No samples available for section %s after search and fallback.' % section_idx)


        # Determine f and r based on self.template['target'] ('beats', 'bars', 'tatums')
        # These factors control how many times samples are repeated.
        if self.template['target'] == "tatums": f, r = 4, 2
        elif self.template['target'] == "beats": f, r = 2, 2
        elif self.template['target'] == "bars": f, r = 1, 1
        else: f, r = 2, 2 # Default to "beats" like behavior

        for _ in range(r): # Repeat the 8-unit pattern r times
            for i in range(0, 4 * f): onebar_source_segments_times.append(s1_times[i % len(s1_times)])
            for i in range(4 * f, 6 * f): onebar_source_segments_times.append(s2_times[i % len(s2_times)])
            for i in range(6 * f, 8 * f): onebar_source_segments_times.append(s3_times[i % len(s3_times)])
        
        concatenated_song_pieces = self._get_audio_pieces(self.y, self.sr, onebar_source_segments_times)

        # Tempo shifting. Similar to compileIntro, use tempo_ratio.
        tempo_ratio = self.template['tempo'] / self.tempo if self.tempo > 0 else 1.0
        orig_bar_y, _ = self.st.shiftTempo(concatenated_song_pieces, self.sr, tempo_ratio)
        
        if orig_bar_y.ndim == 1:
            orig_bar_y = self.mono_to_stereo(orig_bar_y)

        # Calculate mixfactor using the time bounds of the source segments for this bar
        # This requires finding min_start and max_end from onebar_source_segments_times
        if not onebar_source_segments_times: # Should not happen if s1_times was not empty
            bar_mix_bounds = section_time_bounds # Fallback to whole section bounds
        else:
            min_start = min(t[0] for t in onebar_source_segments_times)
            max_end = max(t[1] for t in onebar_source_segments_times)
            bar_mix_bounds = (min_start, max_end)
        mix_f = self.mixfactor(bar_mix_bounds)

        # Load wub and splash samples
        wub_sample_path = self.sample_path + self.template['wubs'][self.tonic % len(self.template['wubs'])]
        wub_y, _ = librosa.load(wub_sample_path, sr=self.sr)
        if wub_y.ndim == 1: wub_y = np.vstack([wub_y, wub_y]) # Ensure stereo

        splash_sample_path = self.sample_path + self.template['splashes'][(section_idx + 1) % len(self.template['splashes'])]
        splash_y, _ = librosa.load(splash_sample_path, sr=self.sr)
        if splash_y.ndim == 1: splash_y = np.vstack([splash_y, splash_y])

        wub_break_sample_path = self.sample_path + self.template['wub_breaks'][self.tonic % len(self.template['wub_breaks'])]
        wub_break_y, _ = librosa.load(wub_break_sample_path, sr=self.sr)
        if wub_break_y.ndim == 1: wub_break_y = np.vstack([wub_break_y, wub_break_y])

        # Mix part 'a': (wub + splash) mixed with original bar
        # Simple sum for wub + splash, then use truncatemix
        # Ensure wub_y and splash_y are of same length for simple sum, or pad/truncate
        len_wub = wub_y.shape[1]
        len_splash = splash_y.shape[1]
        max_len = max(len_wub, len_splash)
        
        wub_padded = librosa.util.pad_center(wub_y, size=max_len, axis=1) if len_wub < max_len else wub_y[:, :max_len]
        splash_padded = librosa.util.pad_center(splash_y, size=max_len, axis=1) if len_splash < max_len else splash_y[:, :max_len]
        wub_plus_splash = (wub_padded + splash_padded) * 0.5 # Averaging mix
        
        mixed_audio_a = self.truncatemix(wub_plus_splash, orig_bar_y, mix_f)

        # Mix part 'b': (wub_break + hats) mixed with original bar
        len_wub_break = wub_break_y.shape[1]
        len_hats = hats_y.shape[1]
        max_len_b = max(len_wub_break, len_hats)

        wub_break_padded = librosa.util.pad_center(wub_break_y, size=max_len_b, axis=1) if len_wub_break < max_len_b else wub_break_y[:, :max_len_b]
        hats_padded = librosa.util.pad_center(hats_y, size=max_len_b, axis=1) if len_hats < max_len_b else hats_y[:, :max_len_b]
        wub_break_plus_hats = (wub_break_padded + hats_padded) * 0.5 # Averaging mix

        mixed_audio_b = self.truncatemix(wub_break_plus_hats, orig_bar_y, mix_f)
        
        return mixed_audio_a, mixed_audio_b

    def remix(self):
        """
            Wub wub wub wub wub wub wub wub wub wub wub wub wub wub wub wub wub wub.
        """
        self.log("Looking up track...", 5)
        self.getTag() # From base Remixer, uses Mutagen
        self.processArt() # From base Remixer, uses Mutagen + PIL

        self.log("Listening to %s..." % ('"%s"' % self.tag['title'] if 'title' in self.tag else 'song'), 5)
        # Load audio using Librosa
        self.y, self.sr = librosa.load(self.infile, sr=None, mono=False)
        if self.y.ndim == 1: # Ensure stereo for consistency
            self.y = np.vstack([self.y, self.y])
        
        # self.detectSong is a placeholder in base Remixer, does not need Echonest object.
        # if not 'title' in self.tag:
        #    self.detectSong(None) 
        
        self.st = FastModify() # Already Librosa-based
        
        self.log("Analyzing track for tempo, beats, sections, and key...", 10)
        
        y_mono = librosa.to_mono(self.y) # For analysis features that prefer mono
        
        # Tempo and Beats
        estimated_tempo, self.beat_frames = librosa.beat.beat_track(y=y_mono, sr=self.sr)
        self.tempo = float(estimated_tempo)
        self.beat_times = librosa.frames_to_time(self.beat_frames, sr=self.sr)
        
        # Sections
        section_sample_boundaries = librosa.effects.split(y_mono, top_db=30)
        self.sections = [] 
        for i in range(section_sample_boundaries.shape[0]):
            start_t = librosa.samples_to_time(section_sample_boundaries[i,0], sr=self.sr)
            end_t = librosa.samples_to_time(section_sample_boundaries[i,1], sr=self.sr)
            self.sections.append( (start_t, end_t) )

        # Bars
        self.bar_times = []
        if len(self.beat_times) > 0:
            beats_per_bar = 4 
            beat_duration_approx = 60.0 / self.tempo if self.tempo > 0 else 0.5
            for i in range(0, len(self.beat_times), beats_per_bar):
                bar_start_time = self.beat_times[i]
                if i + beats_per_bar < len(self.beat_times):
                    bar_end_time = self.beat_times[i + beats_per_bar]
                else:
                    bar_end_time = self.beat_times[-1] + beat_duration_approx
                    song_total_duration = librosa.get_duration(y=self.y, sr=self.sr)
                    if bar_end_time > song_total_duration: bar_end_time = song_total_duration
                self.bar_times.append((bar_start_time, bar_end_time))

        # Pre-calculate pitch classes for all beats and bars
        self.beat_pitch_data = []
        avg_beat_dur = 60.0 / self.tempo if self.tempo > 0 else 0.5
        for i, start_t in enumerate(self.beat_times):
            end_t = self.beat_times[i+1] if i+1 < len(self.beat_times) else start_t + avg_beat_dur
            start_sample = librosa.time_to_samples(start_t, sr=self.sr)
            end_sample = librosa.time_to_samples(end_t, sr=self.sr)
            if start_sample < end_sample and end_sample <= self.y.shape[1]: # Ensure valid slice
                segment_y_mono = librosa.to_mono(self.y[..., start_sample:end_sample])
                if segment_y_mono.size > 0:
                    n_fft = 2048
                    if segment_y_mono.size < n_fft:
                        n_fft = 2**(segment_y_mono.size.bit_length() - 1)

                    # n_fft must be positive for chroma_stft
                    if n_fft > 0:
                        chroma = librosa.feature.chroma_stft(y=segment_y_mono, sr=self.sr, n_fft=n_fft)
                        dom_pitch = np.argmax(np.sum(chroma, axis=1)).item()
                        self.beat_pitch_data.append((start_t, end_t, dom_pitch))
        
        self.bar_pitch_data = []
        for start_t, end_t in self.bar_times:
            start_sample = librosa.time_to_samples(start_t, sr=self.sr)
            end_sample = librosa.time_to_samples(end_t, sr=self.sr)
            if start_sample < end_sample and end_sample <= self.y.shape[1]: # Ensure valid slice
                segment_y_mono = librosa.to_mono(self.y[..., start_sample:end_sample])
                if segment_y_mono.size > 0:
                    n_fft = 2048
                    if segment_y_mono.size < n_fft:
                        n_fft = 2**(segment_y_mono.size.bit_length() - 1)

                    # n_fft must be positive for chroma_stft
                    if n_fft > 0:
                        chroma = librosa.feature.chroma_stft(y=segment_y_mono, sr=self.sr, n_fft=n_fft)
                        dom_pitch = np.argmax(np.sum(chroma, axis=1)).item()
                        self.bar_pitch_data.append((start_t, end_t, dom_pitch))

        # Tonic (Key) - Overall key for the track
        if y_mono.size > 0:
            n_fft = 2048
            if y_mono.size < n_fft:
                n_fft = 2**(y_mono.size.bit_length() - 1)

            if n_fft > 0:
                chromagram = librosa.feature.chroma_stft(y=y_mono, sr=self.sr, n_fft=n_fft)
                chroma_energies = np.sum(chromagram, axis=1)
                self.tonic = np.argmax(chroma_energies).item()
            else:
                self.tonic = 0 # Default to C if track is too short for any FFT
        else:
            self.tonic = 0 # Default to C if track is empty

        self.tag['key'] = self.keys[self.tonic] if self.tonic >= 0 and self.tonic < 12 else '?'
        self.tag['tempo'] = self.template['tempo'] 

        # Compile Intro
        num_sections_for_log = len(self.sections) if self.sections else 1
        self.log("Arranging intro...", 40.0 / (num_sections_for_log + 1))
        intro_audio_y = self.compileIntro() # Returns NumPy array
        self.partialEncode(intro_audio_y, self.sr) # Pass self.sr

        # Load Hat sample (used in compileSection)
        hats_sample_path = self.sample_path + self.template['hats']
        hats_y, _ = librosa.load(hats_sample_path, sr=self.sr) # Resample to self.sr
        if hats_y.ndim == 1: hats_y = np.vstack([hats_y, hats_y]) # Ensure stereo

        # Compile Sections
        current_section_idx = 0 # Used for splash_ends if no sections
        if self.sections: # Check if sections were found
            for i, section_bounds_tuple in enumerate(self.sections):
                current_section_idx = i
                self.log("Arranging section %s of %s..." % (i + 1, len(self.sections)), 40.0 / (num_sections_for_log + 1))
                # compileSection expects (section_idx, section_time_bounds_tuple, hats_y)
                audio_a, audio_b = self.compileSection(current_section_idx, section_bounds_tuple, hats_y) # Pass current_section_idx
                self.partialEncode(audio_a, self.sr) # Pass self.sr
                self.partialEncode(audio_b, self.sr) # Pass self.sr
                del audio_a, audio_b # Free memory
        else: # No sections found, maybe log or handle differently
            self.log("No sections found by analysis. Skipping section compilation.", 0)
        
        del hats_y # Free memory for hat sample

        # self.original.unload() is no longer needed as self.y is a NumPy array managed by Python's GC.

        # Add Ending Splash
        self.log("Adding ending...", 5)
        end_splash_path = self.sample_path + self.template['splash_ends'][(current_section_idx + 1) % len(self.template['splash_ends'])]
        end_splash_y, _ = librosa.load(end_splash_path, sr=self.sr)
        if end_splash_y.ndim == 1: end_splash_y = np.vstack([end_splash_y, end_splash_y])
        self.partialEncode(end_splash_y, self.sr) # Pass self.sr
        
        self.log("Mixing down WAV...", 5) # Changed log from "Mixing..."
        self.mixwav(self.tempfile) # Concatenates all partially encoded WAVs

        self.log("Encoding to MP3...", 5) # Changed log from "Mastering..."
        self.lame(self.tempfile, self.outfile) # self.tempfile is WAV, self.outfile is MP3

        # Original file deletion logic
        if self.deleteOriginal and hasattr(self, 'infile') and self.infile:
            try:
                unlink(self.infile)
            except OSError: # More specific exception
                pass 
        
        # It's good practice to remove the large temporary WAV after MP3 encoding
        try:
            unlink(self.tempfile)
        except OSError:
            pass

        self.log("Adding ID3 tags and artwork...", 20) # Changed log
        self.updateTags(titleSuffix=" (Wub Machine Remix)")
        
        return self.outfile # As per original return, though True is also an option

if __name__ == "__main__":
    CMDRemix(Dubstep)
