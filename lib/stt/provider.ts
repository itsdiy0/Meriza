export interface STTProvider {
    /** Transcribes 16kHz mono WAV audio. Returns empty for silence. */
    transcribe(audio: Blob): Promise<string>;
  }