import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: __dirname,
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true, // Enable PWA in development to resolve 'virtual:pwa-register'
      },
      workbox: {
        // Cache all JS, CSS, HTML, and images/fonts/data
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,geojson,json,woff,woff2}'],
        // Exclude large map tiles if they were local, but allow API caching
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*?\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-map-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-storage',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          }
        ],
      },
      manifest: {
        name: 'AFAT Traffic Intelligence',
        short_name: 'AFAT',
        description: 'World-Class Traffic Intelligence Platform for Commuters & Operators.',
        theme_color: '#0f172a', // slate-950
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'hero-map.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'operator-hero.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'operator-hero.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
});
