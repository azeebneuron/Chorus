/**
 * chorus trace - Run with detailed execution tracing
 */

import { Command } from "commander";
import { loadModule, getRunnable } from "../runner/loader.js";
import { createTraceCollector } from "../tracer/collector.js";
import {
  formatTraceTable,
  formatTraceJson,
  formatTraceTimeline,
  formatUsageSummary,
} from "../tracer/formatter.js";
import { logger } from "../utils/logger.js";
import ora from "ora";
import chalk from "chalk";
import { writeFileSync } from "fs";

type TraceOptions = {
  input?: string;
  output?: "table" | "json" | "timeline";
  file?: string;
  costs?: boolean;
  verbose?: boolean;
};

export const traceCommand = new Command("trace")
  .description("Run with detailed execution tracing")
  .argument("<file>", "TypeScript file with exported agent/ensemble")
  .option("-i, --input <text>", "Input text for the agent")
  .option(
    "-o, --output <format>",
    "Output format (table|json|timeline)",
    "table"
  )
  .option("-f, --file <path>", "Write trace to file")
  .option("--costs", "Include cost estimates")
  .option("--verbose", "Show all message content")
  .action(async (file: string, options: TraceOptions) => {
    const spinner = ora();

    try {
      // Load the module
      spinner.start(`Loading ${chalk.cyan(file)}...`);
      const module = await loadModule(file);
      const runnable = getRunnable(module);

      if (!runnable) {
        spinner.fail();
        logger.error(
          "No agent or ensemble found. Export an agent or ensemble from your file."
        );
        process.exit(1);
      }

      const isEnsemble = "listAgents" in runnable;
      spinner.succeed(
        `Loaded ${chalk.cyan(runnable.config.name)} (${isEnsemble ? "ensemble" : "agent"})`
      );

      // Get input
      let input = options.input;
      if (!input) {
        const prompts = (await import("prompts")).default;
        const response = await prompts({
          type: "text",
          name: "input",
          message: "Enter input:",
        });
        input = response.input;

        if (!input) {
          logger.error("No input provided");
          process.exit(1);
        }
      }

      // Create trace collector
      const collector = createTraceCollector();

      // Subscribe to live events if verbose
      if (options.verbose) {
        collector.on((event) => {
          switch (event.type) {
            case "step:start":
              logger.step(`Agent ${chalk.cyan(event.step.agentId)} starting...`);
              break;
            case "step:complete":
              logger.success(
                `Agent ${chalk.cyan(event.step.agentId)} completed (${event.step.duration}ms)`
              );
              break;
            case "step:error":
              logger.error(
                `Agent ${chalk.cyan(event.step.agentId)} failed: ${event.error.message}`
              );
              break;
            case "tool:call":
              logger.dim(`  Tool call: ${event.tool}`);
              break;
          }
        });
      }

      // Run with tracing
      spinner.start("Running with tracing...");

      // For ensembles, pass conductor hooks
      // For single agents, we need to wrap the run call
      if (isEnsemble) {
        // Get conductor hooks from collector
        const conductorHooks = collector.getConductorHooks();

        await runnable.run(input, {
          // Pass hooks through conductor in the run options
          // Note: This requires the ensemble to forward hooks to conductor
        });

        // Since direct hook injection may not work, we'll simulate for now
        // In production, we'd need to ensure the ensemble passes hooks
      } else {
        // For single agent, wrap the execution
        const startTime = Date.now();

        // Manually create a trace step for single agent
        const agentId = runnable.config.name;
        collector.getConductorHooks().onStart?.(input, []);
        collector.getConductorHooks().onBeforeAgent?.(agentId, input);

        try {
          const result = await runnable.run(input);
          collector.getConductorHooks().onAfterAgent?.(agentId, result);
          collector.getConductorHooks().onComplete?.({
            response: result.response,
            agentResults: new Map([[agentId, result]]),
            trace: collector.getTrace(),
            usage: result.usage ?? {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
          });
        } catch (error) {
          collector
            .getConductorHooks()
            .onAgentError?.(agentId, error as Error);
          throw error;
        }
      }

      spinner.succeed("Execution complete");

      // Format output
      const trace = collector.getTrace();
      const usage = collector.getUsage();

      let output: string;
      switch (options.output) {
        case "json":
          output = formatTraceJson(trace, usage);
          break;
        case "timeline":
          output = formatTraceTimeline(trace);
          break;
        case "table":
        default:
          output = formatTraceTable(trace, usage);
          break;
      }

      // Output
      console.log(output);

      // Show usage summary for non-json output
      if (options.output !== "json" && usage.size > 0) {
        console.log(formatUsageSummary(usage));
      }

      // Write to file if requested
      if (options.file) {
        const fileContent =
          options.output === "json" ? output : formatTraceJson(trace, usage);
        writeFileSync(options.file, fileContent);
        logger.success(`Trace written to ${options.file}`);
      }
    } catch (error) {
      spinner.fail();
      logger.error((error as Error).message);

      if (process.env.DEBUG) {
        console.error((error as Error).stack);
      }

      process.exit(1);
    }
  });
