import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/llm/prompt";
import type { LlmProvider, ProviderMessage } from "@/lib/llm/provider";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export function createAnthropicProvider(): LlmProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.MERIZA_MODEL || DEFAULT_MODEL;
  const system = process.env.MERIZA_SYSTEM_PROMPT || SYSTEM_PROMPT;

  return {
    async *stream(messages: ProviderMessage[]): AsyncIterable<string> {
      const stream = client.messages.stream({
        model,
        max_tokens: 2048,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
    },
  };
}