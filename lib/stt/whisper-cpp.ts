import type { STTProvider } from "@/lib/stt/provider";

/**
 * whisper.cpp emits these for silence or noise it cannot resolve into words.
 * They are markers rather than transcriptions and must not reach the model.
 */
const MARKERS = /\[(BLANK_AUDIO|INAUDIBLE|NO SPEECH|SILENCE|MUSIC|SOUND)\]/gi;

/**
 * whisper.cpp's own server, which exposes `/inference` rather than the OpenAI
 * transcription path. Unlike the TTS side this is not engine-portable, so a
 * different engine means a second implementation of `STTProvider` rather than
 * a base URL change. That is the honest shape: pretending otherwise would put
 * a swap that does not work behind an env var.
 *
 * It also accepts only WAV, 16kHz, mono. Anything else returns a decode error,
 * which is why the client encodes rather than handing over a MediaRecorder
 * blob.
 */
export class WhisperCppProvider implements STTProvider {
  private readonly endpoint: string;

  constructor(baseUrl: string) {
    this.endpoint = `${baseUrl.replace(/\/+$/, "")}/inference`;
  }

  async transcribe(audio: Blob): Promise<string> {
    const form = new FormData();
    form.append("file", audio, "speech.wav");
    form.append("response_format", "json");

    const response = await fetch(this.endpoint, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      throw new Error(
        `Transcription failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload: unknown = await response.json();
    const text = (payload as { text?: unknown })?.text;
    if (typeof text !== "string") return "";

    // The engine pads with a leading space and a trailing newline.
    return text.replace(MARKERS, "").replace(/\s+/g, " ").trim();
  }
}