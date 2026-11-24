import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'screenshot-wide.png',
          'screenshot-mobile.png',
          '.well-known/assetlinks.json',
        ],
        manifest: {
          id: '/',
          name: 'nderiskool | Deriv Forex Terminal',
          short_name: 'nderiskool',
          description:
            'Professional Forex & synthetic index trading platform for nderiskool, powered by real-time Deriv WebSocket connection, live candlestick charting, technical indicators, and execution terminal.',
          theme_color: '#080b11',
          background_color: '#080b11',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          categories: ['finance', 'business'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          screenshots: [
            {
              src: '/screenshot-wide.png',
              sizes: '1280x720',
              type: 'image/png',
              form_factor: 'wide',
              label: 'nderiskool Deriv Forex & Synthetics Terminal',
            },
            {
              src: '/screenshot-mobile.png',
              sizes: '540x960',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'nderiskool Mobile Trading & Cashier',
            },
          ],
          shortcuts: [
            {
              name: 'Manual Trade',
              short_name: 'Trade',
              description: 'Open manual Forex & synthetic order execution',
              url: '/?view=terminal',
              icons: [{src: '/pwa-192x192.png', sizes: '192x192'}],
            },
            {
              name: 'Deriv Cashier',
              short_name: 'Cashier',
              description: 'Deposit or withdraw directly with Deriv Real Account',
              url: '/?view=cashier',
              icons: [{src: '/pwa-192x192.png', sizes: '192x192'}],
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          navigateFallbackDenylist: [/^\/\.well-known\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
