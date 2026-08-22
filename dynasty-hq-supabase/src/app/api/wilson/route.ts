import { NextResponse } from 'next/server';
import { getDashboardData } from '@/lib/dashboard';

// Always builds fresh dynasty context on every question — no caching, same
// pattern as /api/dashboard.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MODEL = 'claude-sonnet-5';
const MAX_HISTORY_MESSAGES = 12; // trailing turns kept for follow-up context

interface WilsonMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Trim the dashboard payload down to what Wilson actually needs to answer
// questions. The `assets` array (138 teams' colors/logos) is dropped — it's
// only for visual rendering elsewhere in the app and would otherwise
// dominate the token budget for no benefit.
function buildWilsonContext(data: Awaited<ReturnType<typeof getDashboardData>>) {
  const { assets, ...rest } = data as any;
  return rest;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { message: 'Wilson is not configured yet — ANTHROPIC_API_KEY is missing from this Vercel project\u2019s environment variables.' },
      { status: 500 }
    );
  }

  let body: { message?: string; history?: WilsonMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 });
  }

  const question = (body.message || '').trim();
  if (!question) {
    return NextResponse.json({ message: 'Ask Wilson something first.' }, { status: 400 });
  }
  const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_MESSAGES) : [];

  let context: any;
  try {
    const data = await getDashboardData();
    context = buildWilsonContext(data);
  } catch (err: any) {
    return NextResponse.json({ message: `Wilson couldn't load the dynasty data: ${err?.message || err}` }, { status: 500 });
  }

  const teamName = context?.team?.TEAM_NAME || 'the user\u2019s team';
  const systemPrompt = `You are Wilson, the in-house librarian and assistant for Dynasty HQ — a personal college football dynasty tracker built by the user for their save with ${teamName}.

Answer questions using ONLY the dynasty data provided below in DYNASTY_DATA. This is the live, current-week state of the user's dynasty (their team, schedule, stats, rankings, roster, awards, coaching info, recent content, etc).

Rules:
- If the answer isn't in the data, say so plainly — don't guess or invent stats, results, or names.
- Be concise and conversational, like a knowledgeable teammate who's read every box score. Not a customer-support bot.
- You can do simple math/lookups across the data (e.g. "how many games left", "who do we play next", "what's our record") but don't speculate about anything not in DYNASTY_DATA.
- If asked about other real-world teams, players, or general CFB knowledge not in the data, you can use general knowledge but make clear it's not from their dynasty.

DYNASTY_DATA:
${JSON.stringify(context)}`;

  const messages = [...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: question }];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ message: `Wilson hit an error talking to Claude: ${errText}` }, { status: 502 });
    }

    const json = await res.json();
    const textBlocks = (json.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text);
    const answer = textBlocks.join('\n').trim() || "Wilson didn't have anything to say — try rephrasing?";
    return NextResponse.json({ answer });
  } catch (err: any) {
    return NextResponse.json({ message: `Wilson hit an error: ${err?.message || err}` }, { status: 500 });
  }
}
