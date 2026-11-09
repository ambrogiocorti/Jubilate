// Edge Function: finds MusicXML scores on CPDL by song title and proxies the
// chosen file (CPDL does not send CORS headers for its files).
//
// POST { action: 'search', title }  -> { results: ScoreCandidate[] }
// POST { action: 'fetch', url }     -> MusicXML bytes (.mxl or .musicxml)
//
// Only signed-in Jubilate users may call it; only CPDL MusicXML files up to
// 5 MB are fetched. No secrets are used.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { findScores, isAllowedFileUrl, MAX_SCORE_BYTES } from '../_shared/cpdl.ts';

const USER_AGENT = 'Jubilate parish songbook (score search)';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`cpdl_${r.status}`);
  return r.json();
}

async function signedIn(req: Request): Promise<boolean> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data, error } = await supabase.auth.getUser(token);
  return !error && Boolean(data.user);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!(await signedIn(req))) return json({ error: 'not_authenticated' }, 401);

  let body: { action?: string; title?: string; url?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid_body' }, 400); }

  try {
    if (body.action === 'search' && typeof body.title === 'string') {
      return json({ results: await findScores(body.title, fetchJson) });
    }
    if (body.action === 'fetch' && typeof body.url === 'string' && isAllowedFileUrl(body.url)) {
      const r = await fetch(body.url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) return json({ error: 'source_unavailable' }, 502);
      const declared = Number(r.headers.get('content-length') ?? 0);
      if (declared > MAX_SCORE_BYTES) return json({ error: 'too_large' }, 413);
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.byteLength > MAX_SCORE_BYTES) return json({ error: 'too_large' }, 413);
      return new Response(bytes, { headers: { ...cors, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' } });
    }
    return json({ error: 'invalid_request' }, 400);
  } catch (e) {
    console.error('score-search', e);
    return json({ error: 'source_unavailable' }, 502);
  }
});
