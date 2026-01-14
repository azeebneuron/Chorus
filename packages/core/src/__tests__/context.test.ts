import { describe, it, expect } from "vitest";
import { createContext } from "../context.js";

describe("createContext", () => {
  it("should create an empty context", () => {
    const ctx = createContext();
    expect(ctx.keys()).toHaveLength(0);
    expect(ctx.getHistory()).toHaveLength(0);
  });

  it("should initialize with provided data", () => {
    const ctx = createContext({
      initialData: { foo: "bar", num: 42 },
    });
    expect(ctx.get("foo")).toBe("bar");
    expect(ctx.get("num")).toBe(42);
    expect(ctx.keys()).toContain("foo");
    expect(ctx.keys()).toContain("num");
  });

  it("should set and get values", () => {
    const ctx = createContext();
    ctx.set("key", "value");
    expect(ctx.get("key")).toBe("value");
    expect(ctx.has("key")).toBe(true);
  });

  it("should delete values", () => {
    const ctx = createContext();
    ctx.set("key", "value");
    expect(ctx.delete("key")).toBe(true);
    expect(ctx.has("key")).toBe(false);
    expect(ctx.delete("nonexistent")).toBe(false);
  });

  it("should clear all data", () => {
    const ctx = createContext({
      initialData: { a: 1, b: 2 },
    });
    ctx.addMessage({ role: "user", content: "hello" });
    ctx.clear();
    expect(ctx.keys()).toHaveLength(0);
    expect(ctx.getHistory()).toHaveLength(0);
  });

  it("should manage message history", () => {
    const ctx = createContext();
    ctx.addMessage({ role: "user", content: "hello" });
    ctx.addMessage({ role: "assistant", content: "hi" });

    const history = ctx.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]?.content).toBe("hello");
    expect(history[1]?.content).toBe("hi");
  });

  it("should track per-agent messages", () => {
    const ctx = createContext();
    ctx.addMessage({ role: "user", content: "task" }, "agent1");
    ctx.addMessage({ role: "assistant", content: "result" }, "agent1");
    ctx.addMessage({ role: "assistant", content: "other" }, "agent2");

    expect(ctx.getAgentMessages("agent1")).toHaveLength(2);
    expect(ctx.getAgentMessages("agent2")).toHaveLength(1);
    expect(ctx.getAgentMessages("unknown")).toHaveLength(0);
    expect(ctx.getAgentIds()).toContain("agent1");
    expect(ctx.getAgentIds()).toContain("agent2");
  });

  it("should trim history when exceeding max length", () => {
    const ctx = createContext({ maxHistoryLength: 2 });
    ctx.addMessage({ role: "user", content: "1" });
    ctx.addMessage({ role: "user", content: "2" });
    ctx.addMessage({ role: "user", content: "3" });

    const history = ctx.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]?.content).toBe("2");
    expect(history[1]?.content).toBe("3");
  });

  it("should create and restore snapshots", () => {
    const ctx = createContext();
    ctx.set("key", "value");
    ctx.addMessage({ role: "user", content: "hello" }, "agent1");

    const snapshot = ctx.snapshot();
    expect(snapshot.data).toEqual({ key: "value" });
    expect(snapshot.history).toHaveLength(1);
    expect(snapshot.timestamp).toBeGreaterThan(0);

    // Modify context
    ctx.set("key", "modified");
    ctx.addMessage({ role: "assistant", content: "response" });

    // Restore
    ctx.restore(snapshot);
    expect(ctx.get("key")).toBe("value");
    expect(ctx.getHistory()).toHaveLength(1);
  });

  it("should clone context independently", () => {
    const ctx = createContext();
    ctx.set("key", "value");
    ctx.addMessage({ role: "user", content: "hello" });

    const cloned = ctx.clone();

    // Modify original
    ctx.set("key", "modified");
    ctx.addMessage({ role: "user", content: "another" });

    // Clone should be unaffected
    expect(cloned.get("key")).toBe("value");
    expect(cloned.getHistory()).toHaveLength(1);
  });
});
