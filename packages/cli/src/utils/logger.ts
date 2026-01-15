/**
 * Logger utilities for CLI output
 */

import chalk from "chalk";
import figures from "figures";

export const logger = {
  info: (message: string) => {
    console.log(chalk.blue(figures.info), message);
  },

  success: (message: string) => {
    console.log(chalk.green(figures.tick), message);
  },

  warning: (message: string) => {
    console.log(chalk.yellow(figures.warning), message);
  },

  error: (message: string) => {
    console.error(chalk.red(figures.cross), message);
  },

  step: (message: string) => {
    console.log(chalk.cyan(figures.pointer), message);
  },

  dim: (message: string) => {
    console.log(chalk.dim(message));
  },

  blank: () => {
    console.log();
  },

  heading: (message: string) => {
    console.log();
    console.log(chalk.bold(message));
    console.log(chalk.dim("─".repeat(message.length)));
  },
};
