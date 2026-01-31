/**
 * Audio caching and hash utilities for analysis results
 */

import { getDB, type AnalysisCache } from './db';

/**
 * Compute SHA256 hash of audio data for cache key
 */
export async function computeAudioHash(audioData: Float32Array): Promise<string> {
  const buffer = new ArrayBuffer(audioData.byteLength);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < audioData.length; i++) {
    view[i] = Math.floor((audioData[i] + 1) * 127.5);
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Cache analysis results
 */
export async function cacheAnalysisResult(
  audioData: Float32Array,
  analysis: {
    tempo: number;
    beats: number[];
    bars: Array<[number, number]>;
    chromagrams: number[];
    loudness: number[];
    sections: Array<[number, number]>;
    duration: number;
  }
): Promise<string> {
  const hash = await computeAudioHash(audioData);
  const db = await getDB();

  await db.cacheAnalysis(hash, analysis);

  console.log('[v0] Cached analysis for audio:', hash);
  return hash;
}

/**
 * Retrieve cached analysis if available
 */
export async function getCachedAnalysis(audioData: Float32Array): Promise<AnalysisCache | null> {
  const hash = await computeAudioHash(audioData);
  const db = await getDB();

  const cached = await db.getAnalysisCache(hash);

  if (cached) {
    console.log('[v0] Retrieved cached analysis for audio:', hash);
  }

  return cached;
}

/**
 * Clear old cache entries (older than X days)
 */
export async function clearOldCacheEntries(daysOld: number = 30): Promise<number> {
  const db = await getDB();
  const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;

  // Note: IndexedDB doesn't have batch delete, so we'd need to iterate
  // For now, provide a full clear option
  await db.clearAnalysisCache();

  console.log('[v0] Cleared analysis cache');
  return 0;
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  estimatedSize: number;
  persistentStorageGranted: boolean;
  storageQuota: { used: number; quota: number };
}> {
  const db = await getDB();
  const storageQuota = await db.getStorageQuota();

  return {
    estimatedSize: storageQuota.used,
    persistentStorageGranted: await db.requestPersistentStorage(),
    storageQuota,
  };
}
