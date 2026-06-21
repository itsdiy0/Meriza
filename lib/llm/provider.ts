import type { Message } from "@/lib/types";

export type ProviderMessage = Pick<Message, "role" | "content">;

/**
 * The single seam between the UI and a model backend. The route handler talks
 * to this interface, never to a vendor SDK directly, so a second provider can
 * be added later without touching the rest of the app.
 */
export interface LlmProvider {
  stream(messages: ProviderMessage[]): AsyncIterable<string>;
}
