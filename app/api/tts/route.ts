import { NextRequest, NextResponse } from 'next/server';
import { OpenAICompatibleTTSProvider } from '@/lib/tts/openai-compatible';
import type { TTSProvider } from '@/lib/tts/provider';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let provider: TTSProvider | null = null;

export function getProvider(): TTSProvider {
  if (!provider) {
    provider = new OpenAICompatibleTTSProvider(
      requireEnv('TTS_BASE_URL'),
      requireEnv('TTS_MODEL'),
      requireEnv('TTS_VOICE'),
    );
  }
  return provider;
}

export async function POST(req: NextRequest) {
  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { text, voice, speed } = payload as {
    text?: unknown;
    voice?: unknown;
    speed?: unknown;
  };

  if (typeof text !== "string" || text.trim() === "") {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  if (voice !== undefined && typeof voice !== "string") {
    return NextResponse.json({ error: "Voice must be a string" }, { status: 400 });
  }

  if (
    speed !== undefined &&
    (typeof speed !== "number" || !Number.isFinite(speed) || speed < 0.5 || speed > 2)
  ) {
    return NextResponse.json(
      { error: "Speed must be between 0.5 and 2" },
      { status: 400 },
    );
  }

  const tts = getProvider();

  try {
    const audio = await tts.synthesize(text, { voice, speed });

    return new NextResponse(audio, {
      headers: {
        'Content-Type': tts.contentType,
        'Content-Length': String(audio.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('TTS synthesis failed:', error);
    return NextResponse.json({ error: 'TTS synthesis failed' }, { status: 502 });
  }
}