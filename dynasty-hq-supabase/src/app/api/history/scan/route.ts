/**
 * Reads the final CFB Playoff bracket screenshot and returns the champion,
 * runner-up and title-game score for the commissioner to confirm. Nothing is
 * saved here; the history form saves after the commissioner checks it.
 */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getUser, unauthorized } from '@/lib/auth';
import { getDynastyCtx } from '@/lib/dynastyContext';
import { getSupabase } from '@/lib/supabaseClient';
import { sniffImageMediaType } from '@/lib/ocrShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-5';
const TOOL = {
  name: 'report_title_game',
  description: 'Report who won the national championship shown in this CFB Playoff bracket screenshot.',
  input_schema: {
    type: 'object' as const,
    properties: {
      champion: { type: ['string', 'null'], description: 'Team that won the national championship, exactly as written on screen. Null if the final has not been played or is not legible.' },
      runner_up: { type: ['string', 'null'], description: 'The team that lost the national championship game.' },
      score: { type: ['string', 'null'], description: 'Final score of the national championship game, winner first, like "34-27". Null if not shown.' },
    },
    required: ['champion', 'runner_up', 'score'],
  },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  const c = await getDynastyCtx(user.id);
  if (!c) return NextResponse.json({ error: 'Join a dynasty first.' }, { status: 409 });
  if (!c.isCommish) return NextResponse.json({ error: 'Only the commissioner can do that.' }, { status: 403 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is missing from this Vercel project.' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const b64 = String(body.imageBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!b64) return NextResponse.json({ error: 'Attach the bracket screenshot.' }, { status: 400 });
  const buf = Buffer.from(b64, 'base64');
  const mediaType = sniffImageMediaType(buf);

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: 'This is the final CFB Playoff bracket from College Football. Report the national champion, the runner-up, and the title game score. If the national championship game has not been played yet, return null for all three. Do not guess.' },
        ],
      }],
    });
    const tu = msg.content.find((x: any) => x.type === 'tool_use') as any;
    const out = (tu?.input || {}) as { champion?: string | null; runner_up?: string | null; score?: string | null };

    // Match what was read on screen to the app's team names.
    const sb = getSupabase();
    const [{ data: assets }, { data: helper }] = await Promise.all([
      sb.from('assets').select('team_name'),
      sb.from('ocr_helper').select('team_name, name_in_playoffs, name_in_schedule, name_in_polls'),
    ]);
    const canon = new Map<string, string>();
    (assets || []).forEach((a: any) => a.team_name && canon.set(norm(a.team_name), a.team_name));
    (helper || []).forEach((h: any) => [h.name_in_playoffs, h.name_in_schedule, h.name_in_polls].forEach((n: any) => { if (n && h.team_name) canon.set(norm(String(n)), h.team_name); }));
    const match = (n?: string | null) => (n ? canon.get(norm(n)) || null : null);

    return NextResponse.json({
      champion: match(out.champion) || null, runnerUp: match(out.runner_up) || null, score: out.score || null,
      read: { champion: out.champion || null, runnerUp: out.runner_up || null },
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Couldn't read the screenshot: ${e?.message || e}` }, { status: 500 });
  }
}
