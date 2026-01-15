/**
 * chorus run - Execute an agent or ensemble
 */

import { Command } from "commander";
import { loadModule, getRunnable } from "../runner/loader.js";
import { logger } from "../utils/logger.js";
import ora from "ora";
import chalk from "chalk";

type RunOptions = {
  input?: string;
  env?: string;
  quiet?: boolean;
  json?: boolean;
  timeout?: string;
};

export const runCommand = new Command("run")
  .description("Execute an agent or ensemble file")
  .argument("<file>", "TypeScript file with exported agent/ensemble")
  .option("-i, --input <text>", "Input text for the agent")
  .option("-e, --env <path>", "Path to .env file")
  .option("-q, --quiet", "Minimal output")
  .option("--json", "Output result as JSON")
  .option("--timeout <ms>", "Execution timeout in milliseconds")
  .action(async (file: string, options: RunOptions) => {
    const spinner = ora();

    try {
      // Load environment if specified
      if (options.env) {
        const dotenv = await import("dotenv");
        dotenv.config({ path: options.env });
      }

      // Load the module
      if (!options.quiet) {
        spinner.start(`Loading ${chalk.cyan(file)}...`);
      }

      const module = await loadModule(file);
      const runnable = getRunnable(module);

      if (!runnable) {
        spinner.fail();
        logger.error(
          "No agent or ensemble found. Export an agent or ensemble from your file."
        );
        logger.dim("Example: export const myAgent = agent()...build();");
        process.exit(1);
      }

      if (!options.quiet) {
        const type =
          "listAgents" in runnable
            ? `ensemble (${runnable.listAgents().length} agents)`
            : "agent";
        spinner.succeed(`Loaded ${chalk.cyan(runnable.config.name)} (${type})`);
      }

      // Get input
      let input = options.input;

      if (!input) {
        // Prompt for input if not provided
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

      // Run with optional timeout
      if (!options.quiet) {
        spinner.start("Running...");
      }

      const timeoutMs = options.timeout ? parseInt(options.timeout, 10) : undefined;
      const controller = new AbortController();

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (timeoutMs) {
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      }

      try {
        const startTime = Date.now();
        const result = await runnable.run(input, { signal: controller.signal });
        const duration = Date.now() - startTime;

        if (timeoutId) clearTimeout(timeoutId);

        if (!options.quiet) {
          spinner.succeed(`Completed in ${chalk.cyan(`${duration}ms`)}`);
        }

        // Output result
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                response: result.response,
                usage: result.usage,
                duration,
              },
              null,
              2
            )
          );
        } else {
          logger.blank();
          logger.heading("Response");
          console.log(result.response);

          if (result.usage && !options.quiet) {
            logger.blank();
            logger.dim(
              `Tokens: ${result.usage.promptTokens} prompt | ${result.usage.completionTokens} completion | ${result.usage.totalTokens} total`
            );
          }
        }
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);

        if ((error as Error).message?.includes("aborted")) {
          spinner.fail("Execution timed out");
        } else {
          throw error;
        }
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
