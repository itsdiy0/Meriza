import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAnthropicProvider } from "@/lib/llm/anthropic";

export const runtime = "nodejs";

const MAX_TOKENS = 24;
const MAX_CHARS = 70;

const PROMPT = `Name this conversation in two to five words, as a label in a
sidebar. Reply with the label alone: no quotes, no punctuation at the end, no
preamble. Capitalise it like a headline.

User: {user}

Assistant: {assistant}`;

/** Models add quotes and trailing punctuation regardless of instruction. */
function clean(raw: string): string {
  const title = raw
    .split("\n")[0]
    .replace(/^["'\u201c\u2018]|["'\u201d\u2019]$/g, "")
    .replace(/[.!?,;:]+$/, "")
    .trim();
  return title.length > MAX_CHARS ? "" : title;
}

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { user, assistant } = payload as {
    user?: unknown;
    assistant?: unknown;
  };

  if (typeof user !== "string" || typeof assistant !== "string") {
    return NextResponse.json(
      { error: "Expected { user, assistant }" },
      { status: 400 },
    );
  }

  try {
    const raw = await createAnthropicProvider().complete(
      PROMPT.replace("{user}", user.slice(0, 500)).replace(
        "{assistant}",
        assistant.slice(0, 500),
      ),
      MAX_TOKENS,
    );

    const title = clean(raw);
    if (title === "") {
      return NextResponse.json({ error: "Unusable title" }, { status: 502 });
    }
    return NextResponse.json({ title });
  } catch (error) {
    console.error("Could not name the conversation:", error);
    return NextResponse.json({ error: "Naming failed" }, { status: 502 });
  }
}