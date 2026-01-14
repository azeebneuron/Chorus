/**
 * Shared context types for inter-agent communication
 */

import type { Message } from "./message.js";
import type { AgentId } from "./ensemble.js";

/**
 * Shared context between agents
 */
export type SharedContext = {
  /** Get a value from context */
  get: <T>(key: string) => T | undefined;
  /** Set a value in context */
  set: <T>(key: string, value: T) => void;
  /** Check if key exists */
  has: (key: string) => boolean;
  /** Delete a key */
  delete: (key: string) => boolean;
  /** Get all keys */
  keys: () => string[];
  /** Clear all data */
  clear: () => void;
  /** Get shared conversation history */
  getHistory: () => Message[];
  /** Add message to shared history */
  addMessage: (message: Message, agentId?: AgentId) => void;
  /** Get messages from a specific agent */
  getAgentMessages: (agentId: AgentId) => Message[];
  /** Get all agent IDs that have messages */
  getAgentIds: () => AgentId[];
  /** Create a snapshot */
  snapshot: () => ContextSnapshot;
  /** Restore from snapshot */
  restore: (snapshot: ContextSnapshot) => void;
  /** Clone the context (creates a new independent copy) */
  clone: () => SharedContext;
};

/**
 * Snapshot of context state
 */
export type ContextSnapshot = {
  /** Stored data */
  data: Record<string, unknown>;
  /** Message history */
  history: Message[];
  /** Per-agent messages */
  agentMessages: Record<AgentId, Message[]>;
  /** Timestamp when snapshot was created */
  timestamp: number;
};

/**
 * Context configuration
 */
export type ContextConfig = {
  /** Initial data */
  initialData?: Record<string, unknown>;
  /** Maximum history length (default: 1000) */
  maxHistoryLength?: number;
  /** Initial messages */
  initialHistory?: Message[];
};
