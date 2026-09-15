export interface TTSProvider {
  /** MIME type of the bytes `synthesize` resolves to, e.g. `audio/wav`. */
  readonly contentType: string;

  /**
   * Synthesizes speech from text.
   * @param text - The text to convert to speech.
   * @param voice - Optional voice selection.
   * @returns A Promise resolving to an ArrayBuffer containing audio data.
   */
  synthesize(text: string, voice?: string): Promise<ArrayBuffer>;

  /**
   * Lists available voices.
   * @returns A Promise resolving to an array of voice names.
   */
  listVoices(): Promise<string[]>;
}
export interface TTSVoice {
  id: string;
  /** Display label from the engine, often identical to the id. */
  name: string;
}

export interface TTSOptions {
  /** Engine voice identifier. Falls back to the configured default. */
  voice?: string;
  /** Speech rate, 0.5 to 2. */
  speed?: number;
}

export interface TTSProvider {
  /** MIME type of the bytes `synthesize` resolves to, e.g. `audio/wav`. */
  readonly contentType: string;

  synthesize(text: string, options?: TTSOptions): Promise<ArrayBuffer>;

  listVoices(): Promise<TTSVoice[]>;
}