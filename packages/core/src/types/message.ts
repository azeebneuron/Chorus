/**
 * Message types for agent communication
 */

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type BaseMessage = {
  id?: string;
  timestamp?: number;
};

export type SystemMessage = BaseMessage & {
  role: "system";
  content: string;
};

export type UserMessage = BaseMessage & {
  role: "user";
  content: string;
};

export type AssistantMessage = BaseMessage & {
  role: "assistant";
  content: string | null;
  toolCalls?: ToolCall[];
};

export type ToolMessage = BaseMessage & {
  role: "tool";
  toolCallId: string;
  content: string;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

export type MessageInput =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | Message;

/**
 * Create a system message
 */
export function system(content: string): SystemMessage {
  return { role: "system", content };
}

/**
 * Create a user message
 */
export function user(content: string): UserMessage {
  return { role: "user", content };
}

/**
 * Create an assistant message
 */
export function assistant(content: string): AssistantMessage {
  return { role: "assistant", content };
}
