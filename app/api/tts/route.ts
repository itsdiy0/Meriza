import { NextRequest, NextResponse } from 'next/server';
import { OpenAICompatibleTTSProvider } from '@/lib/tts/openai-compatible';

const ttsProvider = new OpenAICompatibleTTSProvider(
  process.env.TTS_BASE_URL!,
  process.env.TTS_MODEL!,
  process.env.TTS_VOICE!
);

export async function POST(req: NextRequest) {
  try {
    const { text, voice } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const audioBuffer = await ttsProvider.synthesize(text, voice);
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    });
  } catch (error) {
    console.error('TTS Error:', error);
    return NextResponse.json({ error: 'TTS synthesis failed' }, { status: 500 });
  }
}