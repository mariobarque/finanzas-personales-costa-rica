"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 8080);
const mime = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".md": "text/plain; charset=utf-8"};
const server = http.createServer((request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, {"Allow": "GET, HEAD"}); response.end(); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = path.resolve(root, "." + pathname);
    if (target !== root && !target.startsWith(root + path.sep)) {
      response.writeHead(403); response.end("Fuera del sitio"); return;
    }
    const file = fs.existsSync(target) && fs.statSync(target).isDirectory() ? path.join(target, "index.html") : target;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404); response.end("No encontrado"); return;
    }
    response.writeHead(200, {"Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"});
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(file).pipe(response);
  } catch {
    response.writeHead(400); response.end("Solicitud invalida");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Sitio local: http://127.0.0.1:${port}`));
