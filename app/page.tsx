"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Composer from "@/components/Composer";
import Orb from "@/components/Orb";
import Settings from "@/components/Settings";
import Transcript from "@/components/Transcript";
import ViewToggle from "@/components/ViewToggle";
import { createSpeechPlayer, type SpeechPlayer } from "@/lib/audio/speech";
import { createMotionMixer, type MotionMixer } from "@/lib/orb/motion/mixer";
import { createWaitingSource } from "@/lib/orb/motion/waiting";
import { useSettings } from "@/lib/settings/useSettings";
import { createRevealer, type Revealer } from "@/lib/transcript/reveal";
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
  const [revealed, setRevealed] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const settings = useSettings();
  const { settings: prefs, set: setPref } = settings;

  const mixerRef = useRef<MotionMixer | null>(null);
  if (mixerRef.current === null) mixerRef.current = createMotionMixer();
  const mixer = mixerRef.current;

  const playerRef = useRef<SpeechPlayer | null>(null);
  if (playerRef.current === null) playerRef.current = createSpeechPlayer();
  const player = playerRef.current;

  const abortRef = useRef<AbortController | null>(null);
  const replyIdRef = useRef<string | null>(null);

  const writeReply = useCallback((content: string, visible: number) => {
    setRevealed(visible);
    const id = replyIdRef.current;
    if (id === null) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content } : m)),
    );
  }, []);

  const revealerRef = useRef<Revealer | null>(null);
  if (revealerRef.current === null) {
    revealerRef.current = createRevealer(writeReply);
  }
  const revealer = revealerRef.current;

  const onFrame = useCallback((t: number) => mixer.frame(t), [mixer]);

  /**
   * Ends the current turn wherever it has reached, keeping whatever was
   * actually spoken. The transcript records what was said rather than what was
   * written, so an interrupted reply stops mid-sentence and text the orb never
   * reached is discarded with it. A turn cut off before it spoke at all leaves
   * no reply, so its empty message is removed rather than left labelled and
   * blank.
   */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    player.stop();
    revealer.halt();

    const id = replyIdRef.current;
    if (id !== null) {
      setMessages((prev) =>
        prev.filter((m) => m.id !== id || m.content !== ""),
      );
    }

    mixer.clear();
    setOrbState("idle");
    setGenerating(false);
    setSpeaking(false);
  }, [mixer, player, revealer]);

  const send = useCallback(
    async (text: string) => {
      // A new turn supersedes the last one, which may still be generating or
      // speaking. Interrupting is expected, not an error.
      stop();

      const userMessage: Message = { id: newId(), role: "user", content: text };
      const replyId = newId();
      const history = [...messages, userMessage];

      replyIdRef.current = replyId;
      revealer.reset();

      setError(null);
      setMessages([...history, { id: replyId, role: "assistant", content: "" }]);
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
        onChunk: (spoken, seconds) => revealer.push(spoken, seconds),
        onEnd: () => {
          revealer.flush();
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
              // Not shown here: the transcript is paced by the player, so a
              // word appears as the orb reaches it.
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
    [messages, mixer, player, revealer, stop],
  );

  useEffect(() => {
    return () => {
      player.dispose();
      revealer.halt();
    };
  }, [player, revealer]);

  const split = prefs.view !== "overlay";
  const orbFirst = prefs.view === "left";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden">
      {/* The orb keeps one continuous scene across every arrangement, so a
          view change slides it rather than tearing down its WebGL context.
          Below the breakpoint there is no room to split and it fills the
          viewport regardless of the setting. */}
      <div
        className={`absolute inset-y-0 transition-[left,right] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          split
            ? orbFirst
              ? "left-0 right-0 md:right-1/2"
              : "left-0 right-0 md:left-1/2"
            : "left-0 right-0"
        }`}
      >
        <Orb state={orbState} onFrame={onFrame} />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-end p-4">
        <ViewToggle
          value={prefs.view}
          onChange={(view) => setPref("view", view)}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="relative flex flex-1 overflow-hidden">
          <div
            className={`absolute inset-y-0 transition-[left,right] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              split
                ? orbFirst
                  ? "left-0 right-0 md:left-1/2"
                  : "left-0 right-0 md:right-1/2"
                : "left-0 right-0"
            }`}
          >
            <Transcript
              messages={messages}
              error={error}
              revealing={replyIdRef.current}
              revealedWords={revealed}
            />
          </div>
        </div>
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
          <Composer
            onSend={send}
            onStop={stop}
            onSettings={() => setSettingsOpen(true)}
            active={generating || speaking}
          />
        </div>
      </div>

      <Settings
        {...settings}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}