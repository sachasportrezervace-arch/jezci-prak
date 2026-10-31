// Jednoduchý statický server pro lokální test: node tools/serve.cjs [port]
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), port = +process.argv[2] || 8793;
const T = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end("404"); } res.writeHead(200, { "Content-Type": T[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" }); res.end(d); });
}).listen(port, "127.0.0.1", () => console.log("http://127.0.0.1:" + port + "/"));
