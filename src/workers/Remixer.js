// src/workers/Remixer.js
import * as musicMetadata from 'music-metadata-browser';

/**
 * A base class for all remixers, mirroring the functionality of the original Python Remixer.
 * This class is designed to run within a Web Worker.
 */
export class Remixer {
    /**
     * @param {object} options
     * @param {string} options.uid - The unique ID for this remix job.
     * @param {File} options.file - The user's audio file.
     * @param {string} options.style - The selected remixer style.
     * @param {function} options.progressCallback - Function to post messages back to the main worker scope.
     */
    constructor({ uid, file, style, progressCallback }) {
        this.uid = uid;
        this.file = file;
        this.style = style;
        this.progressCallback = progressCallback;

        this.status = 0; // 0: waiting, 1: running, -1: error
        this.progress = 0;
        this.step = 'Initialized';
        this.tag = {}; // To store audio metadata
        this.art = { // To store artwork Blobs
            original: null,
            thumbnail: null
        };
    }

    /**
     * Sends a progress update.
     * @param {string} text - The description of the current step.
     * @param {number} progressIncrement - The percentage to increase the progress by.
     */
    log(text, progressIncrement) {
        this.progress += progressIncrement;
        if (this.progress > 100) this.progress = 100;
        this.step = text;
        this.progressCallback({
            type: 'PROGRESS',
            payload: { text: this.step, progress: this.progress }
        });
    }

    /**
     * Reports a fatal error.
     * @param {string} message - The error message.
     */
    error(message) {
        console.error(`Remixer Error [${this.uid}]: ${message}`);
        this.status = -1;
        this.progressCallback({
            type: 'ERROR',
            payload: { message }
        });
    }

    /**
     * The main entry point to start the remixing process.
     */
    async run() {
        this.status = 1;
        this.log('Starting...', 0);

        try {
            await this.getTag();
            this.log(`Found metadata for "${this.tag.title || this.file.name}"`, 5);

            await this.processArt();
            this.log('Processed album art', 5);

            const result = await this.remix();
            if (!result) {
                throw new Error("Remixing produced no result.");
            }

            this.log('Remix complete!', 100 - this.progress);
            return result;

        } catch (err) {
            this.error(err.message);
            return null;
        }
    }

    /**
     * Reads metadata (ID3 tags) from the audio file using music-metadata-browser.
     */
    async getTag() {
        try {
            const metadata = await musicMetadata.parseBlob(this.file);
            const { common, format } = metadata;
            this.tag = {
                title: common.title,
                artist: common.artist,
                album: common.album,
                bitrate: format.bitrate,
                length: format.duration,
                samplerate: format.sampleRate,
                channels: format.numberOfChannels,
            };
            this.metadata = metadata; // Keep full metadata for art processing
        } catch (err) {
            console.warn("Could not parse audio metadata:", err.message);
            this.tag = { title: this.file.name }; // Fallback to filename
        }
        return true;
    }

    /**
     * Extracts and processes album art from the file using the Canvas API.
     */
    async processArt() {
        if (!this.metadata || !this.metadata.common.picture || this.metadata.common.picture.length === 0) {
            this.log('No album art found.', 0);
            return false;
        }

        try {
            const picture = this.metadata.common.picture[0];
            const imageBlob = new Blob([picture.data], { type: picture.format });

            // Create original art blob
            this.art.original = imageBlob;

            // Create thumbnail
            const imageBitmap = await createImageBitmap(imageBlob);
            const thumbnailSize = 64; // e.g., 64x64 thumbnail
            const canvas = new OffscreenCanvas(thumbnailSize, thumbnailSize);
            const ctx = canvas.getContext('2d');

            ctx.drawImage(imageBitmap, 0, 0, thumbnailSize, thumbnailSize);

            this.art.thumbnail = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });

            return true;
        } catch (err) {
            console.warn("Could not process album art:", err.message);
            return false;
        }
    }

    /**
     * The core remixing function. This MUST be overridden by subclasses.
     * @returns {Promise<{resultBlob: Blob, filename: string}>} The remixed audio as a Blob and a suggested filename.
     */
    async remix() {
        this.log('Running stub remix...', 20);
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate work

        // This is a placeholder. Subclasses will do real work.
        const fakeMp3 = new Blob(['This is a fake MP3 from the base class'], { type: 'audio/mpeg' });

        return {
            resultBlob: fakeMp3,
            filename: `remix_${this.file.name}.mp3`
        };
    }
}