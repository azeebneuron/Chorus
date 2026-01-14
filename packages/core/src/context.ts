/**
 * SharedContext implementation for inter-agent communication
 */

import type {
  SharedContext,
  ContextConfig,
  ContextSnapshot,
  AgentId,
  Message,
} from "./types/index.js";

/**
 * Create a shared context for multi-agent orchestration
 */
export function createContext(config?: ContextConfig): SharedContext {
  const data = new Map<string, unknown>(
    Object.entries(config?.initialData ?? {})
  );
  const history: Message[] = [...(config?.initialHistory ?? [])];
  const agentMessages = new Map<AgentId, Message[]>();
  const maxHistory = config?.maxHistoryLength ?? 1000;

  const context: SharedContext = {
    get<T>(key: string): T | undefined {
      return data.get(key) as T | undefined;
    },

    set<T>(key: string, value: T): void {
      data.set(key, value);
    },

    has(key: string): boolean {
      return data.has(key);
    },

    delete(key: string): boolean {
      return data.delete(key);
    },

    keys(): string[] {
      return Array.from(data.keys());
    },

    clear(): void {
      data.clear();
      history.length = 0;
      agentMessages.clear();
    },

    getHistory(): Message[] {
      return [...history];
    },

    addMessage(message: Message, agentId?: AgentId): void {
      history.push(message);

      // Trim history if exceeds max
      if (history.length > maxHistory) {
        history.shift();
      }

      // Track per-agent messages
      if (agentId) {
        const messages = agentMessages.get(agentId) ?? [];
        messages.push(message);
        agentMessages.set(agentId, messages);
      }
    },

    getAgentMessages(agentId: AgentId): Message[] {
      return agentMessages.get(agentId) ?? [];
    },

    getAgentIds(): AgentId[] {
      return Array.from(agentMessages.keys());
    },

    snapshot(): ContextSnapshot {
      const agentMessagesObj: Record<AgentId, Message[]> = {};
      agentMessages.forEach((msgs, id) => {
        agentMessagesObj[id] = [...msgs];
      });

      return {
        data: Object.fromEntries(data),
        history: [...history],
        agentMessages: agentMessagesObj,
        timestamp: Date.now(),
      };
    },

    restore(snapshot: ContextSnapshot): void {
      // Restore data
      data.clear();
      Object.entries(snapshot.data).forEach(([k, v]) => data.set(k, v));

      // Restore history
      history.length = 0;
      history.push(...snapshot.history);

      // Restore agent messages
      agentMessages.clear();
      Object.entries(snapshot.agentMessages).forEach(([id, msgs]) => {
        agentMessages.set(id, [...msgs]);
      });
    },

    clone(): SharedContext {
      const cloned = createContext({
        initialData: Object.fromEntries(data),
        initialHistory: [...history],
        maxHistoryLength: maxHistory,
      });

      // Clone agent messages
      agentMessages.forEach((msgs, id) => {
        msgs.forEach((msg) => {
          // Access internal to set agent messages
          const clonedMsgs = cloned.getAgentMessages(id);
          if (clonedMsgs.length === 0) {
            // First message for this agent
            cloned.addMessage(msg, id);
          }
        });
      });

      return cloned;
    },
  };

  return context;
}
