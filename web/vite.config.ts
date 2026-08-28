import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// The app is served from the root on Cloudflare Pages, so that is the default.
//
// This used to default to '/fitness-dashboard/' for GitHub Pages, which was
// never actually used and made the wrong build the easy one to produce: a build
// without VITE_BASE_PATH set looks fine, deploys, and then every /assets/*
// request returns index.html because the paths point at a directory that does
// not exist. The CI guard catches it, but the default should not be the broken
// one. Set VITE_BASE_PATH=/<repo>/ if this is ever hosted under a subpath.
const base = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Offline-first caching is the right behaviour in production and a
      // liability while reviewing a local build: the worker keeps serving the
      // previous bundle, so a change appears not to have taken effect when it
      // has. VITE_PWA_DISABLE=1 builds without it.
      disable: process.env.VITE_PWA_DISABLE === '1',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Manu Fitness | Energy Deficit Mission Control',
        short_name: 'Mission',
        description: 'Cumulative calorie-deficit mission control.',
        theme_color: '#0b0f19',
        background_color: '#0b0f19',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Dashboard reads are cached so the app opens instantly and shows the
        // last known numbers when the phone is offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-reads',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
})
