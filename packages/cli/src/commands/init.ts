/**
 * chorus init - Scaffold a new Chorus project
 */

import { Command } from "commander";
import { logger } from "../utils/logger.js";
import ora from "ora";
import chalk from "chalk";
import prompts from "prompts";
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

type InitOptions = {
  template?: string;
  provider?: string;
  noGit?: boolean;
  noInstall?: boolean;
};

const TEMPLATES = {
  "basic-agent": {
    name: "Basic Agent",
    description: "A simple agent with a system prompt",
    code: `import { agent } from "@chorus/core";
import { gemini } from "@chorus/gemini";

const provider = gemini({
  apiKey: process.env.GEMINI_API_KEY!,
});

export const assistant = agent()
  .name("assistant")
  .systemPrompt("You are a helpful assistant.")
  .provider(provider)
  .build();

// Run with: chorus run src/agent.ts
`,
  },
  "multi-agent": {
    name: "Multi-Agent Team",
    description: "An ensemble of agents working together",
    code: `import { agent, ensemble, conductor } from "@chorus/core";
import { gemini } from "@chorus/gemini";

const provider = gemini({
  apiKey: process.env.GEMINI_API_KEY!,
});

// Create specialized agents
const researcher = agent()
  .name("researcher")
  .systemPrompt("You research topics thoroughly and provide detailed findings.")
  .provider(provider)
  .build();

const writer = agent()
  .name("writer")
  .systemPrompt("You write clear, engaging content based on research.")
  .provider(provider)
  .build();

// Create an ensemble
export const team = ensemble()
  .name("content-team")
  .add(researcher, { role: "Research" })
  .add(writer, { role: "Write" })
  .conductor(
    conductor()
      .strategy("sequential")
      .order(["researcher", "writer"])
      .build()
  )
  .build();

// Run with: chorus run src/agent.ts
`,
  },
  "with-tools": {
    name: "Agent with Tools",
    description: "An agent that can use custom tools",
    code: `import { agent, defineTool } from "@chorus/core";
import { gemini } from "@chorus/gemini";

const provider = gemini({
  apiKey: process.env.GEMINI_API_KEY!,
});

// Define a custom tool
const calculatorTool = defineTool({
  name: "calculator",
  description: "Perform mathematical calculations",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "Mathematical expression to evaluate (e.g., '2 + 2')",
      },
    },
    required: ["expression"],
  },
  execute: async ({ expression }) => {
    try {
      // Simple eval for demo - use a proper math library in production
      const result = Function(\`"use strict"; return (\${expression})\`)();
      return String(result);
    } catch {
      return "Error: Invalid expression";
    }
  },
});

export const assistant = agent()
  .name("calculator-assistant")
  .systemPrompt("You are a helpful assistant that can perform calculations.")
  .provider(provider)
  .tools([calculatorTool])
  .build();

// Run with: chorus run src/agent.ts
`,
  },
};

/**
 * Safely execute a command using execFile
 */
