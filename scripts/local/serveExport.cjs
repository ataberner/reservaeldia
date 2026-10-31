const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const contract = require("../../shared/firebaseEnvironment.cjs");

function exportFile(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (!decoded.startsWith("/") || /[\\\0]/.test(decoded) || decoded.split("/").includes("..")) return null;
  const candidate = path.resolve(root, `.${decoded}`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  let file = candidate;
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.statSync(file).isFile()) return null;
    const real = fs.realpathSync(file);
    return real.startsWith(`${root}${path.sep}`) ? real : null;
  } catch { return null; }
}

function createExportServer(root) {
  const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
    ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".mp3": "audio/mpeg" };
  return http.createServer((request, response) => {
    response.setHeader("Content-Security-Policy", contract.localContentSecurityPolicy());
    response.setHeader("X-DNS-Prefetch-Control", "off");
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405).end(); return; }
    let file;
    try { file = exportFile(root, new URL(request.url, "http://localhost:3100").pathname); } catch { /* 404 */ }
    if (!file) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", contentTypes[path.extname(file)] || "application/octet-stream");
    if (request.method === "HEAD") { response.end(); return; }
    const stream = fs.createReadStream(file);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  });
}

function start() {
  require("./networkGuard.cjs");
  const session = process.env.RESERVA_LOCAL_SESSION;
  if (!session || process.argv.length !== 2 || fs.realpathSync(process.cwd()) !== fs.realpathSync(path.join(session, "workspace"))) throw new Error("An isolated launcher session is required");
  const marker = JSON.parse(fs.readFileSync(path.join(session, "session.json")));
  const build = JSON.parse(fs.readFileSync(path.join(session, "build-evidence.json")));
  if (marker.owner !== "reservaeldia-local" || marker.project !== contract.LOCAL_PROJECT || marker.stopped || build.target !== "demo") throw new Error("Only a current demo export can be served");
  if (contract.readClientEnvironment().mode !== "emulators") throw new Error("Demo configuration required");
  const { readLocalRelease } = require("../verifyNextStaticRelease.cjs");
  if (readLocalRelease().buildId !== build.buildId) throw new Error("Export changed after verification");
  const server = createExportServer(fs.realpathSync("out"));
  server.listen(3100, "127.0.0.1", () => console.log("Verified demo export: http://localhost:3100"));
  server.on("error", () => { console.error("Local export server failed"); process.exitCode = 1; });
}
if (require.main === module) start();
module.exports = { exportFile, createExportServer };
