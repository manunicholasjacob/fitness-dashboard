import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /<repo>/, so the base path must match the
// repository name. Override with VITE_BASE_PATH when self-hosting at a root domain.
const base = process.env.VITE_BASE_PATH ?? '/fitness-dashboard/'

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
