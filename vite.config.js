import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    base: '/cam-flow/',
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                // Explicit rather than relying on Workbox's default extension list,
                // which doesn't cover .wasm/.task -- without these the mediapipe
                // assets would silently be left out of the precache.
                globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,task}'],
                // The mediapipe wasm binaries (~11MB each) are well over Workbox's
                // default 2MB precache limit -- without raising this they'd
                // silently get skipped and the app would fall back to fetching
                // them from the network (defeating the point of precaching).
                maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
            },
            manifest: {
                name: 'Cam Flow',
                short_name: 'Cam Flow',
                description: 'Camera-driven fluid and ripple effects controlled by hand tracking',
                start_url: '/cam-flow/',
                scope: '/cam-flow/',
                display: 'standalone',
                background_color: '#08141a',
                theme_color: '#08141a',
                icons: [
                    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
        }),
    ],
});