/// <reference types="vitest/config" />
import { copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Content-Security-Policy. GitHub Pages cannot send response headers, so the
 * policy is injected as a <meta> tag in the built index.html (frame-ancestors
 * and the other header-only protections cannot be set this way).
 */
function contentSecurityPolicy(supabaseUrl: string): string {
  let sb = 'https://*.supabase.co';
  let ws = 'wss://*.supabase.co';
  let insecure = false;
  try {
    const u = new URL(supabaseUrl);
    if (!u.hostname.endsWith('.supabase.co')) {
      sb = `${sb} ${u.origin}`;
      ws = `${ws} ${u.protocol === 'http:' ? 'ws:' : 'wss:'}//${u.host}`;
      insecure = u.protocol === 'http:';
    }
  } catch {
    /* no URL configured: keep the hosted defaults */
  }
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' 'sha256-tVxVYUo/Ao+fTnjIOgURM2BCOHMBLamrknKjjlSsI4c=' https://cdn.jsdelivr.net",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${sb} https://i.ytimg.com`,
    `media-src 'self' blob: ${sb}`,
    "font-src 'self' data:",
    `connect-src 'self' ${sb} ${ws} https://cdn.jsdelivr.net https://tessdata.projectnaptha.com`,
    'frame-src https://www.youtube-nocookie.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(insecure ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

/** GitHub Pages: serve the SPA for unknown paths and skip Jekyll. */
function githubPages(): Plugin {
  let outDir = 'dist';
  return {
    name: 'jubilate-github-pages',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'));
      writeFileSync(resolve(outDir, '.nojekyll'), '');
    },
  };
}

export default defineConfig(({ mode }) => {
  const vars = loadEnv(mode, process.cwd(), 'VITE_');
  // '/' by default; '/Jubilate/' when published at ambrogiocorti.github.io/Jubilate.
  const base = process.env.BASE_PATH || '/';
  return {
  base,
  plugins: [
    react(),
    githubPages(),
    {
      name: 'jubilate-csp',
      apply: 'build',
      transformIndexHtml: () => [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(vars.VITE_SUPABASE_URL ?? '') }, injectTo: 'head-prepend' },
      ],
    },
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Jubilate — La musica che unisce la comunità',
        short_name: 'Jubilate',
        description: 'Canti, accordi e spartiti per le celebrazioni della parrocchia.',
        lang: 'it',
        dir: 'ltr',
        id: base,
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#5c0a00',
        categories: ['music', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + static assets are precached; song data lives in IndexedDB.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        globIgnores: ['**/verovio*'],
        navigateFallback: `${base}index.html`,
        // The first installed worker takes control at once, so the app works
        // offline right after the first visit. Updates still wait for the user.
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/auth\/v1/, /^\/rest\/v1/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Score renderer (large WASM bundle) cached on first use.
            urlPattern: ({ url }) => url.pathname.includes('verovio'),
            handler: 'CacheFirst',
            options: { cacheName: 'jubilate-score-engine', expiration: { maxEntries: 4 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/_shared/**/*.test.ts'],
  },
  };
});
