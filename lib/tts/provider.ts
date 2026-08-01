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