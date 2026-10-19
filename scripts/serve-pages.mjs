import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

const root = resolve(process.cwd(), 'dist')
const port = Number(process.env.PORT || 4173)
const rawBase = process.env.BASE_PATH || '/podcast-web/'
const segment = rawBase.replace(/^\/+|\/+$/g, '')
const base = segment ? `/${segment}/` : '/'
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

function sendFile(response, path, status = 200) {
  response.writeHead(status, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
  response.end(readFileSync(path))
}

createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
  if (!(url.pathname === base.slice(0, -1) || url.pathname.startsWith(base))) {
    sendFile(response, resolve(root, '404.html'), 404)
    return
  }
  const relative = decodeURIComponent(url.pathname.slice(base.length)).replace(/^\/+/, '')
  const candidate = resolve(root, relative || 'index.html')
  if (!candidate.startsWith(`${root}${sep}`) && candidate !== resolve(root, 'index.html')) {
    response.writeHead(400).end('Bad request')
    return
  }
  const file = existsSync(candidate) && statSync(candidate).isFile() ? candidate : null
  sendFile(response, file || resolve(root, '404.html'), file ? 200 : 404)
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`GitHub Pages test server: http://127.0.0.1:${port}${base}\n`)
})
