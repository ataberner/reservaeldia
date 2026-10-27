const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");

// Only callers holding a receipt from this process can request automatic cleanup.
// Nothing enumerates or adopts historical sessions.
const receipts = new WeakMap();
const PRESERVE_SESSION = ".preserve-local-session";
const regenerable = new Set(["node_modules", ".local-isolation", ".next", "out", "artifacts", "coverage", "build", "dist", ".cache", ".turbo", ".hosting-static-history", ".email-preview", "next-env.d.ts"]);
const relative = (parent, child) => path.relative(parent, child);
const inside = (parent, child) => {
  const value = relative(parent, child);
  return value === "" || (!path.isAbsolute(value) && value !== ".." && !value.startsWith(`..${path.sep}`));
};

function assertNoLinkedAncestors(target) {
  for (let current = path.resolve(target); ; current = path.dirname(current)) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Enlace/junction protegido: ${current}`);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (path.dirname(current) === current) return;
  }
}

function assertSafeSessionTarget(root, target) {
  root = path.resolve(root);
  target = path.resolve(target);
  const base = path.join(root, ".local-isolation");
  if (path.dirname(target) !== base || !/^(session|prepared|ownership)-[^\\/]+$/.test(path.basename(target))) {
    throw new Error("Limpieza rechazada: no es un directorio de sesión directo del repositorio.");
  }
  assertNoLinkedAncestors(target);
  if (!fs.lstatSync(target).isDirectory()) throw new Error("Limpieza rechazada: la sesión no es un directorio.");
  // Avoid personal Git configuration and inherited GIT_DIR/GIT_WORK_TREE overrides.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC)$/i.test(key)));
  let checkout = root;
  while (!fs.existsSync(path.join(checkout, ".git")) && path.dirname(checkout) !== checkout) checkout = path.dirname(checkout);
  // This one read-only command trusts only the enclosing checkout selected by
  // the caller, also when its OS owner differs from the sandbox account.
  const result = spawnSync("git", ["-c", `safe.directory=${checkout}`, "-c", "core.fsmonitor=false", "-C", root, "worktree", "list", "--porcelain", "-z"], {
    encoding: "utf8", windowsHide: true, timeout: 10000, env,
  });
  if (result.status !== 0) throw new Error("Limpieza retenida: no se pudieron comprobar los worktrees registrados.");
  for (const field of result.stdout.split("\0")) {
    if (!field.startsWith("worktree ")) continue;
    const worktree = path.resolve(field.slice(9));
    // The enclosing normal checkout is expected. Worktrees in the isolation
    // directory, including ones whose .git marker vanished, must be preserved.
    if (inside(base, worktree) && (inside(target, worktree) || inside(worktree, target))) {
      throw new Error(`Worktree registrado protegido: ${worktree}`);
    }
  }
  return target;
}

function fingerprint(file) {
  // The original checkout can change while a session runs. Do not follow a
  // source parent replaced by a junction when comparing the retained snapshot.
  assertNoLinkedAncestors(path.dirname(file));
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (stat.isSymbolicLink()) return `link:${fs.readlinkSync(file)}`;
  if (!stat.isFile()) return "directory";
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function sourceSnapshot(workspace, generatedFiles = new Set()) {
  const files = new Map();
  if (!fs.existsSync(workspace)) return files;
  assertNoLinkedAncestors(workspace);
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      const name = relative(workspace, file).split(path.sep).join("/");
      if (generatedFiles.has(name) || regenerable.has(entry.name) || entry.name.startsWith(".next-dev") ||
        /^(functions|functions-payments|functions-email)\/lib(\/|$)/.test(name) ||
        /^functions-(payments|email)\/shared(\/|$)/.test(name) ||
        /\.(log|tsbuildinfo)$/.test(name)) continue;
      if (entry.isDirectory() && !fs.lstatSync(file).isSymbolicLink()) visit(file);
      else files.set(name, fingerprint(file));
    }
  }
  visit(workspace);
  return files;
}

function registerSession(session, { root, workspace = path.join(session, "workspace"), generatedFiles = [] }) {
  session = assertSafeSessionTarget(root, session);
  root = path.resolve(root);
  workspace = path.resolve(workspace);
  if (!inside(session, workspace)) throw new Error("Workspace fuera de la sesión propia.");
  // Only callers with an existing canonical source/copy map opt into exact
  // generated-file exclusions. Canonical sources remain protected by hashes.
  const generated = new Set(generatedFiles.map(name => {
    if (path.isAbsolute(name) || !inside(workspace, path.resolve(workspace, name))) throw new Error("Copia generada fuera del workspace");
    return name.split(path.sep).join("/");
  }));
  const sources = sourceSnapshot(workspace, generated);
  // The launcher writes synthetic .env.local in the copy. Never open a personal
  // configuration counterpart in the original just to fingerprint it.
  const originals = new Map([...sources.keys()]
    .filter(name => !name.split("/").some(part => part.startsWith(".env") || part.startsWith(".secret") || part === ".runtimeconfig.json" || part === "firebase-key.json" || part.endsWith(".pem")))
    .map(name => [name, fingerprint(path.join(root, name))]));
  const stat = fs.lstatSync(session);
  const receipt = Object.freeze({ session, workspace });
  receipts.set(receipt, { root, sources, originals, generated, dev: stat.dev, ino: stat.ino, pid: process.pid });
  return receipt;
}

function assertNoGitTree(directory, { ignoreMarkerAt, topDirectory = directory } = {}) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.toLowerCase() === ".git") throw new Error(`Metadatos Git protegidos: ${path.join(directory, entry.name)}`);
    if (entry.name === PRESERVE_SESSION && directory !== ignoreMarkerAt) throw new Error(`Sesión anidada conservada: ${directory}`);
    const file = path.join(directory, entry.name);
    const stat = fs.lstatSync(file);
    const managedDirectory = /^(session|ownership|prepared)-/.test(path.basename(directory));
    if (managedDirectory && ["session.json", "prepared.json"].includes(entry.name) && stat.isFile() && !stat.isSymbolicLink()) {
      const marker = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Number.isInteger(marker.pid) && marker.pid > 0 && marker.pid !== process.pid) {
        let active = true;
        try { process.kill(marker.pid, 0); } catch (error) { if (error.code === "ESRCH") active = false; }
        if (active) throw new Error(`Sesión con proceso activo protegida: ${file}`);
      }
      if (marker.owner === "reservaeldia-local" && directory !== topDirectory) {
        throw new Error(`Sesión anidada pendiente de limpieza: ${directory}`);
      }
    }
    if (stat.isDirectory() && !stat.isSymbolicLink()) assertNoGitTree(file, { ignoreMarkerAt, topDirectory });
  }
}

function removeWithoutFollowingLinks(target) {
  // A direct child deletion must also reject a parent replaced by a junction.
  assertNoLinkedAncestors(path.dirname(target));
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fs.unlinkSync(target);
    return;
  }
  // Recheck ancestors before opening each directory, including on Windows.
  assertNoLinkedAncestors(target);
  for (const name of fs.readdirSync(target)) removeWithoutFollowingLinks(path.join(target, name));
  fs.rmdirSync(target);
}

function cleanupSession(receipt, { stopped, evidenceDirectory } = {}) {
  const state = receipt && receipts.get(receipt);
  const retained = reason => {
    // An outer prepared/negative workspace must not discard a retained child.
    // Mark only a newly owned directory whose identity and boundary still match.
    if (state && state.pid === process.pid) {
      try {
        assertSafeSessionTarget(state.root, receipt.session);
        const stat = fs.lstatSync(receipt.session);
        if (stat.dev === state.dev && stat.ino === state.ino) {
          fs.writeFileSync(path.join(receipt.session, PRESERVE_SESSION), `${reason}\n`, { flag: "wx" });
        }
      } catch { /* Never write through a replaced path or overwrite a marker/link. */ }
    }
    return { status: "retained", reason };
  };
  if (!state || state.pid !== process.pid) return retained("No hay recibo de propiedad de esta ejecución; no se limpian sesiones históricas.");
  if (stopped !== true) return retained("No se confirmó la detención de los procesos propios.");
  try {
    const session = assertSafeSessionTarget(state.root, receipt.session);
    const stat = fs.lstatSync(session);
    if (stat.dev !== state.dev || stat.ino !== state.ino) throw new Error("El directorio de sesión fue reemplazado.");
    if (!evidenceDirectory || inside(session, path.resolve(evidenceDirectory))) throw new Error("Falta evidencia conservada fuera de la sesión.");
    assertNoLinkedAncestors(evidenceDirectory);
    if (!fs.lstatSync(evidenceDirectory).isDirectory() || !fs.readdirSync(evidenceDirectory).length) {
      throw new Error("El directorio de evidencia está vacío o no es válido.");
    }
    const current = sourceSnapshot(receipt.workspace, state.generated);
    if (current.size !== state.sources.size || [...state.sources].some(([name, hash]) => current.get(name) !== hash)) {
      return retained("Hay cambios de fuentes sin integrar en la copia de trabajo.");
    }
    for (const [name, hash] of state.originals) {
      if (fingerprint(path.join(state.root, name)) !== hash) return retained(`La fuente original cambió; se conserva su snapshot: ${name}`);
    }
    // Preflight before the first deletion, including outputs normally excluded
    // from source hashes. Neither this scan nor deletion follows junctions.
    assertNoGitTree(session, { ignoreMarkerAt: session });
    removeWithoutFollowingLinks(session);
    receipts.delete(receipt);
    return { status: "removed" };
  } catch (error) {
    return retained(error.message);
  }
}

module.exports = { registerSession, cleanupSession, assertSafeSessionTarget, assertNoLinkedAncestors, assertNoGitTree, removeWithoutFollowingLinks, PRESERVE_SESSION };
