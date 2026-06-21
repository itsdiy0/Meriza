"use client";

import { useCallback, useState } from "react";
import Composer from "@/components/Composer";
import Orb from "@/components/Orb";
import Transcript from "@/components/Transcript";
import type { ChatStreamChunk, Message, OrbState } from "@/lib/types";

const newId = () => crypto.randomUUID();

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const appendToAssistant = useCallback((id: string, text: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: m.content + text } : m)),
    );
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (busy) return;

      const userMessage: Message = { id: newId(), role: "user", content: text };
      const assistantId = newId();
      const history = [...messages, userMessage];

      setError(null);
      setMessages([
        ...history,
        { id: assistantId, role: "assistant", content: "" },
      ]);
      setOrbState("thinking");
      setBusy(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });
        if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let firstDelta = true;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nl = buffer.indexOf("\n");
          while (nl !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            nl = buffer.indexOf("\n");
            if (!line) continue;

            const chunk = JSON.parse(line) as ChatStreamChunk;
            if (chunk.type === "delta") {
              if (firstDelta) {
                firstDelta = false;
                setOrbState("responding");
              }
              appendToAssistant(assistantId, chunk.text);
            } else {
              setError(chunk.message);
            }
          }
        }
      } catch {
        setError("Lost the connection, try again");
      } finally {
        setOrbState("idle");
        setBusy(false);
      }
    },
    [busy, messages, appendToAssistant],
  );

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden">
      <Orb state={orbState} />

      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <div className="relative flex flex-1 justify-center overflow-hidden">
          <Transcript messages={messages} error={error} />
        </div>
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
          <Composer onSend={send} disabled={busy} />
        </div>
      </div>
    </main>
  );
}
