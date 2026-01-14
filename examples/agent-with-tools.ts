/**
 * Agent with Tools Example
 *
 * This example demonstrates how to give an agent tools
 * that it can use to perform actions and gather information.
 *
 * Run with: npx tsx examples/agent-with-tools.ts
 */

import { agent, defineTool } from "@chorus/core";
import { gemini } from "@chorus/gemini";

// Create a Gemini provider
const provider = gemini({
  apiKey: process.env.GEMINI_API_KEY!,
});

// Define a weather tool
const getWeather = defineTool({
  name: "get_weather",
  description: "Gets the current weather for a given location",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "The city and state, e.g. 'San Francisco, CA'",
      },
      unit: {
        type: "string",
        description: "Temperature unit: 'celsius' or 'fahrenheit'",
      },
    },
    required: ["location"],
  },
  execute: async ({ location, unit = "fahrenheit" }) => {
    // Simulated weather data - in real app, call a weather API
    const conditions = ["sunny", "cloudy", "rainy", "partly cloudy"];
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    const tempF = Math.floor(Math.random() * 40) + 50; // 50-90°F
    const tempC = Math.round((tempF - 32) * (5 / 9));

    return {
      location,
      temperature: unit === "celsius" ? tempC : tempF,
      unit: unit === "celsius" ? "°C" : "°F",
      condition,
      humidity: Math.floor(Math.random() * 50) + 30 + "%",
    };
  },
});

// Define a calculator tool
const calculate = defineTool({
  name: "calculate",
  description: "Performs basic mathematical calculations",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "A mathematical expression like '2 + 2' or '10 * 5'",
      },
    },
    required: ["expression"],
  },
  execute: ({ expression }) => {
    try {
      // Simple eval for demo - use a proper math parser in production
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, "");
      const result = Function(`"use strict"; return (${sanitized})`)();
      return { expression, result };
    } catch {
      return { expression, error: "Could not evaluate expression" };
    }
  },
});

// Create an agent with tools
const weatherAgent = agent()
  .name("weather-assistant")
  .description("An assistant that can check weather and do calculations")
  .systemPrompt(`You are a helpful assistant with access to weather data and a calculator.
When users ask about weather, use the get_weather tool.
When users need math help, use the calculate tool.
Always explain the results in a friendly way.`)
  .provider(provider)
  .tools([getWeather, calculate])
  .maxIterations(5)
  .build();

// Run the agent
async function main() {
  console.log("🎵 Chorus - Agent with Tools Example\n");

  // Ask about weather
  console.log("User: What's the weather like in Tokyo and New York?\n");
  const weatherResult = await weatherAgent.run(
    "What's the weather like in Tokyo and New York? Also, what's the temperature difference between them in celsius?"
  );
  console.log("Assistant:", weatherResult.response);
  console.log(`\n📊 Used ${weatherResult.iterations} iterations\n`);

  console.log("---\n");

  // Ask for a calculation
  console.log("User: What's 15% of 250?\n");
  const calcResult = await weatherAgent.run("What's 15% of 250?");
  console.log("Assistant:", calcResult.response);
}

main().catch(console.error);
