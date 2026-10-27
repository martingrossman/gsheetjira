import http from 'node:http';
import { readFile } from 'node:fs/promises';
const file = new URL('../dist/index.html', import.meta.url);
const port = Number(process.env.PORT || 4173);
http.createServer(async (req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (!['/', '/index.html'].includes(req.url.split('?')[0])) { res.writeHead(404); res.end('Not found'); return; }
  try { const html = await readFile(file); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); }
  catch { res.writeHead(500); res.end('Run npm run build first.'); }
}).listen(port, '127.0.0.1', () => console.log(`SheetFlow preview: http://127.0.0.1:${port}`));
