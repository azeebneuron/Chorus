/**
 * chorus dev - Watch mode with live tracing
 */

import { Command } from "commander";
import { loadModule, getRunnable } from "../runner/loader.js";
import { createWatcher } from "../runner/watcher.js";
import { createTraceCollector } from "../tracer/collector.js";
import { logger } from "../utils/logger.js";
import chalk from "chalk";
import readline from "readline";

type DevOptions = {
  input?: string;
  noUi?: boolean;
};

export const devCommand = new Command("dev")
  .description("Watch mode with live execution tracing")
  .argument("<file>", "TypeScript file with exported agent/ensemble")
  .option("-i, --input <text>", "Input for each run")
  .option("--no-ui", "Disable DevTools UI (use simple output)")
  .action(async (file: string, options: DevOptions) => {
    let input = options.input;
    let isRunning = false;
    let shouldRerun = false;

    // Clear screen helper
    const clearScreen = () => {
      process.stdout.write("\x1B[2J\x1B[0f");
    };

    // Print header
    const printHeader = () => {
      console.log(chalk.bold.cyan("\n  Chorus Dev Mode"));
      console.log(chalk.dim(`  Watching: ${file}`));
      console.log(chalk.dim("  Press 'r' to re-run, 'q' to quit\n"));
    };

    // Run the agent/ensemble
    const run = async () => {
      if (isRunning) {
        shouldRerun = true;
        return;
      }

      isRunning = true;
      clearScreen();
      printHeader();

      try {
        // Load module fresh each time
        logger.step(`Loading ${chalk.cyan(file)}...`);
        const module = await loadModule(file);
        const runnable = getRunnable(module);

        if (!runnable) {
          logger.error("No agent or ensemble found");
          isRunning = false;
          return;
        }

        const isEnsemble = "listAgents" in runnable;
        logger.success(
          `Loaded ${chalk.cyan(runnable.config.name)} (${isEnsemble ? "ensemble" : "agent"})`
        );

        // Get input if not provided
        if (!input) {
          const prompts = (await import("prompts")).default;
          const response = await prompts({
            type: "text",
            name: "input",
            message: "Enter input (saved for re-runs):",
          });
          input = response.input;

          if (!input) {
            logger.error("No input provided");
            isRunning = false;
            return;
          }
        }

        // Create trace collector
        const collector = createTraceCollector();

        // Subscribe to live events
        collector.on((event) => {
          switch (event.type) {
            case "step:start":
              console.log(
                chalk.cyan(`\n▶ ${event.step.agentId}`) +
                  chalk.dim(` starting...`)
              );
              console.log(chalk.dim(`  Input: ${truncate(event.step.input, 60)}`));
              break;

            case "step:complete":
              console.log(
                chalk.green(`✓ ${event.step.agentId}`) +
                  chalk.dim(` (${event.step.duration}ms)`)
              );
              if (event.step.output) {
                console.log(
                  chalk.dim(`  Output: ${truncate(event.step.output.response, 60)}`)
                );
                if (event.step.output.usage) {
                  console.log(
                    chalk.dim(
                      `  Tokens: ${event.step.output.usage.totalTokens}`
                    )
                  );
                }
              }
              break;

            case "step:error":
              console.log(
                chalk.red(`✗ ${event.step.agentId}`) +
                  chalk.dim(` failed`)
              );
              console.log(chalk.red(`  Error: ${event.error.message}`));
              break;

            case "tool:call":
              console.log(chalk.yellow(`  ⚡ Tool: ${event.tool}`));
              break;

            case "complete":
              const duration = event.trace.endTime
                ? event.trace.endTime - event.trace.startTime
                : 0;
              console.log(
                chalk.bold.green(`\n✓ Complete`) +
                  chalk.dim(` (${duration}ms total)`)
              );
              break;
          }
        });

        // Run
        console.log(chalk.bold("\n─── Execution ───\n"));

        const startTime = Date.now();

        // For single agent, manually trigger hooks
        if (!isEnsemble) {
          const agentId = runnable.config.name;
          await collector.getConductorHooks().onStart?.(input, []);
          await collector.getConductorHooks().onBeforeAgent?.(agentId, input);

          try {
            const result = await runnable.run(input);
            await collector.getConductorHooks().onAfterAgent?.(agentId, result);
            await collector.getConductorHooks().onComplete?.({
              response: result.response,
              agentResults: new Map([[agentId, result]]),
              trace: collector.getTrace(),
              usage: result.usage ?? {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              },
            });

            // Print final response
            console.log(chalk.bold("\n─── Response ───\n"));
            console.log(result.response);
          } catch (error) {
            await collector
              .getConductorHooks()
              .onAgentError?.(agentId, error as Error);
            throw error;
          }
        } else {
          // For ensemble, run normally
          const result = await runnable.run(input);
          console.log(chalk.bold("\n─── Response ───\n"));
          console.log(result.response);
        }

        // Print usage summary
        const usage = collector.getTotalUsage();
        if (usage.totalTokens > 0) {
          console.log(
            chalk.dim(
              `\nTokens: ${usage.promptTokens} prompt | ${usage.completionTokens} completion | ${usage.totalTokens} total`
            )
          );
        }
      } catch (error) {
        logger.error((error as Error).message);
        if (process.env.DEBUG) {
          console.error((error as Error).stack);
        }
      }

      isRunning = false;

      // Check if we need to re-run
      if (shouldRerun) {
        shouldRerun = false;
        setTimeout(run, 100);
      }

      console.log(chalk.dim("\n─── Waiting for changes... ───"));
    };

    // Truncate helper
    function truncate(text: string, max: number): string {
      const clean = text.replace(/\n/g, " ");
      if (clean.length <= max) return clean;
      return clean.slice(0, max - 3) + "...";
    }

    // Set up file watcher
    const watcher = createWatcher(file, {
      debounce: 200,
      onChange: () => {
        logger.info("File changed, re-running...");
        run();
      },
    });

    // Set up keyboard input
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on("keypress", (_str, key) => {
      if (key.name === "q" || (key.ctrl && key.name === "c")) {
        console.log(chalk.dim("\nExiting..."));
        watcher.stop();
        process.exit(0);
      }

      if (key.name === "r") {
        logger.info("Manual re-run...");
        run();
      }

      if (key.name === "c" && !key.ctrl) {
        input = undefined; // Clear saved input
        logger.info("Input cleared, will prompt on next run");
      }
    });

    // Start watching and run initial
    watcher.start();
    await run();
  });
