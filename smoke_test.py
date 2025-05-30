import os
import shutil
import traceback
import sys # For exit code

# Ensure project root is in path.
# This allows imports like `from helpers.fastmodify import ...` or `from remixers.module import ...`
project_root = os.path.abspath(os.path.dirname(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)


from remixer import Remixer # Base class, CMDRemix is also in remixer.py but not used for direct instantiation here
from remixers.blank import Blank
from remixers.beatbox import Beatbox
from remixers.doubletime import DoubleTime
from remixers.dubstep import Dubstep

# --- Configuration ---
ORIGINAL_SAMPLE_PATH = "samples/dubstep/intro-eight.wav" # Using a known sample
TEMP_TEST_DIR = "tmp_smoke_test_outputs"
TEMP_INPUT_FILENAME = "test_input.wav"

# --- Helper Functions ---
def is_tool_available(name):
    """Check whether `name` is on PATH and marked as executable."""
    return shutil.which(name) is not None

# --- Mock Parent Class ---
class MockParent:
    def __init__(self, name="MockParent"):
        self.name = name

    def updateTrack(self, uid, tag):
        # print(f"{self.name}: updateTrack called for {uid} with {tag}")
        pass # Keep output clean for test results

    def finish(self, uid, last_status):
        # print(f"{self.name}: finish called for {uid} with {last_status}")
        pass # Keep output clean for test results

# --- Main Test Logic ---
def run_smoke_tests():
    print("Starting smoke tests for refactored remixers...")
    
    if not os.path.exists(ORIGINAL_SAMPLE_PATH):
        print(f"ERROR: Original sample '{ORIGINAL_SAMPLE_PATH}' not found. Cannot run tests.")
        sys.exit(1)

    # Create temp directory for outputs and temporary input
    if os.path.exists(TEMP_TEST_DIR):
        shutil.rmtree(TEMP_TEST_DIR) # Clean up from previous runs
    os.makedirs(TEMP_TEST_DIR)
    
    temp_input_path = os.path.join(TEMP_TEST_DIR, TEMP_INPUT_FILENAME)

    mock_parent = MockParent()
    remixers_to_test = [Blank, Beatbox, DoubleTime, Dubstep]
    results = {}
    all_passed = True

    for RemixerClass in remixers_to_test:
        remixer_name = RemixerClass.__name__
        print(f"\n--- Testing {remixer_name} ---")
        
        output_file = os.path.join(TEMP_TEST_DIR, f"{remixer_name.lower()}_output.mp3")

        # Check for external tool dependencies
        if remixer_name == "DoubleTime" and not is_tool_available("soundstretch"):
            print("SKIPPED: DoubleTime - soundstretch command not found.")
            results[remixer_name] = "SKIPPED"
            continue 
        
        # Check for required sample directories for specific remixers
        required_sample_dir = os.path.join(project_root, "samples", remixer_name.lower())
        if remixer_name in ["Beatbox", "Dubstep"]:
            if not os.path.isdir(required_sample_dir):
                print(f"SKIPPED: {remixer_name} - Sample directory '{required_sample_dir}' not found.")
                results[remixer_name] = "SKIPPED"
                continue

        try:
            print(f"Preparing input: copying '{ORIGINAL_SAMPLE_PATH}' to '{temp_input_path}'")
            shutil.copyfile(ORIGINAL_SAMPLE_PATH, temp_input_path)
            
            # Debugging for Dubstep file loading issue
            if remixer_name == "Dubstep":
                abs_temp_input_path = os.path.abspath(temp_input_path)
                print(f"Dubstep Test: Absolute path to temp input file: {abs_temp_input_path}")
                if not os.path.exists(abs_temp_input_path):
                    print(f"Dubstep Test ERROR: Copied file '{abs_temp_input_path}' does NOT exist before instantiation!")
                else:
                    print(f"Dubstep Test: Copied file '{abs_temp_input_path}' confirmed to exist before instantiation.")


            print(f"Instantiating {remixer_name} with infile='{temp_input_path}', outfile='{output_file}'")
            remixer_instance = RemixerClass(parent=mock_parent, infile=temp_input_path, outfile=output_file)
            remixer_instance.deleteOriginal = False # Keep the temp_input_path

            print(f"Running {remixer_name}.start() and join()...")
            remixer_instance.start() # Start the thread
            remixer_instance.join()  # Wait for completion (timeout is 600s by default in Remixer)

            if os.path.exists(output_file) and os.path.getsize(output_file) > 0:
                print(f"SUCCESS: {remixer_name} - Output file '{output_file}' created and is not empty.")
                results[remixer_name] = "PASS"
            elif os.path.exists(output_file): # File exists but is empty
                 print(f"FAIL: {remixer_name} - Output file '{output_file}' was created BUT IS EMPTY.")
                 results[remixer_name] = "FAIL"
                 all_passed = False
            else:
                print(f"FAIL: {remixer_name} - Output file '{output_file}' NOT created.")
                results[remixer_name] = "FAIL"
                all_passed = False
        except Exception as e:
            print(f"FAIL: {remixer_name} - Exception occurred: {e}")
            traceback.print_exc()
            results[remixer_name] = "FAIL"
            all_passed = False
        finally:
            # Clean up the copied input file for the next test
            if os.path.exists(temp_input_path):
                os.remove(temp_input_path)

    # --- Summary and Cleanup ---
    print("\n\n--- Smoke Test Summary ---")
    for remixer_name, result in results.items():
        print(f"{remixer_name}: {result}")

    print(f"\nCleaning up temporary directory: {TEMP_TEST_DIR}")
    if os.path.exists(TEMP_TEST_DIR):
        shutil.rmtree(TEMP_TEST_DIR)

    if all_passed:
        print("\nAll smoke tests passed!")
        return 0 # Exit code 0 for success
    else:
        print("\nSome smoke tests FAILED.")
        return 1 # Exit code 1 for failure

if __name__ == "__main__":
    exit_code = run_smoke_tests()
    sys.exit(exit_code)
