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

/** Path the app is served under: '/' or e.g. '/Jubilate/' on GitHub Pages. */
export const basePath = import.meta.env.BASE_URL;

/** Absolute URL of a public file (icons etc.), honouring the base path. */
export function publicAsset(file: string): string {
  return `${basePath}${file.replace(/^\//, '')}`;
}

export const env = {
  supabaseUrl: url,
  supabaseKey: looksLikeSecret(key) ? '' : key,
  secretKeyRejected: looksLikeSecret(key),
  // Public origin + base path, without trailing slash; used for auth redirects
  // and share links.
  siteUrl: ((import.meta.env.VITE_SITE_URL as string | undefined) || window.location.origin + basePath).replace(/\/$/, ''),
  isConfigured: Boolean(url && key && !looksLikeSecret(key)),
};
