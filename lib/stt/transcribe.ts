/** Sends a recording for transcription. Empty means nothing intelligible. */
export async function transcribe(audio: Blob): Promise<string> {
    const form = new FormData();
    form.append("file", audio, "speech.wav");
  
    const response = await fetch("/api/stt", { method: "POST", body: form });
    if (!response.ok) throw new Error(`Transcription failed: ${response.status}`);
  
    const { text } = (await response.json()) as { text: string };
    return text;
  }