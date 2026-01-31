/**
 * IndexedDB service for persisting remix projects and analysis cache
 * Provides local-first storage for offline capability
 */

const DB_NAME = 'wub-machine';
const DB_VERSION = 1;

interface RemixProject {
  id: string;
  name: string;
  originalFileName: string;
  originalFileSize: number;
  remixes: RemixEntry[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
}

interface RemixEntry {
  id: string;
  style: 'dubstep' | 'electrohouse';
  audioData: ArrayBuffer;
  tempo: number;
  beats: number[];
  duration: number;
  createdAt: number;
}

interface AnalysisCache {
  audioHash: string; // SHA256 of original audio
  tempo: number;
  beats: number[];
  bars: Array<[number, number]>;
  chromagrams: number[];
  loudness: number[];
  sections: Array<[number, number]>;
  duration: number;
  cachedAt: number;
}

interface ProjectMetadata {
  totalProjects: number;
  totalRemixes: number;
  totalStorageBytes: number;
}

class WubMachineDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[v0] IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Projects store
        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', {
            keyPath: 'id',
          });
          projectStore.createIndex('createdAt', 'createdAt', { unique: false });
          projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Analysis cache store
        if (!db.objectStoreNames.contains('analysis_cache')) {
          const cacheStore = db.createObjectStore('analysis_cache', {
            keyPath: 'audioHash',
          });
          cacheStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        }

        // Metadata store (single document)
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'id' });
        }
      };
    });
  }

  async saveProject(project: RemixProject): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['projects', 'metadata'], 'readwrite');
      const store = transaction.objectStore('projects');

      // Update project
      const putRequest = store.put(project);

      putRequest.onerror = () => reject(new Error('Failed to save project'));
      putRequest.onsuccess = () => {
        // Update metadata
        this.updateMetadata();
        resolve();
      };
    });
  }

  async getProject(projectId: string): Promise<RemixProject | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['projects'], 'readonly');
      const store = transaction.objectStore('projects');
      const request = store.get(projectId);

      request.onerror = () => reject(new Error('Failed to retrieve project'));
      request.onsuccess = () => {
        resolve(request.result || null);
      };
    });
  }

  async getAllProjects(): Promise<RemixProject[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['projects'], 'readonly');
      const store = transaction.objectStore('projects');
      const index = store.index('updatedAt');
      const request = index.getAll();

      request.onerror = () => reject(new Error('Failed to retrieve projects'));
      request.onsuccess = () => {
        const projects = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(projects);
      };
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['projects', 'metadata'], 'readwrite');
      const store = transaction.objectStore('projects');
      const deleteRequest = store.delete(projectId);

      deleteRequest.onerror = () => reject(new Error('Failed to delete project'));
      deleteRequest.onsuccess = () => {
        this.updateMetadata();
        resolve();
      };
    });
  }

  async cacheAnalysis(
    audioHash: string,
    analysis: Omit<AnalysisCache, 'audioHash' | 'cachedAt'>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const cacheEntry: AnalysisCache = {
      ...analysis,
      audioHash,
      cachedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['analysis_cache'], 'readwrite');
      const store = transaction.objectStore('analysis_cache');
      const request = store.put(cacheEntry);

      request.onerror = () => reject(new Error('Failed to cache analysis'));
      request.onsuccess = () => resolve();
    });
  }

  async getAnalysisCache(audioHash: string): Promise<AnalysisCache | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['analysis_cache'], 'readonly');
      const store = transaction.objectStore('analysis_cache');
      const request = store.get(audioHash);

      request.onerror = () => reject(new Error('Failed to retrieve analysis cache'));
      request.onsuccess = () => {
        resolve(request.result || null);
      };
    });
  }

  async clearAnalysisCache(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['analysis_cache'], 'readwrite');
      const store = transaction.objectStore('analysis_cache');
      const request = store.clear();

      request.onerror = () => reject(new Error('Failed to clear cache'));
      request.onsuccess = () => resolve();
    });
  }

  private async updateMetadata(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const projectTransaction = this.db!.transaction(['projects'], 'readonly');
      const projectStore = projectTransaction.objectStore('projects');
      const getAllProjects = projectStore.getAll();

      getAllProjects.onsuccess = () => {
        const projects = getAllProjects.result as RemixProject[];
        let totalRemixes = 0;
        let totalStorageBytes = 0;

        projects.forEach((project) => {
          totalRemixes += project.remixes.length;
          project.remixes.forEach((remix) => {
            totalStorageBytes += remix.audioData.byteLength;
          });
        });

        const metadata: ProjectMetadata = {
          totalProjects: projects.length,
          totalRemixes,
          totalStorageBytes,
        };

        const metadataTransaction = this.db!.transaction(['metadata'], 'readwrite');
        const metadataStore = metadataTransaction.objectStore('metadata');
        metadataStore.put({ id: 'stats', ...metadata });

        resolve();
      };
    });
  }

  async getMetadata(): Promise<ProjectMetadata | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['metadata'], 'readonly');
      const store = transaction.objectStore('metadata');
      const request = store.get('stats');

      request.onerror = () => reject(new Error('Failed to retrieve metadata'));
      request.onsuccess = () => {
        resolve(request.result || null);
      };
    });
  }

  async getStorageQuota(): Promise<{ used: number; quota: number }> {
    if (!navigator.storage || !navigator.storage.estimate) {
      return { used: 0, quota: 0 };
    }

    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  }

  async requestPersistentStorage(): Promise<boolean> {
    if (!navigator.storage || !navigator.storage.persist) {
      return false;
    }

    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
}

// Singleton instance
let dbInstance: WubMachineDB | null = null;

export async function getDB(): Promise<WubMachineDB> {
  if (!dbInstance) {
    dbInstance = new WubMachineDB();
    await dbInstance.init();
  }
  return dbInstance;
}

export type { RemixProject, RemixEntry, AnalysisCache, ProjectMetadata };
