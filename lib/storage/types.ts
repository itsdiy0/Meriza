import type { Message } from "@/lib/types";

export interface Conversation {
  id: string;
  /** Short label for the list. Null until one has been generated. */
  title: string | null;
  createdAt: number;
  /** Last time a message was written, for ordering the list. */
  updatedAt: number;
}

export interface StoredMessage extends Message {
  conversationId: string;
  /** Position within its conversation, so order does not depend on
   *  insertion timing or on comparing timestamps that may collide. */
  index: number;
}