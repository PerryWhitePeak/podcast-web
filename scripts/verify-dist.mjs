import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const root = resolve(process.cwd(), 'dist')
const rawBase = process.env.VITE_BASE_PATH || '/'
const segment = rawBase.replace(/^\/+|\/+$/g, '')
const base = segment ? `/${segment}/` : '/'
const failures = []

function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const next = join(path, entry.name)
    return entry.isDirectory() ? walk(next) : [next]
  })
}

for (const required of ['index.html', '404.html', '.nojekyll']) {
  if (!existsSync(join(root, required))) failures.push(`missing ${required}`)
}

const index = readFileSync(join(root, 'index.html'), 'utf8')
const fallback = readFileSync(join(root, '404.html'), 'utf8')
if (index !== fallback) failures.push('404.html is not the executable SPA entry document')

for (const match of index.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const value = match[1]
  if (/^(?:https?:|#|data:)/.test(value)) continue
  if (!value.startsWith(base)) failures.push(`entry asset is outside configured base: ${value}`)
  const relative = value.slice(base.length).split(/[?#]/, 1)[0]
  if (relative && !existsSync(join(root, relative))) failures.push(`entry asset is missing: ${value}`)
}

const files = walk(root)
for (const path of files) {
  const extension = extname(path).toLowerCase()
  if (['.m4a', '.mp3', '.wav', '.mp4', '.mov'].includes(extension)) failures.push(`large media must not be published: ${path}`)
  if (!['.html', '.js', '.css', '.json', '.svg', '.txt'].includes(extension) && extension !== '') continue
  const value = readFileSync(path, 'utf8')
  if (/[A-Za-z]:\\|\/Users\/|\/home\//.test(value)) failures.push(`local absolute path found in ${path}`)
  if (/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(value)) failures.push(`private key found in ${path}`)
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(value)) failures.push(`API-key-like token found in ${path}`)
}

const total = files.reduce((sum, path) => sum + statSync(path).size, 0)
const digest = createHash('sha256').update(index).digest('hex')
if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(`Verified ${files.length} files (${total} bytes), base ${base}, index sha256 ${digest}\n`)
