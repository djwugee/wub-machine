import { useState, useCallback, useEffect } from 'react';
import { getDB, type RemixProject, type RemixEntry } from './db';
import { cacheAnalysisResult, getCachedAnalysis } from './cache';

export function useProjects() {
  const [projects, setProjects] = useState<RemixProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const db = await getDB();
      const loadedProjects = await db.getAllProjects();
      setProjects(loadedProjects);
      console.log('[v0] Loaded projects:', loadedProjects.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load projects';
      setError(message);
      console.error('[v0] Error loading projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const createProject = useCallback(
    async (
      name: string,
      originalFileName: string,
      originalFileSize: number,
      metadata?: Record<string, any>
    ): Promise<RemixProject> => {
      try {
        const db = await getDB();
        const project: RemixProject = {
          id: generateId(),
          name,
          originalFileName,
          originalFileSize,
          remixes: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metadata,
        };

        await db.saveProject(project);
        setProjects((prev) => [project, ...prev]);
        console.log('[v0] Created project:', project.id);

        return project;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create project';
        setError(message);
        throw err;
      }
    },
    []
  );

  const addRemixToProject = useCallback(
    async (
      projectId: string,
      remix: Omit<RemixEntry, 'id' | 'createdAt'>
    ): Promise<RemixProject> => {
      try {
        const db = await getDB();
        const project = await db.getProject(projectId);

        if (!project) {
          throw new Error(`Project ${projectId} not found`);
        }

        const remixEntry: RemixEntry = {
          ...remix,
          id: generateId(),
          createdAt: Date.now(),
        };

        project.remixes.push(remixEntry);
        project.updatedAt = Date.now();

        await db.saveProject(project);
        setProjects((prev) =>
          prev.map((p) => (p.id === projectId ? project : p))
        );

        console.log('[v0] Added remix to project:', {
          projectId,
          remixId: remixEntry.id,
          style: remix.style,
        });

        return project;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add remix';
        setError(message);
        throw err;
      }
    },
    []
  );

  const deleteProject = useCallback(async (projectId: string) => {
    try {
      const db = await getDB();
      await db.deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      console.log('[v0] Deleted project:', projectId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete project';
      setError(message);
      throw err;
    }
  }, []);

  const updateProject = useCallback(
    async (projectId: string, updates: Partial<RemixProject>) => {
      try {
        const db = await getDB();
        const project = await db.getProject(projectId);

        if (!project) {
          throw new Error(`Project ${projectId} not found`);
        }

        const updated = {
          ...project,
          ...updates,
          updatedAt: Date.now(),
        };

        await db.saveProject(updated);
        setProjects((prev) =>
          prev.map((p) => (p.id === projectId ? updated : p))
        );

        console.log('[v0] Updated project:', projectId);
        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update project';
        setError(message);
        throw err;
      }
    },
    []
  );

  return {
    projects,
    isLoading,
    error,
    createProject,
    addRemixToProject,
    deleteProject,
    updateProject,
    reloadProjects: loadProjects,
  };
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}
