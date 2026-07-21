import { TTSProvider } from './provider';

export class OpenAICompatibleTTSProvider implements TTSProvider {
  private baseUrl: string;
  private model: string;
  private defaultVoice: string;

  constructor(baseUrl: string, model: string, defaultVoice: string) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.defaultVoice = defaultVoice;
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
      }),
    });

    if (!response.ok) {
      throw new Error(`TTS synthesis failed: ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }

  async listVoices(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/audio/voices`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch voices: ${response.statusText}`);
    }

    const data = await response.json();
    return data.voices;
  }
}