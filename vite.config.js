import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // PRD §15 — installable PWA that caches everything for offline play vs AI.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      filename: 'sw.js',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'BREACHPOINT — Tactical 3v3',
        short_name: 'BREACHPOINT',
        description:
          'Round-based 3v3 tactical FPS. Buy phase, combat phase, AI bots, playable fully offline.',
        theme_color: '#05070b',
        background_color: '#05070b',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: '/',
        scope: '/',
        categories: ['games', 'entertainment'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Rapier ships a ~1.5MB wasm bundle; raise the precache ceiling.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,wasm,glb,gltf,ktx2}'],
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /\.(?:glb|gltf|ktx2|bin)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'bp-models',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
          {
            urlPattern: /\.(?:mp3|ogg|wav|webm)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'bp-audio',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: false, passes: 2 },
    },
    chunkSizeWarningLimit: 2400,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
          physics: ['@react-three/rapier'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
  server: { host: true, port: 5173 },
  preview: { port: 4173 },
});
