const fs = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");

const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function failure(message, kind = "infrastructure") {
  return Object.assign(new Error(message), { kind });
}

// All launchers use this owner. POSIX process groups include grandchildren even
// if their parent exits; Windows taskkill is scoped to each still-owned tree.
class Processes {
  constructor() { this.owned = new Set(); }
  start(args, { cwd, env, log, stderrLog, name }) {
    const fd = log ? fs.openSync(log, "a") : undefined;
    let stderrFd;
    let child;
    try {
      stderrFd = stderrLog ? fs.openSync(stderrLog, "a") : undefined;
      // A nested tooling supervisor must remain inside its launcher's group so
      // interrupting the launcher also reaches synthetic grandchildren.
      const group = process.platform !== "win32" && !process.env.RESERVA_OWNED_PROCESS_GROUP;
      child = spawn(process.execPath, args, { cwd, env: { ...env, RESERVA_OWNED_PROCESS_GROUP: "1" }, windowsHide: true,
        detached: group, stdio: fd === undefined && stderrFd === undefined ? "inherit" : ["ignore", fd ?? "inherit", stderrFd ?? fd ?? "inherit"] });
      child.group = group;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (stderrFd !== undefined) fs.closeSync(stderrFd);
    }
    child.label = name;
    this.owned.add(child);
    child.completion = new Promise(resolve => {
      child.once("error", error => { child.done = true; resolve({ code: null, error: error.code }); });
      child.once("close", (code, signal) => { child.done = true; resolve({ code, signal }); });
    });
    return child;
  }
  async run(args, options) {
    const child = this.start(args, options);
    let timer;
    try {
      const result = await Promise.race([child.completion, new Promise((_, reject) => {
        timer = setTimeout(() => reject(failure(`${options.name}: tiempo máximo (${options.timeoutMs} ms)`)), options.timeoutMs);
      })]);
      if (result.code !== 0) throw Object.assign(failure(`${options.name}: código ${result.code}, señal ${result.signal || "ninguna"}${result.error ? `, ${result.error}` : ""}`,
        result.signal || result.error ? "infrastructure" : options.kind || "tests"), { exitCode: result.code, signal: result.signal });
      return result;
    } finally { clearTimeout(timer); }
  }
  async stop() {
    const entries = [...this.owned];
    const results = await Promise.allSettled(entries.map(async child => {
      if (!child.pid) return;
      if (process.platform === "win32") {
        if (!child.done) {
          const result = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { encoding: "utf8", windowsHide: true, timeout: 15000 });
          if (result.status !== 0 && !child.done) throw failure(`No se confirmó detención del árbol propio ${child.pid}`);
        }
      } else {
        const signal = name => { try { process.kill(child.group ? -child.pid : child.pid, name); } catch (e) { if (e.code !== "ESRCH") throw e; } };
        signal("SIGINT");
        await Promise.race([child.completion, pause(4000)]);
        signal("SIGKILL");
      }
      await Promise.race([child.completion, pause(5000).then(() => { if (!child.done) throw failure(`Proceso propio ${child.pid} no terminó`); })]);
      this.owned.delete(child);
    }));
    const errors = results.filter(r => r.status === "rejected");
    if (errors.length) throw failure(errors.map(r => r.reason.message).join("; "));
    return entries.map(child => ({ name: child.label, pid: child.pid, closed: !!child.done }));
  }
}
module.exports = { Processes, failure };
