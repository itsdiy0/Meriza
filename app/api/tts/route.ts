import { NextRequest, NextResponse } from 'next/server';
import { OpenAICompatibleTTSProvider } from '@/lib/tts/openai-compatible';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let provider: OpenAICompatibleTTSProvider | null = null;

function getProvider(): OpenAICompatibleTTSProvider {
  if (!provider) {
    provider = new OpenAICompatibleTTSProvider(
      requireEnv('TTS_BASE_URL'),
      requireEnv('TTS_MODEL'),
      requireEnv('TTS_VOICE')
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

  const { text, voice } = payload as { text?: unknown; voice?: unknown };

  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 });
  }

  if (voice !== undefined && typeof voice !== 'string') {
    return NextResponse.json({ error: 'Voice must be a string' }, { status: 400 });
  }

  try {
    const audio = await getProvider().synthesize(text, voice);

    return new NextResponse(audio, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(audio.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('TTS synthesis failed:', error);
    return NextResponse.json({ error: 'TTS synthesis failed' }, { status: 502 });
  }
}