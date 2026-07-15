import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/backend': 'http://localhost:5000', 
    },
  },
})
// tells vite that an y request that have a 
// url with /api go to local host 5000 since 
// flask runs on port 5000 while vite runs on 5173