import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'

/** The standalone markdown renderer: one script and one stylesheet, nothing else. */
export default defineConfig({
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    target: 'es2022',
    outDir: 'dist-preview',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL('./src/markdown/rendererEntry.ts', import.meta.url)),
      formats: ['iife'],
      name: 'MkDocsRendererBundle',
      fileName: () => 'mkdocs-renderer.js',
      cssFileName: 'mkdocs-renderer',
    },
    rollupOptions: {
      output: {
        comments: { legal: true },
      },
    },
  },
})
