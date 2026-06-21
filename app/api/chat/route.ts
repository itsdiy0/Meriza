import type { NextRequest } from "next/server";
import { createAnthropicProvider } from "@/lib/llm/anthropic";
import type { ChatRequest, ChatStreamChunk } from "@/lib/types";

export const runtime = "nodejs";

function isChatRequest(value: unknown): value is ChatRequest {
  if (typeof value !== "object" || value === null) return false;
  const messages = (value as { messages?: unknown }).messages;
  return (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        ((m as { role?: unknown }).role === "user" ||
          (m as { role?: unknown }).role === "assistant") &&
        typeof (m as { content?: unknown }).content === "string",
    )
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!isChatRequest(body)) {
    return new Response("Expected { messages: [{ role, content }] }", {
      status: 400,
    });
  }
  const { messages } = body;

  const encoder = new TextEncoder();
  const frame = (chunk: ChatStreamChunk) =>
    encoder.encode(`${JSON.stringify(chunk)}\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const provider = createAnthropicProvider();
        for await (const text of provider.stream(messages)) {
          if (req.signal.aborted) break;
          controller.enqueue(frame({ type: "delta", text }));
        }
      } catch (err) {
        console.error("chat stream failed", err);
        controller.enqueue(
          frame({ type: "error", message: "Lost the connection, try again" }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
