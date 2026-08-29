import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  test: {
    environment: 'happy-dom',
    include: ['js/__tests__/**/*.test.js'],
  },
})
