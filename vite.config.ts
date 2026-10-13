import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages serves the site from /motion-3d-lab/; routes are hash-based so only assets need the prefix
  base: process.env.GITHUB_PAGES ? '/motion-3d-lab/' : '/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    port: Number(process.env.PORT) || 5196,
    // the screenshot helper keeps a browser profile in .cache — don't reload on its writes
    watch: { ignored: ['**/.cache/**'] },
  },
})
