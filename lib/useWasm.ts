import { useEffect, useRef } from 'react';

type WasmModule = any;

/**
 * Hook for loading and managing the Wub Machine WASM module
 */
export function useWasm() {
  const wasmRef = useRef<{ current: WasmModule | null }>({ current: null });
  const initRef = useRef<Promise<WasmModule> | null>(null);

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = (async () => {
        try {
          // Dynamically import WASM module
          const wasm = await import('/wasm/wub_machine_wasm.js');
          await wasm.default?.();

          // Create WubMachine instance (44100 Hz sample rate)
          const instance = new wasm.WubMachine(44100);
          wasmRef.current.current = instance;

          console.log('[v0] WASM module loaded successfully');
          return instance;
        } catch (error) {
          console.error('[v0] Failed to load WASM module:', error);
          throw error;
        }
      })();
    }

    return () => {
      // Cleanup if needed
    };
  }, []);

  return wasmRef;
}
