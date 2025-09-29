console.log("Wub Machine JS Initialized");

// DOM Elements
const fileInput = document.getElementById('file-input');
const remixStyleSelect = document.getElementById('remix-style');
const remixButton = document.getElementById('remix-button');
const progressText = document.getElementById('progress-text');
const progressBar = document.getElementById('progress-bar');
const downloadLink = document.getElementById('download-link');

// --- State ---
let remixWorker = null;

// --- Functions ---

/**
 * Updates the UI to reflect remixing progress.
 * @param {string} text - The status text to display.
 * @param {number} progress - The progress percentage (0-100).
 */
function updateProgress(text, progress) {
    progressText.textContent = text;
    progressBar.value = progress;
}

/**
 * Handles the completion of a remix.
 * @param {Blob} resultBlob - The remixed audio data.
 * @param {string} filename - The suggested filename for the download.
 */
function onRemixComplete(resultBlob, filename) {
    const url = URL.createObjectURL(resultBlob);
    downloadLink.href = url;
    downloadLink.textContent = `Download ${filename}`;
    downloadLink.download = filename;
    downloadLink.style.display = 'block';
    remixButton.disabled = false;
    updateProgress('Remix complete!', 100);
}

/**
 * Initializes the Remix Web Worker and sets up message handling.
 */
function initializeWorker() {
    remixWorker = new Worker(new URL('./workers/remix.worker.js', import.meta.url), {
        type: 'module'
    });

    remixWorker.onmessage = (event) => {
        const { type, payload } = event.data;

        switch (type) {
            case 'WORKER_READY':
                console.log('Remix worker is ready.');
                remixButton.disabled = false;
                updateProgress('Ready. Select a file and a remix style.', 0);
                break;
            case 'PROGRESS':
                updateProgress(payload.text, payload.progress);
                break;
            case 'REMIX_COMPLETE':
                onRemixComplete(payload.result, payload.filename);
                break;
            case 'ERROR':
                console.error('Worker error:', payload.message);
                remixButton.disabled = false;
                updateProgress(`Error: ${payload.message}`, 0);
                break;
        }
    };

    remixWorker.onerror = (error) => {
        console.error('Unhandled worker error:', error);
        remixButton.disabled = false;
        updateProgress('A critical worker error occurred. See console for details.', 0);
    };
}

// --- Event Listeners ---

remixButton.addEventListener('click', () => {
    const file = fileInput.files[0];
    const style = remixStyleSelect.value;

    if (!file) {
        alert('Please select a file first.');
        return;
    }

    if (!remixWorker) {
        alert('Worker is not ready. Please wait a moment.');
        return;
    }

    remixButton.disabled = true;
    downloadLink.style.display = 'none';
    updateProgress('Sending file to the remixer...', 0);

    remixWorker.postMessage({
        type: 'START_REMIX',
        payload: {
            file,
            style
        }
    });
});

// --- Initialization ---

// Populate remixer styles (these will eventually come from the ported remixer classes)
const styles = ['Dubstep', 'ElectroHouse', 'Beatbox', 'DoubleTime'];
styles.forEach(style => {
    const option = document.createElement('option');
    option.value = style;
    option.textContent = style;
    remixStyleSelect.appendChild(option);
});

remixButton.disabled = true;
updateProgress('Initializing remix worker...', 0);
initializeWorker();