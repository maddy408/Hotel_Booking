import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // First check standard frontend env, then fallback to backend/.env if present
  const frontendEnv = loadEnv(mode, __dirname, '')
  const backendEnv = loadEnv(mode, path.resolve(__dirname, '../backend'), '')
  const rawUrl = process.env.VITE_API_URL || frontendEnv.VITE_API_URL || backendEnv.APP_URL || backendEnv.VITE_API_URL || 'http://127.0.0.1:8099'
  const apiUrl = rawUrl.replace(/\/+$/, '')

  // Ensure VITE_API_URL is populated for Vite client
  process.env.VITE_API_URL = apiUrl

  return {
    plugins: [react()],
    server: {
      host: true, // Listen on all network addresses (0.0.0.0) including LAN IP
      port: 5173,
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
    },
  }
})
