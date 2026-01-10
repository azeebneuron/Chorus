/**
 * LLM Provider abstraction
 * This is the key to being LLM-agnostic
 */

import type { Message } from "./message.js";
import type { Tool } from "./tool.js";

/**
 * Configuration for a generation request
 */
export type GenerateConfig = {
  /** Messages to send to the LLM */
  messages: Message[];
  /** Available tools for the LLM to use */
  tools?: Tool[];
  /** Model identifier (provider-specific) */
  model?: string;
  /** Temperature for randomness (0-1) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stop?: string[];
};

/**
 * Response from an LLM generation
 */
export type GenerateResponse = {
  /** The generated message */
  message: Message;
  /** Token usage information */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Whether generation was stopped due to tool calls */
  finishReason: "stop" | "tool_calls" | "length" | "error";
};

/**
 * Streaming chunk from an LLM
 */
export type StreamChunk = {
  /** Delta content */
  content?: string;
  /** Delta tool calls */
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string; // Partial JSON string
  }>;
  /** Whether this is the final chunk */
  done: boolean;
};

/**
 * LLM Provider interface
 * Implement this to add support for a new LLM
 */
export type Provider = {
  /** Provider name (e.g., "openai", "anthropic") */
  name: string;

  /** Generate a response */
  generate: (config: GenerateConfig) => Promise<GenerateResponse>;

  /** Generate a streaming response */
  stream?: (config: GenerateConfig) => AsyncIterable<StreamChunk>;
};

/**
 * Provider factory function type
 */
export type ProviderFactory<TConfig = unknown> = (config: TConfig) => Provider;
