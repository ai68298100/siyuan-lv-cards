import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const routes = new Map([
  ['/', ['test-evidence/palette-2026-10-18/fixture.html', 'text/html; charset=utf-8']],
  ['/dist/index.css', ['dist/index.css', 'text/css']],
  ['/dist/chunks/dialogs.css', ['dist/chunks/dialogs.css', 'text/css']],
  ['/dist/chunks/dialogs.js', ['dist/chunks/dialogs.js', 'text/javascript']],
]);
http.createServer((req, res) => {
  const route = routes.get(new URL(req.url, 'http://127.0.0.1').pathname);
  if (!route) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', route[1]);
  res.setHeader('Cache-Control', 'no-store');
  res.end(readFileSync(resolve(root, route[0])));
}).listen(19067, '127.0.0.1', () => console.log('Palette production fixture: http://127.0.0.1:19067/'));
