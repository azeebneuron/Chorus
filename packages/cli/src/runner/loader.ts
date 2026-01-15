/**
 * Dynamic TypeScript file loader
 */

import { register } from "esbuild-register/dist/node.js";
import { resolve, extname } from "path";
import { existsSync } from "fs";
import type { Agent, Ensemble } from "@chorus/core";

export type LoadedModule = {
  agent?: Agent;
  ensemble?: Ensemble;
  default?: Agent | Ensemble;
};

/**
 * Register esbuild for TypeScript compilation
 */
let registered = false;

function ensureRegistered() {
  if (!registered) {
    register({
      target: "node20",
    });
    registered = true;
  }
}

/**
 * Check if an object looks like an Agent
 */
function isAgent(obj: unknown): obj is Agent {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "config" in obj &&
    "run" in obj &&
    typeof (obj as Agent).run === "function"
  );
}

/**
 * Check if an object looks like an Ensemble
 */
function isEnsemble(obj: unknown): obj is Ensemble {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "config" in obj &&
    "run" in obj &&
    "listAgents" in obj &&
    typeof (obj as Ensemble).listAgents === "function"
  );
}

/**
 * Load a TypeScript file and extract agent/ensemble exports
 */
export async function loadModule(filePath: string): Promise<LoadedModule> {
  const absolutePath = resolve(process.cwd(), filePath);

  // Check file exists
  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  // Check extension
  const ext = extname(absolutePath);
  if (![".ts", ".tsx", ".js", ".mjs"].includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  // Register esbuild for TypeScript
  ensureRegistered();

  // Dynamic import with cache busting for dev mode
  const cacheBuster = `?t=${Date.now()}`;
  const module = await import(`${absolutePath}${cacheBuster}`);

  const result: LoadedModule = {};

  // Check for default export
  if (module.default) {
    if (isAgent(module.default)) {
      result.default = module.default;
      result.agent = module.default;
    } else if (isEnsemble(module.default)) {
      result.default = module.default;
      result.ensemble = module.default;
    }
  }

  // Check for named exports
  for (const [key, value] of Object.entries(module)) {
    if (key === "default") continue;

    if (isAgent(value) && !result.agent) {
      result.agent = value;
    } else if (isEnsemble(value) && !result.ensemble) {
      result.ensemble = value;
    }
  }

  return result;
}

/**
 * Get the runnable from a loaded module (prefers ensemble over agent)
 */
export function getRunnable(module: LoadedModule): Agent | Ensemble | null {
  return module.ensemble ?? module.agent ?? module.default ?? null;
}
