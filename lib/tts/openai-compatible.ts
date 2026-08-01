import { TTSProvider } from './provider';

export type TTSAudioFormat = 'wav' | 'mp3';

const CONTENT_TYPES: Record<TTSAudioFormat, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
};

export class OpenAICompatibleTTSProvider implements TTSProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly defaultVoice: string;
  private readonly format: TTSAudioFormat;

  /** MIME type of the bytes `synthesize` returns, for the response header. */
  readonly contentType: string;

  constructor(
    baseUrl: string,
    model: string,
    defaultVoice: string,
    format: TTSAudioFormat = 'wav',
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
    this.defaultVoice = defaultVoice;
    this.format = format;
    this.contentType = CONTENT_TYPES[format];
  }

  async synthesize(text: string, voice?: string): Promise<ArrayBuffer> {
    const response = await fetch(`${this.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice: voice || this.defaultVoice,
        response_format: this.format,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `TTS synthesis failed: ${response.status} ${response.statusText}`,
      );
    }

    return await response.arrayBuffer();
  }

  async listVoices(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/audio/voices`);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch voices: ${response.status} ${response.statusText}`,
      );
    }

    const data: unknown = await response.json();
    const voices = (data as { voices?: unknown })?.voices;

    if (!Array.isArray(voices)) {
      throw new Error('Unexpected voices response shape');
    }

    return voices.filter((v): v is string => typeof v === 'string');
  }
}