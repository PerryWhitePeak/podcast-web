import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'

const root = process.cwd()
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules', 'playwright-report', 'test-results', '.stage6f_runtime'])
const forbiddenExtensions = new Set(['.db', '.key', '.m4a', '.mp3', '.pem', '.sqlite', '.sqlite3', '.wav'])
const permittedEnvFiles = new Set(['.env.example', '.env.pages-test'])
const expectedTranscriptHash = '9e85ab9867fa38df5684d4c47c8fed22377ccba32655e78b1d6ce23bc14fdedf'
const failures = []

function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && (ignoredDirectories.has(entry.name) || (entry.name === 'artifacts' && basename(path) === 'e2e'))) return []
    const next = join(path, entry.name)
    return entry.isDirectory() ? walk(next) : [next]
  })
}

const files = walk(root)
for (const path of files) {
  const name = basename(path)
  const display = relative(root, path).replaceAll('\\', '/')
  const extension = extname(name).toLowerCase()
  if (name.startsWith('.env') && !permittedEnvFiles.has(name)) failures.push(`private environment file: ${display}`)
  if (forbiddenExtensions.has(extension)) failures.push(`forbidden data/key/media file: ${display}`)
  if (/^(?:id_rsa|id_ed25519)$/i.test(name)) failures.push(`private key filename: ${display}`)
  if (['.png', '.zip'].includes(extension)) continue
  const value = readFileSync(path, 'utf8')
  if (/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(value)) failures.push(`private key content: ${display}`)
  if (/\b(?:sk|dsk)-[A-Za-z0-9_-]{20,}\b/.test(value)) failures.push(`API-key-like token: ${display}`)
  if (/\bgh[opurs]_[A-Za-z0-9]{30,}\b/.test(value)) failures.push(`GitHub-token-like value: ${display}`)
  if (/\b(?:SMTP_PASSWORD|DATABASE_URL|DEEPSEEK_API_KEY)\s*=\s*\S+/i.test(value)) failures.push(`secret assignment: ${display}`)
}

const transcript = resolve(root, 'content/完整逐字稿github.md')
const transcriptHash = createHash('sha256').update(readFileSync(transcript)).digest('hex')
if (transcriptHash !== expectedTranscriptHash) failures.push(`public transcript copy hash mismatch: ${transcriptHash}`)

if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(`Public-source audit passed for ${files.length} files; transcript sha256 ${transcriptHash}\n`)
