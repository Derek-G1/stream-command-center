import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  root: path('./web'), publicDir: false, plugins: [preact(), tailwindcss()],
  build: { outDir: path('./dist'), emptyOutDir: true, target: ['chrome110','edge110','firefox115'], rollupOptions: { input: { app: path('./web/index.html'), chatOverlay: path('./web/chat-overlay/index.html') } } },
});
