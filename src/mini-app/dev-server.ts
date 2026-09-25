import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.env.CARRY_ONE_MINI_APP_ROOT ?? join(process.cwd(), "web"));
const port = Number(process.env.CARRY_ONE_MINI_APP_PORT ?? 4173);
const mime: Record<string, string> = { ".woff2": "font/woff2", ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

function safePath(pathname: string): string | null {
  const decoded = decodeURIComponent(pathname.split("?")[0]);
  const candidate = resolve(root, `.${normalize(decoded)}`);
  return candidate === root || candidate.startsWith(`${root}/`) ? candidate : null;
}

const server = createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, { Allow: "GET, HEAD" }).end(); return; }
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  let file = safePath(pathname);
  if (!file) { res.writeHead(400).end("Bad path"); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file) || !statSync(file).isFile()) file = join(root, "index.html");
  res.writeHead(200, {
    "Content-Type": mime[extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' http: https:; frame-ancestors 'self' nimiqpay:; base-uri 'self'; form-action 'self'",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`Carry One Mini App skeleton: http://localhost:${port}`);
  console.log("Use ?demo=1 for the explicit local state-machine demo. Real mode fails closed when the backend/provider is unavailable.");
});
