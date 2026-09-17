import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Conversation, StoredMessage } from "@/lib/storage/types";
import type { Message } from "@/lib/types";

const NAME = "meriza";
const VERSION = 1;

interface MerizaDB extends DBSchema {
  conversations: {
    key: string;
    value: Conversation;
    indexes: { updatedAt: number };
  };
  messages: {
    key: string;
    value: StoredMessage;
    indexes: { conversationId: string };
  };
}

let db: Promise<IDBPDatabase<MerizaDB>> | null = null;

/**
 * Opens the database, creating it on first use.
 *
 * The upgrade path deliberately wipes rather than migrates. Meriza stores a
 * conversation log, not records anyone has invested in, and a real migration
 * per shape change is a maintenance cost with no matching value. Bumping
 * VERSION therefore discards everything, which is why export exists.
 */
function open(): Promise<IDBPDatabase<MerizaDB>> {
  if (db === null) {
    db = openDB<MerizaDB>(NAME, VERSION, {
      upgrade(database, from) {
        if (from > 0) {
          for (const store of database.objectStoreNames) {
            database.deleteObjectStore(store);
          }
        }
        database
          .createObjectStore("conversations", { keyPath: "id" })
          .createIndex("updatedAt", "updatedAt");
        database
          .createObjectStore("messages", { keyPath: "id" })
          .createIndex("conversationId", "conversationId");
      },
    });
  }
  return db;
}

export async function createConversation(id: string): Promise<Conversation> {
  const now = Date.now();
  const conversation: Conversation = {
    id,
    title: null,
    createdAt: now,
    updatedAt: now,
  };
  await (await open()).put("conversations", conversation);
  return conversation;
}

/** Newest first, so the caller can take the head without sorting. */
export async function listConversations(): Promise<Conversation[]> {
  const all = await (await open()).getAllFromIndex("conversations", "updatedAt");
  return all.reverse();
}

export async function readConversation(
  id: string,
): Promise<Conversation | undefined> {
  return (await open()).get("conversations", id);
}

export async function renameConversation(
  id: string,
  title: string,
): Promise<void> {
  const store = (await open())
    .transaction("conversations", "readwrite")
    .objectStore("conversations");
  const conversation = await store.get(id);
  if (conversation === undefined) return;
  await store.put({ ...conversation, title });
}

/**
 * Writes a message and touches its conversation, in one transaction so the
 * list ordering cannot disagree with what is stored. Used both to append and
 * to update the assistant message as it is spoken, since the id is the key.
 */
export async function writeMessage(
  conversationId: string,
  message: Message,
  index: number,
): Promise<void> {
  const tx = (await open()).transaction(
    ["conversations", "messages"],
    "readwrite",
  );
  const conversations = tx.objectStore("conversations");
  const conversation = await conversations.get(conversationId);

  await Promise.all([
    tx.objectStore("messages").put({ ...message, conversationId, index }),
    conversation === undefined
      ? Promise.resolve()
      : conversations.put({ ...conversation, updatedAt: Date.now() }),
    tx.done,
  ]);
}

export async function readMessages(
  conversationId: string,
): Promise<StoredMessage[]> {
  const found = await (await open()).getAllFromIndex(
    "messages",
    "conversationId",
    conversationId,
  );
  return found.sort((a, b) => a.index - b.index);
}

export async function deleteMessage(id: string): Promise<void> {
  await (await open()).delete("messages", id);
}

export async function deleteConversation(id: string): Promise<void> {
  const tx = (await open()).transaction(
    ["conversations", "messages"],
    "readwrite",
  );
  const messages = tx.objectStore("messages").index("conversationId");

  const keys = await messages.getAllKeys(id);
  await Promise.all([
    tx.objectStore("conversations").delete(id),
    ...keys.map((key) => tx.objectStore("messages").delete(key)),
    tx.done,
  ]);
}

export async function clearAll(): Promise<void> {
  const tx = (await open()).transaction(
    ["conversations", "messages"],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore("conversations").clear(),
    tx.objectStore("messages").clear(),
    tx.done,
  ]);
}

export interface Backup {
  version: number;
  exportedAt: number;
  conversations: Conversation[];
  messages: StoredMessage[];
}

export async function exportAll(): Promise<Backup> {
  const database = await open();
  return {
    version: VERSION,
    exportedAt: Date.now(),
    conversations: await database.getAll("conversations"),
    messages: await database.getAll("messages"),
  };
}