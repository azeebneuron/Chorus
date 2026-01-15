/**
 * JSON Schema validation utilities for tool arguments
 * Provides basic validation without external dependencies
 */

import type { JsonSchema } from "./types/tool.js";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Validate a value against a JSON Schema
 * This is a lightweight implementation for common cases
 */
export function validateJsonSchema(
  value: unknown,
  schema: JsonSchema
): ValidationResult {
  const errors: string[] = [];

  // Must be an object
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      valid: false,
      errors: ["Expected an object"],
    };
  }

  const obj = value as Record<string, unknown>;

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in obj)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Validate properties
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in obj) {
        const propErrors = validateProperty(obj[key], propSchema as PropertySchema, key);
        errors.push(...propErrors);
      }
    }
  }

  // Check for additional properties if not allowed
  if (schema.additionalProperties === false && schema.properties) {
    const allowedKeys = Object.keys(schema.properties);
    for (const key of Object.keys(obj)) {
      if (!allowedKeys.includes(key)) {
        errors.push(`Unexpected property: ${key}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

type PropertySchema = {
  type?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: PropertySchema;
};

function validateProperty(
  value: unknown,
  schema: PropertySchema,
  path: string
): string[] {
  const errors: string[] = [];

  // Type validation
  if (schema.type) {
    const actualType = getJsonType(value);
    if (schema.type !== actualType) {
      // Allow number for integer type
      if (!(schema.type === "integer" && actualType === "number" && Number.isInteger(value))) {
        errors.push(`${path}: expected ${schema.type}, got ${actualType}`);
        return errors; // Skip further validation if type is wrong
      }
    }
  }

  // Enum validation
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: must be one of [${schema.enum.join(", ")}]`);
  }

  // Number validations
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: must be >= ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: must be <= ${schema.maximum}`);
    }
  }

  // String validations
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: must have at least ${schema.minLength} characters`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: must have at most ${schema.maxLength} characters`);
    }
    if (schema.pattern) {
      try {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(value)) {
          errors.push(`${path}: must match pattern ${schema.pattern}`);
        }
      } catch {
        // Invalid regex pattern in schema, skip validation
      }
    }
  }

  // Array validation
  if (Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i++) {
      const itemErrors = validateProperty(value[i], schema.items, `${path}[${i}]`);
      errors.push(...itemErrors);
    }
  }

  return errors;
}

function getJsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Sanitize error messages to prevent information leakage
 */
export function sanitizeError(error: Error): string {
  let message = error.message;

  // Remove potential API keys
  message = message.replace(/([a-zA-Z_]*(?:key|token|secret|password|credential)[a-zA-Z_]*)[=:]\s*["']?[^\s"']+["']?/gi, "$1=***");

  // Remove bearer tokens
  message = message.replace(/bearer\s+[^\s]+/gi, "bearer ***");

  // Remove potential file paths that might expose system info
  message = message.replace(/\/home\/[^/\s]+/g, "/home/***");
  message = message.replace(/\/Users\/[^/\s]+/g, "/Users/***");
  message = message.replace(/C:\\Users\\[^\\]+/gi, "C:\\Users\\***");

  return message;
}

/**
 * Validate input length and basic sanitization
 */
export function validateInput(
  input: string,
  options: {
    maxLength?: number;
  } = {}
): { valid: boolean; error?: string } {
  const maxLength = options.maxLength ?? 100000;

  if (typeof input !== "string") {
    return { valid: false, error: "Input must be a string" };
  }

  if (input.length === 0) {
    return { valid: false, error: "Input cannot be empty" };
  }

  if (input.length > maxLength) {
    return { valid: false, error: `Input exceeds maximum length of ${maxLength} characters` };
  }

  return { valid: true };
}
