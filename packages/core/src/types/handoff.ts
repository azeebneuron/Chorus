/**
 * Handoff protocol types for agent-to-agent transfers
 */

import type { AgentId } from "./ensemble.js";
import type { Message } from "./message.js";

/**
 * Handoff request from one agent to another
 */
export type HandoffRequest = {
  /** Agent initiating the handoff */
  fromAgent: AgentId;
  /** Target agent */
  toAgent: AgentId;
  /** Reason for handoff */
  reason: string;
  /** Task/input to pass */
  task: string;
  /** Context to transfer */
  context?: Record<string, unknown>;
  /** Conversation history to include */
  history?: Message[];
  /** Priority level */
  priority?: "low" | "normal" | "high" | "urgent";
};

/**
 * Handoff response
 */
export type HandoffResponse = {
  /** Whether handoff was accepted */
  accepted: boolean;
  /** Reason if rejected */
  rejectionReason?: string;
  /** Result if task was completed */
  result?: string;
  /** Any data returned by the target agent */
  data?: Record<string, unknown>;
};

/**
 * Handoff handler function
 */
export type HandoffHandler = (request: HandoffRequest) => Promise<HandoffResponse>;

/**
 * Handoff tool configuration
 */
export type HandoffToolConfig = {
  /** Available target agents */
  targets: AgentId[];
  /** Handler for handoffs */
  handler: HandoffHandler;
  /** Whether to include conversation history */
  includeHistory?: boolean;
  /** Maximum history messages to include */
  maxHistoryLength?: number;
};

/**
 * Handoff registry for managing available handoff targets
 */
export type HandoffRegistry = {
  /** Register a handoff target */
  register: (agentId: AgentId, handler: HandoffHandler) => void;
  /** Unregister a handoff target */
  unregister: (agentId: AgentId) => void;
  /** Get handler for a target */
  getHandler: (agentId: AgentId) => HandoffHandler | undefined;
  /** List all available targets */
  listTargets: () => AgentId[];
  /** Check if target is available */
  hasTarget: (agentId: AgentId) => boolean;
};
