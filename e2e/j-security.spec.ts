import { test, expect } from '@playwright/test';
import { localStack, USERS, PASSWORD } from './env';

/** Direct backend requests with a normal user's token, bypassing the UI. */
test('J — un utente normale non può modificare l’ufficiale né diventare amministratore', async () => {
  const { url, publishable } = localStack();
  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishable, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USERS.user, password: PASSWORD }),
  });
  expect(login.ok).toBe(true);
  const { access_token, user } = (await login.json()) as { access_token: string; user: { id: string } };
  const h = { apikey: publishable, Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

  const songs = await (await fetch(`${url}/rest/v1/songs?select=id,title,current_revision_id&number=eq.901`, { headers: h })).json() as { id: string; title: string; current_revision_id: string }[];
  const song = songs[0]!;

  // 1. Update the official song row directly.
  const upd = await fetch(`${url}/rest/v1/songs?id=eq.${song.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ title: 'Manomesso' }) });
  expect([401, 403]).toContain(upd.status);
  // 2. Insert a new official revision.
  const rev = await fetch(`${url}/rest/v1/song_revisions`, { method: 'POST', headers: h, body: JSON.stringify({ song_id: song.id, revision_number: 999, sequence: [] }) });
  expect([401, 403]).toContain(rev.status);
  // 3. Call the admin RPC.
  const save = await fetch(`${url}/rest/v1/rpc/admin_save_song`, { method: 'POST', headers: h, body: JSON.stringify({ p_song_id: song.id, p_meta: { title: 'Manomesso' } }) });
  expect(save.ok).toBe(false);
  // 4. Grant itself the admin role (table and RPC).
  const role = await fetch(`${url}/rest/v1/user_roles`, { method: 'POST', headers: h, body: JSON.stringify({ user_id: user.id, role: 'admin' }) });
  expect([401, 403]).toContain(role.status);
  const rpc = await fetch(`${url}/rest/v1/rpc/admin_set_role`, { method: 'POST', headers: h, body: JSON.stringify({ p_user_id: user.id, p_role: 'admin', p_grant: true }) });
  expect(rpc.ok).toBe(false);
  // 5. Metadata the user controls must not grant roles.
  await fetch(`${url}/auth/v1/user`, { method: 'PUT', headers: h, body: JSON.stringify({ data: { role: 'admin', roles: ['admin'] } }) });
  const roles = await (await fetch(`${url}/rest/v1/rpc/my_roles`, { method: 'POST', headers: h, body: '{}' })).json();
  expect(roles).toEqual([]);

  // Nothing changed.
  const after = await (await fetch(`${url}/rest/v1/songs?select=title,current_revision_id&id=eq.${song.id}`, { headers: h })).json() as { title: string; current_revision_id: string }[];
  expect(after[0]).toEqual({ title: song.title, current_revision_id: song.current_revision_id });
});
