/**
 * Chorus CLI - Main program setup
 */

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { runCommand } from "./commands/run.js";
import { devCommand } from "./commands/dev.js";
import { traceCommand } from "./commands/trace.js";

const VERSION = "0.1.0";

export const cli = new Command()
  .name("chorus")
  .description("CLI and DevTools for the Chorus multi-agent framework")
  .version(VERSION, "-v, --version", "Display version number")
  .option("--verbose", "Enable verbose output")
  .addCommand(initCommand)
  .addCommand(runCommand)
  .addCommand(devCommand)
  .addCommand(traceCommand);

// Handle uncaught errors gracefully
process.on("uncaughtException", (error) => {
  console.error("\nUnexpected error:", error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("\nUnhandled rejection:", reason);
  process.exit(1);
});
