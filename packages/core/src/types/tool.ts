/**
 * Tool definition and execution types
 */

import type { z } from "zod";

/**
 * JSON Schema representation for tool parameters
 */
export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

/**
 * Tool definition with typed parameters
 */
export type Tool<TParams = unknown, TResult = unknown> = {
  /** Unique name for the tool */
  name: string;
  /** Description of what the tool does (used by LLM) */
  description: string;
  /** JSON Schema for parameters */
  parameters: JsonSchema;
  /** Execute the tool with given parameters */
  execute: (params: TParams) => Promise<TResult> | TResult;
};

/**
 * Tool definition input (what users provide)
 */
export type ToolInput<TParams = unknown, TResult = unknown> = {
  name: string;
  description: string;
  parameters: JsonSchema;
  execute: (params: TParams) => Promise<TResult> | TResult;
};

/**
 * Zod-based tool definition for better type inference
 */
export type ZodToolInput<TSchema extends z.ZodType, TResult = unknown> = {
  name: string;
  description: string;
  parameters: TSchema;
  execute: (params: z.infer<TSchema>) => Promise<TResult> | TResult;
};

/**
 * Result of a tool execution
 */
export type ToolResult = {
  toolCallId: string;
  result: unknown;
  error?: string;
};

/**
 * Create a tool definition
 */
export function defineTool<TParams, TResult>(
  input: ToolInput<TParams, TResult>
): Tool<TParams, TResult> {
  return {
    name: input.name,
    description: input.description,
    parameters: input.parameters,
    execute: input.execute,
  };
}
