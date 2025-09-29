// remix.worker.js
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import initSqlJs from 'sql.js';
import { Remixer } from './Remixer.js'; // Import the base class

console.log("Remix Worker loaded.");

let ffmpeg = null;
let db = null;

// A placeholder for dynamically loaded remixer classes
const remixerClasses = {
    // 'Dubstep': DubstepRemixer, // This will be added in a future step
};


// --- Initialization ---

async function initialize() {
    self.postMessage({ type: 'PROGRESS', payload: { text: 'Loading FFmpeg & Database...', progress: 0 } });

    try {
        // Load FFmpeg
        ffmpeg = new FFmpeg();
        ffmpeg.on('log', ({ message }) => { /* console.log('FFMPEG:', message); */ });
        await ffmpeg.load({
            coreURL: new URL('/node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', import.meta.url).href,
            wasmURL: new URL('/node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm', import.meta.url).href
        });

        // Load Database
        const SQL = await initSqlJs({
            locateFile: file => new URL(`/node_modules/sql.js/dist/${file}`, import.meta.url).href
        });
        db = new SQL.Database();

        // Create tables
        db.run(`
            CREATE TABLE IF NOT EXISTS tracks (uid TEXT PRIMARY KEY, style TEXT, hash TEXT, size INTEGER, time DATETIME);
            CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, action TEXT, success BOOLEAN, detail TEXT, start DATETIME, end DATETIME);
        `);
        console.log("Database tables created successfully.");

        self.postMessage({ type: 'WORKER_READY' });
    } catch (error) {
        console.error("Failed to initialize worker:", error);
        self.postMessage({ type: 'ERROR', payload: { message: `Initialization failed: ${error.message}` } });
    }
}

// --- Main Message Handler ---

self.onmessage = async (event) => {
    const { type, payload } = event.data;
    console.log(`Worker received message of type: ${type}`);

    if (type === 'START_REMIX') {
        if (!ffmpeg || !ffmpeg.loaded || !db) {
            self.postMessage({ type: 'ERROR', payload: { message: 'Worker is not ready.' } });
            return;
        }

        const { file, style } = payload;
        const uid = crypto.randomUUID().replace(/-/g, '');

        // --- Database: Log Upload Event ---
        const startTime = new Date().toISOString();
        db.run("INSERT INTO events (uid, action, success, detail, start) VALUES (?, ?, ?, ?, ?)", [uid, 'upload', true, file.name, startTime]);

        const progressCallback = (message) => self.postMessage(message);

        // --- Instantiate the Remixer ---
        // For now, we use the base Remixer as a placeholder.
        // In the future, we will dynamically select the class based on `style`.
        const RemixerClass = remixerClasses[style] || Remixer;
        const remixerInstance = new RemixerClass({ uid, file, style, progressCallback });

        try {
            const result = await remixerInstance.run();

            if (result && result.resultBlob) {
                // --- Database: Log Track Info ---
                db.run("INSERT INTO tracks (uid, style, size, time) VALUES (?, ?, ?, ?)", [uid, style, file.size, new Date().toISOString()]);

                // --- Database: Log Remix Event ---
                const endTime = new Date().toISOString();
                db.run("INSERT INTO events (uid, action, success, start, end) VALUES (?, ?, ?, ?, ?)", [uid, 'remix', true, startTime, endTime]);

                self.postMessage({
                    type: 'REMIX_COMPLETE',
                    payload: {
                        result: result.resultBlob,
                        filename: result.filename
                    }
                });
            } else {
                throw new Error("Remix finished without a result blob.");
            }

        } catch (error) {
            console.error('Error during remix process:', error);
            const endTime = new Date().toISOString();
            db.run("INSERT INTO events (uid, action, success, detail, start, end) VALUES (?, ?, ?, ?, ?, ?)", [uid, 'remix', false, error.message, startTime, endTime]);
            // The remixer instance's error handler will have already sent the error message.
        }
    }
};

// --- Start Initialization ---
initialize();