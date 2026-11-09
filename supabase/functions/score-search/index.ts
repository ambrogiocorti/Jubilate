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

// MediaWiki asks API clients for a descriptive User-Agent with a contact URL.
const USER_AGENT = 'Jubilate/1.0 (https://ambrogiocorti.github.io/Jubilate/; parish songbook score search)';
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
  if (!r.ok) {
    const snippet = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    throw new Error(`cpdl_http_${r.status} server=${r.headers.get('server') ?? ''} body=${snippet}`);
  }
  const type = r.headers.get('content-type') ?? '';
  if (!type.includes('json')) throw new Error(`cpdl_not_json_${type}`);
  return r.json();
}

async function signedIn(req: Request): Promise<boolean> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  // Use the API key the app itself sent (publishable key), falling back to the
  // legacy anon key: works whether or not legacy keys are enabled.
  const apiKey = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, apiKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error) console.error('score-search auth', error.message);
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
    console.error('score-search', e instanceof Error ? e.message : e);
    return json({ error: 'source_unavailable', detail: e instanceof Error ? e.message.slice(0, 120) : undefined }, 502);
  }
});