async function safeExec(
  command: string,
  args: string[],
  cwd: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await execFileAsync(command, args, { cwd });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const initCommand = new Command("init")
  .description("Create a new Chorus project")
  .argument("[directory]", "Directory to create project in", ".")
  .option("-t, --template <type>", "Template (basic-agent|multi-agent|with-tools)")
  .option("-p, --provider <name>", "Default provider (gemini)")
  .option("--no-git", "Skip git initialization")
  .option("--no-install", "Skip npm install")
  .action(async (directory: string, options: InitOptions) => {
    const spinner = ora();

    try {
      logger.blank();
      console.log(chalk.bold.cyan("  Chorus"));
      console.log(chalk.dim("  Create AI agents that work."));
      logger.blank();

      // Resolve directory
      const targetDir = resolve(process.cwd(), directory);
      const projectName =
        directory === "." ? "my-chorus-project" : directory;

      // Check if directory exists and is not empty
      if (existsSync(targetDir)) {
        const files = readdirSync(targetDir);
        const hasContent = files.filter((f) => !f.startsWith(".")).length > 0;

        if (hasContent && directory !== ".") {
          logger.error(`Directory ${targetDir} is not empty`);
          process.exit(1);
        }
      }

      // Interactive prompts if options not provided
      const answers = await prompts([
        {
          type: options.template ? null : "select",
          name: "template",
          message: "Choose a template:",
          choices: Object.entries(TEMPLATES).map(([value, { name, description }]) => ({
            title: name,
            description,
            value,
          })),
          initial: 0,
        },
      ]);

      const template = options.template ?? answers.template ?? "basic-agent";

      if (!TEMPLATES[template as keyof typeof TEMPLATES]) {
        logger.error(`Unknown template: ${template}`);
        process.exit(1);
      }

      const templateConfig = TEMPLATES[template as keyof typeof TEMPLATES];

      // Create directory structure
      spinner.start("Creating project structure...");

      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      const srcDir = join(targetDir, "src");
      mkdirSync(srcDir, { recursive: true });

      // Create package.json
      const packageJson = {
        name: projectName,
        version: "0.1.0",
        type: "module",
        scripts: {
          start: "chorus run src/agent.ts",
          dev: "chorus dev src/agent.ts",
          trace: "chorus trace src/agent.ts",
        },
        dependencies: {
          "@chorus/core": "^0.1.0",
          "@chorus/gemini": "^0.1.0",
        },
        devDependencies: {
          "@chorus/cli": "^0.1.0",
          typescript: "^5.0.0",
        },
      };

      writeFileSync(
        join(targetDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      );

      // Create tsconfig.json
      const tsconfig = {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          outDir: "./dist",
        },
        include: ["src/**/*"],
      };

      writeFileSync(
        join(targetDir, "tsconfig.json"),
        JSON.stringify(tsconfig, null, 2)
      );

      // Create agent file
      writeFileSync(join(srcDir, "agent.ts"), templateConfig.code);

      // Create .env.example
      writeFileSync(
        join(targetDir, ".env.example"),
        `# Chorus Environment Variables

# Google Gemini API Key
GEMINI_API_KEY=your_api_key_here

# OpenAI API Key (optional)
# OPENAI_API_KEY=your_api_key_here

# Anthropic API Key (optional)
# ANTHROPIC_API_KEY=your_api_key_here
`
      );

      // Create .gitignore
      writeFileSync(
        join(targetDir, ".gitignore"),
        `node_modules/
dist/
.env
*.log
`
      );

      spinner.succeed("Project structure created");

      // Initialize git
      if (!options.noGit) {
        spinner.start("Initializing git...");
        const gitResult = await safeExec("git", ["init"], targetDir);
        if (gitResult.success) {
          spinner.succeed("Git initialized");
        } else {
          spinner.warn("Git initialization failed (git not found?)");
        }
      }

      // Install dependencies
      if (!options.noInstall) {
        spinner.start("Installing dependencies...");

        // Try pnpm first, then npm
        let installResult = await safeExec("pnpm", ["install"], targetDir);
        if (!installResult.success) {
          installResult = await safeExec("npm", ["install"], targetDir);
        }

        if (installResult.success) {
          spinner.succeed("Dependencies installed");
        } else {
          spinner.warn("Dependency installation failed");
        }
      }

      // Success message
      logger.blank();
      logger.success("Project created successfully!");
      logger.blank();

      console.log(chalk.bold("Next steps:"));
      logger.blank();

      if (directory !== ".") {
        console.log(chalk.cyan(`  cd ${directory}`));
      }

      console.log(chalk.cyan("  # Add your API key to .env"));
      console.log(chalk.cyan("  cp .env.example .env"));
      logger.blank();
      console.log(chalk.cyan("  # Run your agent"));
      console.log(chalk.cyan("  pnpm start"));
      logger.blank();
      console.log(chalk.cyan("  # Or use dev mode with DevTools"));
      console.log(chalk.cyan("  pnpm dev"));
      logger.blank();
    } catch (error) {
      spinner.fail();
      logger.error((error as Error).message);
      process.exit(1);
    }
  });
