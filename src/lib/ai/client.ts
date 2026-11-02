import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!hasApiKey()) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 10 * 60 * 1000 });
  return client;
}
