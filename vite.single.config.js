import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Builds ONE self-contained html file (data is injected afterwards by scripts/make_preview.mjs)
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  publicDir: false,
  build: { outDir: 'dist-preview', emptyOutDir: true },
})
