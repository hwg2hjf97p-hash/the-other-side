// The Other Side — local preview server (no dependencies)
// Serves dist/ at http://localhost:3000 and saves topic requests to requests.json.
//
// Usage:  npm run dev   (builds first, then runs this)

import http from "http";
import fs from "fs";
import path from "path";

const PORT = Number(process.env.PORT) || 3000;
const DIST = path.join(process.cwd(), "dist");
const REQUESTS = path.join(process.cwd(), "requests.json");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    // Topic requests: same form-encoded POST that Netlify Forms accepts in production
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const form = new URLSearchParams(body);
        const topic = (form.get("topic") || "").trim().slice(0, 200);
        if (form.get("form-name") === "topic-request" && topic && !form.get("bot-field")) {
          const list = fs.existsSync(REQUESTS) ? JSON.parse(fs.readFileSync(REQUESTS, "utf8")) : [];
          list.push({ topic, requested_at: new Date().toISOString() });
          fs.writeFileSync(REQUESTS, JSON.stringify(list, null, 2));
          console.log(`Topic requested: ${topic}`);
        }
        res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
      });
      return;
    }

    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.normalize(path.join(DIST, urlPath));
    if (!file.startsWith(DIST)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");

    if (!fs.existsSync(file)) {
      res.writeHead(404, { "Content-Type": TYPES[".html"] });
      return fs.createReadStream(path.join(DIST, "404.html")).pipe(res);
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`The Other Side running at http://localhost:${PORT}  (Ctrl+C to stop)`));
