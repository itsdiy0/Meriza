import type { TTSOptions, TTSProvider, TTSVoice } from "@/lib/tts/provider";

export type TTSAudioFormat = "wav" | "mp3";

const CONTENT_TYPES: Record<TTSAudioFormat, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
};

/**
 * Normalizes the voices payload. Engines disagree on the shape: a bare array
 * of strings, an array of objects, or either wrapped in a `voices` key. All of
 * them are accepted rather than assuming one, since the point of this client
 * is that the engine is swappable.
 */
function readVoices(payload: unknown): TTSVoice[] {
  const list = Array.isArray(payload)
    ? payload
    : (payload as { voices?: unknown })?.voices;
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry): TTSVoice[] => {
    if (typeof entry === "string") return [{ id: entry, name: entry }];
    if (typeof entry !== "object" || entry === null) return [];
    const { id, name } = entry as { id?: unknown; name?: unknown };
    if (typeof id !== "string") return [];
    return [{ id, name: typeof name === "string" ? name : id }];
  });
}

export class OpenAICompatibleTTSProvider implements TTSProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly defaultVoice: string;
  private readonly format: TTSAudioFormat;

  readonly contentType: string;

  constructor(
    baseUrl: string,
    model: string,
    defaultVoice: string,
    format: TTSAudioFormat = "wav",
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
    this.defaultVoice = defaultVoice;
    this.format = format;
    this.contentType = CONTENT_TYPES[format];
  }

  async synthesize(text: string, options: TTSOptions = {}): Promise<ArrayBuffer> {
    const response = await fetch(`${this.baseUrl}/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice: options.voice || this.defaultVoice,
        response_format: this.format,
        ...(options.speed === undefined ? {} : { speed: options.speed }),
      }),
    });

    if (!response.ok) {
      throw new Error(
        `TTS synthesis failed: ${response.status} ${response.statusText}`,
      );
    }

    return response.arrayBuffer();
  }

  async listVoices(): Promise<TTSVoice[]> {
    const response = await fetch(`${this.baseUrl}/audio/voices`);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch voices: ${response.status} ${response.statusText}`,
      );
    }

    return readVoices(await response.json());
  }
}