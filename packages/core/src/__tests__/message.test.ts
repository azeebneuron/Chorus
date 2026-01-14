import { describe, it, expect } from "vitest";
import { system, user, assistant } from "../types/message.js";

describe("Message helpers", () => {
  describe("system()", () => {
    it("creates a system message", () => {
      const msg = system("You are a helpful assistant");
      expect(msg).toEqual({
        role: "system",
        content: "You are a helpful assistant",
      });
    });

    it("handles empty content", () => {
      const msg = system("");
      expect(msg.role).toBe("system");
      expect(msg.content).toBe("");
    });

    it("preserves special characters", () => {
      const msg = system("Use {{variables}} and `code`");
      expect(msg.content).toBe("Use {{variables}} and `code`");
    });
  });

  describe("user()", () => {
    it("creates a user message", () => {
      const msg = user("Hello, world!");
      expect(msg).toEqual({
        role: "user",
        content: "Hello, world!",
      });
    });

    it("handles multiline content", () => {
      const content = `Line 1
Line 2
Line 3`;
      const msg = user(content);
      expect(msg.content).toBe(content);
    });
  });

  describe("assistant()", () => {
    it("creates an assistant message", () => {
      const msg = assistant("I can help with that!");
      expect(msg).toEqual({
        role: "assistant",
        content: "I can help with that!",
      });
    });
  });
});
