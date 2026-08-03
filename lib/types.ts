export type OrbState = "idle" | "listening" | "thinking" | "responding" | "waiting";

export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
}

/** Body the client POSTs to /api/chat. */
export interface ChatRequest {
  messages: Array<Pick<Message, "role" | "content">>;
}

/**
 * Frames the chat route streams to the client, one JSON object per line.
 * `delta` carries a chunk of assistant text; `error` ends the stream early
 * with a short, user-facing message.
 */
export type ChatStreamChunk =
  | { type: "delta"; text: string }
  | { type: "error"; message: string };
