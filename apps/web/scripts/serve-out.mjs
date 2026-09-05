import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'out');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
};
const port = Number(process.argv[2] ?? 8740);

http
  .createServer((req, res) => {
    let path;
    try {
      path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    } catch {
      res.writeHead(400);
      res.end('bad request');
      return;
    }
    // Inside the export, only: a `..` in the URL is not a file to serve.
    let file = resolve(root, '.' + path);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) file = join(root, path + '.html');
    /*
     * A Windows export mis-names the segment prefetch files: Next builds
     * '__next.base.__PAGE__.txt' from a path.relative() result that carries a
     * backslash and only converts forward slashes, so the file lands in
     * '__next.base/__PAGE__.txt'. A Linux build — CI, and any hosted copy — is
     * right. This serves the nested file for the flat name so a local run has
     * a clean console.
     */
    if (!existsSync(file) && /__next\.[^/]+\.txt$/.test(path)) {
      const nested = path.replace(/__next\.([^/]+)\.([^/.]+)\.txt$/, '__next.$1/$2.txt');
      if (nested !== path && existsSync(join(root, nested))) file = join(root, nested);
    }
    if (!existsSync(file)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  })
  .listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://localhost:${port}`));
