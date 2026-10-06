import type { ServerResponse } from 'node:http'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Backend dev server for `npm run dev` (not used with `--mode mock`). Override in `.env.local`: API_PROXY_TARGET=http://localhost:8080
  const target = loadEnv(mode, process.cwd(), '').API_PROXY_TARGET || 'http://localhost:8000'
  let warned = false

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          configure: (proxy) => {
            // Backend not running: answer 503 (problem+json) so the app can say "cannot reach the server", and say how to fix it once
            proxy.on('error', (err, _req, res) => {
              if (!warned) {
                warned = true
                console.warn(`\n[aquaguard] No backend at ${target} (${(err as NodeJS.ErrnoException).code ?? err.message}).\n  Start the backend, set API_PROXY_TARGET in .env.local, or run \`npm run dev:mock\` to use the mock API.\n`)
              }
              const response = res as ServerResponse
              if ('writeHead' in response && !response.headersSent) {
                response.writeHead(503, { 'Content-Type': 'application/problem+json' })
                response.end(JSON.stringify({ title: 'Backend not reachable', status: 503, code: 'backend_unreachable' }))
              }
            })
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      // Full-page renders with MSW are slow when files run in parallel
      testTimeout: 15_000,
    },
  }
})
