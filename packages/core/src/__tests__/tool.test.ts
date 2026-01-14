import { describe, it, expect } from "vitest";
import { defineTool } from "../types/tool.js";

describe("defineTool", () => {
  it("creates a tool with basic configuration", () => {
    const tool = defineTool({
      name: "greet",
      description: "Greets a person by name",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "The name to greet" },
        },
        required: ["name"],
      },
      execute: ({ name }: { name: string }) => `Hello, ${name}!`,
    });

    expect(tool.name).toBe("greet");
    expect(tool.description).toBe("Greets a person by name");
    expect(tool.parameters.type).toBe("object");
    expect(tool.parameters.properties).toHaveProperty("name");
  });

  it("executes synchronous tool correctly", () => {
    const tool = defineTool({
      name: "add",
      description: "Adds two numbers",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      },
      execute: ({ a, b }: { a: number; b: number }) => a + b,
    });

    const result = tool.execute({ a: 2, b: 3 });
    expect(result).toBe(5);
  });

  it("executes async tool correctly", async () => {
    const tool = defineTool({
      name: "fetch_data",
      description: "Fetches data asynchronously",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
        },
        required: ["id"],
      },
      execute: async ({ id }: { id: string }) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { id, data: "fetched" };
      },
    });

    const result = await tool.execute({ id: "123" });
    expect(result).toEqual({ id: "123", data: "fetched" });
  });

  it("handles tool with no required parameters", () => {
    const tool = defineTool({
      name: "get_time",
      description: "Gets the current time",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: () => new Date().toISOString(),
    });

    expect(tool.parameters.required).toBeUndefined();
    expect(typeof tool.execute({})).toBe("string");
  });

  it("handles complex nested parameters", () => {
    const tool = defineTool({
      name: "create_user",
      description: "Creates a user with nested data",
      parameters: {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "number" },
              address: {
                type: "object",
                properties: {
                  city: { type: "string" },
                  zip: { type: "string" },
                },
              },
            },
          },
        },
        required: ["user"],
      },
      execute: (params: { user: { name: string; age: number } }) =>
        `Created ${params.user.name}`,
    });

    expect(tool.name).toBe("create_user");
    const result = tool.execute({ user: { name: "Alice", age: 30 } });
    expect(result).toBe("Created Alice");
  });
});
