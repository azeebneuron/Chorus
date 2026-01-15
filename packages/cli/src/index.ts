/**
 * @chorus/cli
 *
 * CLI and DevTools for the Chorus multi-agent framework
 */

// CLI exports
export { cli } from "./cli.js";

// Tracer exports
export { createTraceCollector } from "./tracer/collector.js";
export type {
  TraceCollector,
  TraceEvent,
  TraceEventHandler,
  TokenUsage,
} from "./tracer/collector.js";

// Formatter exports
export {
  formatTraceTable,
  formatTraceJson,
  formatTraceTimeline,
  formatStepDetail,
  formatUsageSummary,
} from "./tracer/formatter.js";

// Runner exports
export { loadModule, getRunnable } from "./runner/loader.js";
export type { LoadedModule } from "./runner/loader.js";

export { createWatcher } from "./runner/watcher.js";
export type { FileWatcher, WatcherOptions } from "./runner/watcher.js";
