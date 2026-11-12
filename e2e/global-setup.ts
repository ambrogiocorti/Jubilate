import { localStack, sql, PASSWORD, USERS } from './env';

/** Creates the test accounts on the local stack (idempotent) and resets test data. */
export default async function globalSetup() {
  const { url, secret } = localStack();
  const headers = { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
  const names: Record<string, string> = { admin: 'Amministratore Prova', user: 'Musicista Prova', director: 'Direttore Prova', participant: 'Partecipante Prova' };
  for (const [key, email] of Object.entries(USERS)) {
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: names[key] } }),
    });
    if (!res.ok && res.status !== 422) throw new Error(`create ${email}: ${res.status} ${await res.text()}`);
  }
  sql(`
    -- Reset state created by previous runs (test accounts only).
    delete from public.rooms where director_id in (select id from auth.users where email like '%@jubilate.test');
    delete from public.contribution_requests where author_id in (select id from auth.users where email like '%@jubilate.test');
    delete from public.director_requests where user_id in (select id from auth.users where email like '%@jubilate.test');
    delete from public.personal_arrangements where owner_id in (select id from auth.users where email like '%@jubilate.test');
    delete from public.music_scores where owner_id in (select id from auth.users where email like '%@jubilate.test');
    delete from public.rate_limit_events where user_id in (select id from auth.users where email like '%@jubilate.test');
    update public.user_roles set revoked_at = now() where revoked_at is null and user_id in (select id from auth.users where email like '%@jubilate.test');
    insert into public.user_roles (user_id, role) select id, 'admin' from auth.users where email = '${USERS.admin}';
    update public.profiles set display_name = 'Amministratore Prova' where id = (select id from auth.users where email = '${USERS.admin}');
  `);
}
