import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    port: Number(process.env.PORT) || 5196,
    // the screenshot helper keeps a browser profile in .cache — don't reload on its writes
    watch: { ignored: ['**/.cache/**'] },
  },
})
