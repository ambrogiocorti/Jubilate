import { execSync } from 'node:child_process';

/** Reads the local stack's URL and keys from the Supabase CLI (nothing is hard-coded). */
let cached: { url: string; publishable: string; secret: string } | null = null;
export function localStack() {
  if (cached) return cached;
  const out = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const j = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>;
  cached = { url: j.API_URL!, publishable: j.PUBLISHABLE_KEY!, secret: j.SECRET_KEY! };
  return cached;
}

export function sql(statement: string): string {
  return execSync(`docker exec -i supabase_db_jubilate psql -U postgres -d postgres -At -v ON_ERROR_STOP=1`, {
    input: statement,
    encoding: 'utf8',
  }).trim();
}

export const PASSWORD = 'Prova1234!';
export const USERS = {
  admin: 'admin@jubilate.test',
  user: 'musicista@jubilate.test',
  director: 'direttore@jubilate.test',
  participant: 'partecipante@jubilate.test',
} as const;
