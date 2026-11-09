/**
 * Public configuration. Only publishable values are allowed in the client
 * bundle; a service_role key here would be a critical leak and is rejected.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? '';

function looksLikeSecret(k: string): boolean {
  if (k.startsWith('sb_secret_')) return true;
  // Legacy JWT keys: refuse a service_role token.
  const parts = k.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/')));
      return payload?.role === 'service_role';
    } catch {
      return false;
    }
  }
  return false;
}

export const env = {
  supabaseUrl: url,
  supabaseKey: looksLikeSecret(key) ? '' : key,
  secretKeyRejected: looksLikeSecret(key),
  siteUrl: ((import.meta.env.VITE_SITE_URL as string | undefined) || window.location.origin).replace(/\/$/, ''),
  isConfigured: Boolean(url && key && !looksLikeSecret(key)),
};
