/**
 * Trace formatter - Pretty output for execution traces
 */

import chalk from "chalk";
import Table from "cli-table3";
import type { ExecutionTrace, ExecutionStep } from "@chorus/core";
import type { TokenUsage } from "./collector.js";

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Truncate text to max length
 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

/**
 * Format trace as a table
 */
export function formatTraceTable(
  trace: ExecutionTrace,
  usage: Map<string, TokenUsage>
): string {
  const table = new Table({
    head: [
      chalk.bold("Step"),
      chalk.bold("Agent"),
      chalk.bold("Input"),
      chalk.bold("Duration"),
      chalk.bold("Tokens"),
      chalk.bold("Status"),
    ],
    colWidths: [6, 15, 35, 10, 12, 10],
    wordWrap: true,
  });

  for (const step of trace.steps) {
    const agentUsage = usage.get(step.agentId);
    const tokens = agentUsage ? `${agentUsage.totalTokens}` : "-";
    const status = step.error
      ? chalk.red("Error")
      : step.output
        ? chalk.green("Done")
        : chalk.yellow("...");

    table.push([
      String(step.index + 1),
      chalk.cyan(step.agentId),
      truncate(step.input.replace(/\n/g, " "), 32),
      step.duration ? formatDuration(step.duration) : "-",
      tokens,
      status,
    ]);
  }

  return table.toString();
}

/**
 * Format trace as JSON
 */
export function formatTraceJson(
  trace: ExecutionTrace,
  usage: Map<string, TokenUsage>
): string {
  const data = {
    id: trace.id,
    startTime: trace.startTime,
    endTime: trace.endTime,
    duration: trace.endTime ? trace.endTime - trace.startTime : null,
    steps: trace.steps.map((step) => ({
      index: step.index,
      agentId: step.agentId,
      input: step.input,
      output: step.output?.response,
      error: step.error?.message,
      duration: step.duration,
      timestamp: step.timestamp,
    })),
    usage: Object.fromEntries(usage),
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Format trace as ASCII timeline
 */
export function formatTraceTimeline(trace: ExecutionTrace): string {
  const lines: string[] = [];
  const totalDuration = trace.endTime
    ? trace.endTime - trace.startTime
    : Date.now() - trace.startTime;

  lines.push(chalk.bold("\nExecution Timeline"));
  lines.push(chalk.dim("─".repeat(60)));

  // Create timeline bar
  const barWidth = 50;

  for (const step of trace.steps) {
    const startOffset = step.timestamp - trace.startTime;
    const duration = step.duration ?? 0;

    const startPos = Math.floor((startOffset / totalDuration) * barWidth);
    const width = Math.max(
      1,
      Math.floor((duration / totalDuration) * barWidth)
    );

    const bar =
      " ".repeat(startPos) +
      (step.error ? chalk.red("█".repeat(width)) : chalk.green("█".repeat(width)));

    const label = `${step.agentId} (${formatDuration(duration)})`;

    lines.push(`${chalk.cyan(step.agentId.padEnd(12))} │${bar}`);
  }

  lines.push(chalk.dim("─".repeat(60)));
  lines.push(
    `${chalk.dim("0")}${" ".repeat(barWidth - 6)}${chalk.dim(formatDuration(totalDuration))}`
  );

  return lines.join("\n");
}

/**
 * Format step detail
 */
export function formatStepDetail(step: ExecutionStep): string {
  const lines: string[] = [];

  lines.push(chalk.bold(`\nStep ${step.index + 1}: ${step.agentId}`));
  lines.push(chalk.dim("─".repeat(40)));

  lines.push(chalk.bold("Input:"));
  lines.push(chalk.white(step.input));

  if (step.output) {
    lines.push(chalk.bold("\nOutput:"));
    lines.push(chalk.white(step.output.response));

    if (step.output.usage) {
      lines.push(chalk.dim(`\nTokens: ${step.output.usage.totalTokens}`));
    }
  }

  if (step.error) {
    lines.push(chalk.bold("\nError:"));
    lines.push(chalk.red(step.error.message));
  }

  if (step.duration) {
    lines.push(chalk.dim(`\nDuration: ${formatDuration(step.duration)}`));
  }

  return lines.join("\n");
}

/**
 * Format usage summary
 */
export function formatUsageSummary(usage: Map<string, TokenUsage>): string {
  const lines: string[] = [];

  lines.push(chalk.bold("\nToken Usage"));
  lines.push(chalk.dim("─".repeat(40)));

  let totalPrompt = 0;
  let totalCompletion = 0;
  let totalTokens = 0;

  for (const [agentId, u] of usage) {
    lines.push(
      `${chalk.cyan(agentId.padEnd(15))} ${u.promptTokens.toString().padStart(6)} prompt │ ${u.completionTokens.toString().padStart(6)} completion │ ${chalk.bold(u.totalTokens.toString().padStart(6))} total`
    );
    totalPrompt += u.promptTokens;
    totalCompletion += u.completionTokens;
    totalTokens += u.totalTokens;
  }

  lines.push(chalk.dim("─".repeat(40)));
  lines.push(
    `${chalk.bold("Total".padEnd(15))} ${totalPrompt.toString().padStart(6)} prompt │ ${totalCompletion.toString().padStart(6)} completion │ ${chalk.bold(totalTokens.toString().padStart(6))} total`
  );

  return lines.join("\n");
}
