"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
} from "react";
import {
  createConversation,
  deleteMessage,
  listConversations,
  readMessages,
  writeMessage,
} from "@/lib/storage/conversations";
import type { Message } from "@/lib/types";

export interface ConversationHandle {
  /** Null until the store has been read, so the first paint can wait. */
  id: string | null;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  /** Exposed so a caller can sync it before saving within the same tick. */
  messagesRef: MutableRefObject<Message[]>;
  /**
   * Persists a message, creating it or updating it in place. Call after the
   * message exists in `messages`, since its position there is what orders it
   * in the store.
   */
  save: (message: Message) => void;
  /** Removes a message that was never spoken. */
  discard: (id: string) => void;
}

/**
 * Holds the current conversation in state and mirrors it to storage.
 *
 * State stays the source of truth rather than reading back from the database:
 * the assistant message is rewritten several times a second while a reply is
 * revealed, and round-tripping that through IndexedDB would be absurd. The
 * store is the durable copy, written to and read from only at the edges.
 *
 * Writes are fire and forget. A failed one costs the durable copy of one
 * message, and blocking the reveal on a database round trip would cost more.
 */
export function useConversation(): ConversationHandle {
  const [id, setId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Mirrors state so `save` can read the current conversation without being
  // rebuilt on every message. Assigned during render and, in `send`, directly
  // before saving, since React has not committed by then.
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;

  useEffect(() => {
    let live = true;

    const restore = async () => {
      try {
        const [recent] = await listConversations();
        if (recent === undefined) {
          const fresh = await createConversation(crypto.randomUUID());
          if (live) setId(fresh.id);
          return;
        }

        const stored = await readMessages(recent.id);
        if (!live) return;

        setMessages(
          stored.map(({ id: messageId, role, content }) => ({
            id: messageId,
            role,
            content,
          })),
        );
        setId(recent.id);
      } catch (error) {
        // An unavailable database, private browsing or a blocked upgrade,
        // should cost persistence and nothing else.
        console.error("Could not restore the conversation:", error);
        if (live) setId(crypto.randomUUID());
      }
    };

    void restore();
    return () => {
      live = false;
    };
  }, []);

  const save = useCallback(
    (message: Message) => {
      if (id === null) return;
      // Position comes from the conversation rather than a counter, so a
      // discarded reply cannot burn an index and a late write from the
      // previous turn cannot land between the current turn's messages.
      const position = messagesRef.current.findIndex(
        (m) => m.id === message.id,
      );
      if (position === -1) return;
      void writeMessage(id, message, position).catch((error) => {
        console.error("Could not save a message:", error);
      });
    },
    [id],
  );

  const discard = useCallback((messageId: string) => {
    void deleteMessage(messageId).catch((error) => {
      console.error("Could not discard a message:", error);
    });
  }, []);

  return { id, messages, setMessages, save, discard, messagesRef };
}