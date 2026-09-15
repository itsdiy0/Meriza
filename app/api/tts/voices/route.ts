import { NextResponse } from "next/server";
import { getProvider } from "@/app/api/tts/route";

export async function GET() {
  try {
    return NextResponse.json({ voices: await getProvider().listVoices() });
  } catch (error) {
    console.error("Failed to list voices:", error);
    return NextResponse.json({ error: "Engine unreachable" }, { status: 502 });
  }
}