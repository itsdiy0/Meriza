"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  createConversation,
  deleteConversation,
  deleteMessage,
  listConversations,
  readMessages,
  renameConversation,
  writeMessage,
} from "@/lib/storage/conversations";
import type { Conversation } from "@/lib/storage/types";
import type { Message } from "@/lib/types";

const TITLE_CHARS = 48;

export interface ConversationHandle {
  /** Null until the store has been read, so the first paint can wait. */
  id: string | null;
  /** Newest first. Refreshed on demand rather than on every write. */
  conversations: Conversation[];
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
  refresh: () => Promise<void>;
  open: (id: string) => Promise<void>;
  create: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** Stands in until a generated title replaces it. */
function provisionalTitle(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length <= TITLE_CHARS
    ? flat
    : `${flat.slice(0, TITLE_CHARS).trimEnd()}...`;
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  // Mirrors state so `save` can read the current conversation without being
  // rebuilt on every message. Assigned during render and, in `send`, directly
  // before saving, since React has not committed by then.
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;

  const refresh = useCallback(async () => {
    try {
      setConversations(await listConversations());
    } catch (error) {
      console.error("Could not list conversations:", error);
    }
  }, []);

  useEffect(() => {
    let live = true;

    const restore = async () => {
      try {
        const all = await listConversations();
        if (!live) return;
        setConversations(all);

        const [recent] = all;
        if (recent === undefined) {
          const fresh = await createConversation(crypto.randomUUID());
          if (!live) return;
          setConversations([fresh]);
          setId(fresh.id);
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

      // The opening message labels the conversation until something better
      // is generated for it.
      if (position === 0 && message.role === "user") {
        void renameConversation(id, provisionalTitle(message.content));
      }
    },
    [id],
  );

  const discard = useCallback((messageId: string) => {
    void deleteMessage(messageId).catch((error) => {
      console.error("Could not discard a message:", error);
    });
  }, []);

  const open = useCallback(
    async (next: string) => {
      if (next === id) return;
      try {
        const stored = await readMessages(next);
        const restored = stored.map(({ id: messageId, role, content }) => ({
          id: messageId,
          role,
          content,
        }));
        messagesRef.current = restored;
        setMessages(restored);
        setId(next);
      } catch (error) {
        console.error("Could not open the conversation:", error);
      }
    },
    [id],
  );

  const create = useCallback(async () => {
    try {
      const fresh = await createConversation(crypto.randomUUID());
      messagesRef.current = [];
      setMessages([]);
      setId(fresh.id);
      setConversations((prev) => [fresh, ...prev]);
    } catch (error) {
      console.error("Could not start a conversation:", error);
    }
  }, []);

  const remove = useCallback(
    async (target: string) => {
      try {
        await deleteConversation(target);
        const all = await listConversations();
        setConversations(all);

        if (target !== id) return;

        // Deleting the one being read leaves nothing open, so fall through to
        // the next most recent, or to a fresh one if that was the last.
        const [recent] = all;
        if (recent === undefined) {
          await create();
          return;
        }
        await open(recent.id);
      } catch (error) {
        console.error("Could not delete the conversation:", error);
      }
    },
    [create, id, open],
  );

  return {
    id,
    conversations,
    messages,
    setMessages,
    messagesRef,
    save,
    discard,
    refresh,
    open,
    create,
    remove,
  };
}