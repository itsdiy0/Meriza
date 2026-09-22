import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { STTProvider } from "@/lib/stt/provider";
import { WhisperCppProvider } from "@/lib/stt/whisper-cpp";

export const runtime = "nodejs";

/** Roughly a minute of 16kHz mono WAV, well past any single utterance. */
const MAX_BYTES = 2_000_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let provider: STTProvider | null = null;

function getProvider(): STTProvider {
  if (!provider) {
    provider = new WhisperCppProvider(requireEnv("STT_BASE_URL"));
  }
  return provider;
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form" }, { status: 400 });
  }

  const audio = form.get("file");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Audio is required" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "Recording is too long" }, { status: 413 });
  }

  const stt = getProvider();

  try {
    return NextResponse.json({ text: await stt.transcribe(audio) });
  } catch (error) {
    console.error("Transcription failed:", error);
    return NextResponse.json({ error: "Engine unreachable" }, { status: 502 });
  }
}