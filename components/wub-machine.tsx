"use client";

import { useState, useCallback, useEffect } from "react";
import { FileUpload } from "./file-upload";
import { RemixSelector } from "./remix-selector";
import { RemixProgressDisplay } from "./remix-progress";
import { AudioPlayer } from "./audio-player";
import { getWubMachineEngine, type RemixStyle, type RemixProgress } from "@/lib/audio-engine";

type AppState = "upload" | "select-style" | "processing" | "complete" | "error";

export function WubMachine() {
  const [state, setState] = useState<AppState>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<RemixProgress>({
    status: "analyzing",
    progress: 0,
    text: "Ready to remix...",
  });
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cleanup URL on unmount or reset
  useEffect(() => {
    return () => {
      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
      }
    };
  }, [resultUrl]);

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setState("select-style");
    setErrorMessage(null);
  }, []);

  const handleStyleSelect = useCallback(
    async (style: RemixStyle) => {
      if (!selectedFile) return;

      setState("processing");
      setProgress({
        status: "analyzing",
        progress: 0,
        text: "Starting remix...",
      });

      const engine = getWubMachineEngine();
      engine.setProgressCallback(setProgress);

      try {
        const resultBuffer = await engine.remix(selectedFile, style);
        const wavBlob = engine.exportToWav(resultBuffer);
        const url = URL.createObjectURL(wavBlob);

        setResultUrl(url);
        setState("complete");
      } catch (error) {
        console.error("Remix error:", error);
        setErrorMessage(
          error instanceof Error ? error.message : "An error occurred during remixing"
        );
        setProgress({
          status: "error",
          progress: 0,
          text: "Remix failed. Please try again.",
        });
        setState("error");
      }
    },
    [selectedFile]
  );

  const handleReset = useCallback(() => {
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
    }
    setSelectedFile(null);
    setResultUrl(null);
    setErrorMessage(null);
    setProgress({
      status: "analyzing",
      progress: 0,
      text: "Ready to remix...",
    });
    setState("upload");
  }, [resultUrl]);

  return (
    <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-3xl mx-auto">
        {/* Hero text */}
        {state === "upload" && (
          <div className="text-center mb-12">
            <h2 className="text-4xl sm:text-5xl font-bold text-[var(--foreground)] mb-4 text-balance">
              Turn any song into{" "}
              <span className="bg-gradient-to-r from-[var(--primary)] via-[var(--accent)] to-[var(--secondary)] bg-clip-text text-transparent">
                dubstep
              </span>
            </h2>
            <p className="text-lg text-[var(--muted-foreground)] max-w-xl mx-auto text-pretty">
              Upload your favorite track and watch the magic happen. 
              All processing runs in your browser - no uploads to any server!
            </p>
          </div>
        )}

        {/* File upload */}
        {state === "upload" && (
          <FileUpload onFileSelect={handleFileSelect} />
        )}

        {/* Style selector */}
        {state === "select-style" && (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-lg text-[var(--foreground)]">
                Selected: <span className="font-semibold">{selectedFile?.name}</span>
              </p>
            </div>
            <RemixSelector onSelect={handleStyleSelect} />
            <div className="text-center">
              <button
                onClick={handleReset}
                className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                Choose a different file
              </button>
            </div>
          </div>
        )}

        {/* Processing progress */}
        {(state === "processing" || state === "error") && (
          <div className="space-y-6">
            <RemixProgressDisplay
              progress={progress}
              fileName={selectedFile?.name}
            />
            {state === "error" && (
              <div className="text-center space-y-4">
                {errorMessage && (
                  <p className="text-sm text-[var(--destructive)]">{errorMessage}</p>
                )}
                <button
                  onClick={handleReset}
                  className="px-6 py-2 rounded-lg bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)] transition-colors"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Completed - show player */}
        {state === "complete" && resultUrl && selectedFile && (
          <AudioPlayer
            audioUrl={resultUrl}
            fileName={selectedFile.name}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  );
}
