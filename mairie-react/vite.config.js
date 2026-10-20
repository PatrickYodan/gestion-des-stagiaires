import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // accessible depuis le réseau local (téléphone, autres postes)
    port: 5173,
  },
})
