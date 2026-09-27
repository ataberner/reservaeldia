// Local-only rendering of synthetic fixtures. No dotenv, Firebase or sender.
require("../../scripts/local/networkGuard.cjs");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const configPath = path.join(root, "tsconfig.emails.json");
const output = path.join(root, ".email-preview");
const compiled = path.join(output, "lib");
const formatHost = {
  getCanonicalFileName: file => file,
  getCurrentDirectory: () => root,
  getNewLine: () => "\n",
};
const report = diagnostics => console.error(ts.formatDiagnostics(diagnostics, formatHost));
let pages = new Map();
let ready = false;

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

async function renderPreviews() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(compiled + path.sep)) delete require.cache[key];
  }
  const { renderEmail } = require(path.join(compiled, "emails/renderEmail.js"));
  const { emailTemplates } = require(path.join(compiled, "emails/templateRegistry.js"));
  const nextPages = new Map();
  const links = [];
  const directory = path.join(output, "rendered");
  fs.mkdirSync(directory, { recursive: true });
  for (const [template, definition] of Object.entries(emailTemplates)) {
    const content = await renderEmail({ template, data: definition.previewData });
    for (const [extension, body] of [["html", content.html], ["txt", content.text]]) {
      const filename = `${template}.${extension}`;
      fs.writeFileSync(path.join(directory, filename), body);
      nextPages.set(`/${filename}`, { body, type: extension === "html" ? "text/html" : "text/plain" });
    }
    links.push(`<li><strong>${escapeHtml(template)}</strong> — ${escapeHtml(content.subject)} · <a href="/${template}.html">HTML</a> · <a href="/${template}.txt">Texto</a></li>`);
  }
  const index = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Emails · Reserva el Día</title></head><body style="font:16px/1.6 Arial,sans-serif;margin:32px;max-width:900px"><h1>Preview de emails</h1><p>Datos sintéticos. Editá las plantillas en src/emails/templates, guardá y recargá después de la compilación.</p><ul>${links.join("")}</ul></body></html>`;
  nextPages.set("/", { body: index, type: "text/html" });
  fs.writeFileSync(path.join(directory, "index.html"), index);
  pages = nextPages;
  ready = true;
  console.log(`Emails renderizados: ${Object.keys(emailTemplates).join(", ")}. Recargá el navegador.`);
}

async function build() {
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) { report([config.error]); process.exitCode = 1; return; }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  if (diagnostics.length) { report(diagnostics); process.exitCode = 1; return; }
  const emitted = program.emit();
  if (emitted.emitSkipped) { report(emitted.diagnostics); process.exitCode = 1; return; }
  await renderPreviews();
  console.log(`HTML y plain-text: ${path.join(output, "rendered")}`);
}

function dev() {
  let queue = Promise.resolve();
  const host = ts.createWatchCompilerHost(configPath, {}, ts.sys, ts.createSemanticDiagnosticsBuilderProgram,
    diagnostic => report([diagnostic]), () => {});
  host.afterProgramCreate = builder => {
    ready = false;
    const program = builder.getProgram();
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) { report(diagnostics); return; }
    const emitted = program.emit();
    if (emitted.emitSkipped) { report(emitted.diagnostics); return; }
    queue = queue.then(renderPreviews).catch(error => { ready = false; console.error(error); });
  };
  const watcher = ts.createWatchProgram(host);
  const server = http.createServer((request, response) => {
    const page = ready ? pages.get(request.url) : undefined;
    response.writeHead(page ? 200 : ready ? 404 : 503, {
      "Content-Type": `${page?.type || "text/plain"}; charset=utf-8`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https:; base-uri 'none'; form-action 'none'",
    });
    response.end(page?.body || (ready ? "Plantilla inexistente." : "Compilando o con errores. Revisá la terminal y recargá."));
  });
  server.on("error", error => { console.error(error); watcher.close(); process.exitCode = 1; });
  server.listen(3001, "127.0.0.1", () => console.log("Preview local: http://127.0.0.1:3001 (Ctrl+C para salir)"));
  const stop = () => { watcher.close(); server.close(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--build") build().catch(error => { console.error(error); process.exitCode = 1; });
else if (!args.length) dev();
else { console.error("Uso: node scripts/emailPreview.cjs [--build]"); process.exitCode = 1; }
