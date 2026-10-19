import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = fileURLToPath(new URL('.', import.meta.url))
const publicTranscriptPath = resolve(frontendRoot, 'content/完整逐字稿github.md')
const canonicalTranscriptPath = resolve(frontendRoot, '../参考文献/完整逐字稿github.md')
const transcriptPath = existsSync(publicTranscriptPath) ? publicTranscriptPath : canonicalTranscriptPath
const transcriptMarkdown = readFileSync(transcriptPath, 'utf8')

function normalizeBase(value: string | undefined): string {
  const raw = (value || '/').trim()
  if (/[:?#]/.test(raw) || raw.includes('..')) throw new Error('VITE_BASE_PATH must be a URL path such as / or /podcast-web/.')
  const segment = raw.replace(/^\/+|\/+$/g, '')
  return segment ? `/${segment}/` : '/'
}

function validatePublicApi(env: Record<string, string>): void {
  const value = env.VITE_API_BASE_URL?.trim()
  if (env.VITE_PUBLIC_DEPLOYMENT !== 'github-pages' || !value) return
  let url: URL
  try { url = new URL(value) }
  catch { throw new Error('VITE_API_BASE_URL must be an absolute HTTPS URL for GitHub Pages.') }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('VITE_API_BASE_URL must use HTTPS and must not contain credentials.')
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = normalizeBase(env.VITE_BASE_PATH)
  validatePublicApi(env)
  return {
    base,
    plugins: [
      react(),
      {
        name: 'github-pages-spa-fallback',
        apply: 'build',
        closeBundle() {
          // GitHub Pages serves this document for unknown paths. Because Vite
          // emits base-prefixed asset URLs, loading /<base>/agent directly will
          // execute the same application while preserving that route in the URL.
          copyFileSync(resolve(frontendRoot, 'dist/index.html'), resolve(frontendRoot, 'dist/404.html'))
        },
      },
    ],
    define: {
      __TRANSCRIPT_MARKDOWN__: JSON.stringify(transcriptMarkdown),
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/docs': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/openapi.json': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
