"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Composer from "@/components/Composer";
import Orb from "@/components/Orb";
import Transcript from "@/components/Transcript";
import { createSpeechPlayer, type SpeechPlayer } from "@/lib/audio/speech";
import { createMotionMixer, type MotionMixer } from "@/lib/orb/motion/mixer";
import { createWaitingSource } from "@/lib/orb/motion/waiting";
import type { ChatStreamChunk, Message, OrbState } from "@/lib/types";

const newId = () => crypto.randomUUID();

const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const mixerRef = useRef<MotionMixer | null>(null);
  if (mixerRef.current === null) mixerRef.current = createMotionMixer();
  const mixer = mixerRef.current;

  const playerRef = useRef<SpeechPlayer | null>(null);
  if (playerRef.current === null) playerRef.current = createSpeechPlayer();
  const player = playerRef.current;

  const abortRef = useRef<AbortController | null>(null);

  const onFrame = useCallback((t: number) => mixer.frame(t), [mixer]);

  /**
   * Ends the current turn wherever it has reached: generation, synthesis, or
   * playback. Whatever text arrived stays in the transcript, since it is what
   * actually happened.
   */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    player.stop();
    mixer.clear();
    setOrbState("idle");
    setGenerating(false);
    setSpeaking(false);
  }, [mixer, player]);

  const appendToAssistant = useCallback((id: string, text: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: m.content + text } : m)),
    );
  }, []);

  const send = useCallback(
    async (text: string) => {
      // A new turn supersedes the last one, which may still be generating or
      // speaking. Interrupting is expected, not an error.
      stop();

      const userMessage: Message = { id: newId(), role: "user", content: text };
      const assistantId = newId();
      const history = [...messages, userMessage];

      setError(null);
      setMessages([
        ...history,
        { id: assistantId, role: "assistant", content: "" },
      ]);
      setOrbState("thinking");
      setGenerating(true);
      setSpeaking(true);

      // Inside the send gesture, which is the only place iOS Safari will
      // honour a resume.
      await player.unlock();
      player.start({
        onStart: (audioSource) => {
          setOrbState("responding");
          mixer.play(audioSource, 0.15);
        },
        onEnd: () => {
          mixer.clear();
          setOrbState("idle");
          setSpeaking(false);
        },
        onError: () => {
          setError("Voice playback failed");
          stop();
        },
      });

      const controller = new AbortController();
      abortRef.current = controller;

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
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`Request failed: ${res.status}`);
        }

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
                setOrbState("waiting");
                mixer.play(createWaitingSource(), 0.6);
              }
              appendToAssistant(assistantId, chunk.text);
              // The transcript keeps its markup; only speech loses it.
              player.push(chunk.text);
            } else {
              setError(chunk.message);
            }
          }
        }

        abortRef.current = null;
        setGenerating(false);
        player.end();
      } catch (err) {
        if (isAbort(err)) return;
        setError("Lost the connection, try again");
        stop();
      }
    },
    [messages, appendToAssistant, mixer, player, stop],
  );

  useEffect(() => {
    return () => {
      player.dispose();
    };
  }, [player]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden">
      <Orb state={orbState} onFrame={onFrame} />

      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <div className="relative flex flex-1 justify-center overflow-hidden">
          <Transcript messages={messages} error={error} />
        </div>
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
          <Composer
            onSend={send}
            onStop={stop}
            active={generating || speaking}
          />
        </div>
      </div>
    </main>
  );
}