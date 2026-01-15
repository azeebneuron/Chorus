/**
 * File watcher for dev mode
 */

import { watch, type FSWatcher } from "chokidar";
import { resolve, dirname } from "path";

export type WatcherOptions = {
  /** Debounce delay in ms */
  debounce?: number;
  /** Callback when file changes */
  onChange: (path: string) => void;
};

export type FileWatcher = {
  /** Start watching */
  start: () => void;
  /** Stop watching */
  stop: () => void;
  /** Add a file to watch */
  add: (path: string) => void;
};

/**
 * Create a file watcher for dev mode
 */
export function createWatcher(
  filePath: string,
  options: WatcherOptions
): FileWatcher {
  const { debounce = 100, onChange } = options;
  const absolutePath = resolve(process.cwd(), filePath);
  const watchDir = dirname(absolutePath);

  let watcher: FSWatcher | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const watchedPaths = new Set<string>([absolutePath]);

  function handleChange(path: string) {
    // Only trigger for watched paths
    if (!watchedPaths.has(resolve(path))) return;

    // Debounce rapid changes
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      onChange(path);
    }, debounce);
  }

  return {
    start() {
      watcher = watch(watchDir, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 50,
          pollInterval: 10,
        },
      });

      watcher.on("change", handleChange);
      watcher.on("add", handleChange);
    },

    stop() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      watcher?.close();
      watcher = null;
    },

    add(path: string) {
      watchedPaths.add(resolve(path));
    },
  };
}
