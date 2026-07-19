import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,   // <-- allows any host, fine for local dev
    proxy: {
      '/backend': {
        target: 'http://localhost:5000',
        rewrite: (path) => path.replace(/^\/backend/, ''),
      },
    },
  },
})