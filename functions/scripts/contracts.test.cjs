const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { copyWorkspace, cleanEnvironment } = require("../../scripts/local/session.cjs");
const { Processes } = require("../../scripts/local/processes.cjs");

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
test("contract CLI diagnostics preserve JSON, exit codes and read-only behavior", async t => {
  const root = path.resolve(__dirname, "../..");
  const base = path.join(root, ".local-isolation");
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, "contracts-diagnostic-"));
  const syncFile = path.join(directory, "functions/scripts/syncTemplateContract.cjs");
  fs.mkdirSync(path.dirname(syncFile), { recursive: true });
  fs.copyFileSync(path.join(__dirname, "syncTemplateContract.cjs"), syncFile);
  const { artifacts, checkTemplateContract: check } = require(syncFile);
  const files = artifacts.flatMap(a => [a.sourcePath, ...a.targetPaths]);
  const reset = () => {
    for (const file of files) {
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) fs.rmdirSync(file);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "synthetic contract\n");
    }
  };
  const snapshot = () => files.map(file => {
    if (!fs.existsSync(file)) return null;
    const stat = fs.statSync(file);
    return { file, mtime: stat.mtimeMs, bytes: stat.isFile() ? fs.readFileSync(file).toString("hex") : null };
  });
  const artifact = artifacts[0];
  const cases = [
    ["equal", () => {}, null],
    ["different input", () => fs.appendFileSync(artifact.targetPaths[0], "stale"), /Copia desactualizada/],
    ["different build", () => fs.writeFileSync(artifact.targetPaths[1], "different"), /Copia desactualizada/],
    ["missing input", () => fs.unlinkSync(artifact.targetPaths[0]), /La copia no existe/],
    ["missing build", () => fs.unlinkSync(artifact.targetPaths[1]), /La copia no existe/],
    ["missing source", () => fs.unlinkSync(artifact.sourcePath), /Restaurá la fuente/],
    ["unreadable input", () => { fs.unlinkSync(artifact.targetPaths[0]); fs.mkdirSync(artifact.targetPaths[0]); }, /No se pudo leer la copia/],
    ["unreadable source", () => { fs.unlinkSync(artifact.sourcePath); fs.mkdirSync(artifact.sourcePath); }, /no se pudo leer/],
  ];
  for (const scope of ["input", "all"]) for (const [name, mutate, diagnostic] of cases) {
    await t.test(`${scope}: ${name}`, () => {
      reset(); mutate();
      const before = snapshot(), expected = check(scope);
      const args = [syncFile, "--check", ...(scope === "input" ? ["--input"] : [])];
      // This CLI only imports Node filesystem/path/crypto; no SDK, network or build.
      const cli = spawnSync(process.execPath, args, { cwd: directory, env: {}, encoding: "utf8", windowsHide: true, timeout: 10000 });
      assert.equal(cli.error, undefined);
      assert.equal(cli.status, expected.ok ? 0 : 1);
      assert.equal(cli.stdout, `${JSON.stringify(expected, null, 2)}\n`);
      assert.deepEqual(JSON.parse(cli.stdout), JSON.parse(JSON.stringify(expected)));
      if (expected.ok) assert.equal(cli.stderr, "");
      else {
        assert.match(cli.stderr, diagnostic);
        assert.ok(cli.stderr.includes(expected.copies.find(c => c.status !== "equal").target));
        assert.ok(cli.stderr.includes(expected.sources[0].path));
        assert.match(cli.stderr, /No se modificó ningún archivo/);
        assert.match(cli.stderr, /npm --prefix functions run contracts:sync/);
        assert.ok(cli.stderr.includes(`npm --prefix functions run ${scope === "input" ? "contracts:check" : "contracts:check:built"}\n`));
        assert.equal(cli.stderr.includes("synthetic contract"), false);
      }
      assert.deepEqual(snapshot(), before);
    });
  }
  await t.test("process supervisor keeps failed-check JSON separate from diagnostics", async () => {
    reset();
    fs.appendFileSync(artifact.targetPaths[0], "stale");
    const before = snapshot(), owner = new Processes();
    const log = path.join(directory, "contracts-input.log"), stderrLog = `${log}.stderr`;
    try {
      await assert.rejects(owner.run([syncFile, "--check", "--input"], {
        cwd: directory, env: {}, name: "contracts-input", log, stderrLog, timeoutMs: 10000,
      }), error => error.exitCode === 1);
      assert.deepEqual(JSON.parse(fs.readFileSync(log)), JSON.parse(JSON.stringify(check("input"))));
      assert.match(fs.readFileSync(stderrLog, "utf8"), /npm --prefix functions run contracts:sync/);
      assert.deepEqual(snapshot(), before);
    } finally { assert.ok((await owner.stop()).every(p => p.closed)); }
  });
});

async function until(condition, message, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = condition();
    if (value) return value;
    await pause(50);
  }
  throw new Error(`Plazo agotado: ${message}`);
}

test("shared contracts: read-only checks, build, watch and real consumer", { timeout: 240000 }, async t => {
  const root = path.resolve(__dirname, "../.."), base = path.join(root, ".local-isolation");
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, "contracts-test-")), workspace = path.join(directory, "workspace");
  copyWorkspace(workspace);
  const env = cleanEnvironment(directory);
  for (const name of ["HOME", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "CLOUDSDK_CONFIG", "TEMP"]) fs.mkdirSync(env[name], { recursive: true });
  fs.symlinkSync(path.join(root, "functions/node_modules"), path.join(workspace, "functions/node_modules"), process.platform === "win32" ? "junction" : "dir");
  const owner = new Processes(), report = { node: process.version, platform: process.platform, directory, cases: [], checks: [], consumption: [], cleanup: [] };
  const evidenceFile = path.join(base, "contracts-evidence.json");
  const save = () => fs.writeFileSync(evidenceFile, JSON.stringify(report, null, 2));
  const step = async (name, run) => {
    await t.test(name, async () => {
      try { await run(); report.cases.push({ name, status: "passed" }); }
      catch (error) { report.cases.push({ name, status: "failed", message: error.message }); throw error; }
      finally { save(); }
    });
    assert.equal(report.cases.at(-1).status, "passed", `No continuar tras falla: ${name}`);
  };
  const syncFile = path.join(workspace, "functions/scripts/syncTemplateContract.cjs");
  const authority = require(syncFile);
  const { artifacts, syncTemplateContract: sync, checkTemplateContract: check } = authority;
  const functionsDir = path.join(workspace, "functions");
  const run = (args, name, timeoutMs = 45000) => owner.run(args, { cwd: functionsDir, env, log: path.join(directory, `${name}.log`), name, timeoutMs });
  const inspect = scope => { const result = check(scope); report.checks.push(result); return result; };
  const unmapped = path.join(functionsDir, "shared/not-generated.cjs");
  fs.writeFileSync(unmapped, "module.exports = 'preserve me';\n");
  const snapshot = () => Object.fromEntries([...artifacts.flatMap(a => [a.sourcePath, ...a.targetPaths]), unmapped].map(file => [file,
    fs.existsSync(file) ? { hash: createHash("sha256").update(fs.readFileSync(file)).digest("hex"), mtime: fs.statSync(file).mtimeMs } : null]));
  let watcher, events;
  try {
    await step("input copies required; build outputs legitimately absent before generation", async () => {
      assert.ok(artifacts.length > 0);
      assert.equal(inspect("input").ok, true);
      assert.equal(fs.existsSync(path.join(functionsDir, "lib")), false, "Import must not synchronize");
      const all = inspect();
      assert.equal(all.ok, false);
      assert.ok(all.copies.filter(c => c.kind === "build").every(c => c.status === "missing"));
    });
    await step("initial synchronization covers every mapping; identical bytes are not rewritten", async () => {
      const result = sync();
      assert.equal(result.changed.length, artifacts.flatMap(a => a.targetPaths).filter(file => authority.targetKind(file) === "build").length);
      for (const artifact of artifacts) for (const target of artifact.targetPaths) {
        assert.deepEqual(fs.readFileSync(target), fs.readFileSync(artifact.sourcePath), target);
        fs.utimesSync(target, new Date(1000000), new Date(1000000));
      }
      assert.equal(inspect().ok, true);
      const before = snapshot();
      assert.equal(sync().changed.length, 0);
      assert.deepEqual(snapshot(), before);
    });
    await step("read-only CLI rejects an altered copy and leaves bytes and timestamps intact", async () => {
      const target = artifacts[0].targetPaths.find(file => authority.targetKind(file) === "input");
      fs.appendFileSync(target, "\n// disposable stale copy\n");
      const before = snapshot();
      await assert.rejects(owner.run([syncFile, "--check", "--input"], {
        cwd: functionsDir, env, name: "altered-check", timeoutMs: 45000,
        log: path.join(directory, "altered-check.log"), stderrLog: path.join(directory, "altered-check-stderr.log"),
      }), error => error.exitCode === 1);
      assert.match(fs.readFileSync(path.join(directory, "altered-check-stderr.log"), "utf8"), /Copia desactualizada/);
      const result = JSON.parse(fs.readFileSync(path.join(directory, "altered-check.log")));
      report.checks.push(result);
      assert.ok(result.copies.some(c => c.status === "different" && Number.isInteger(c.firstDifferentByte)));
      assert.deepEqual(snapshot(), before);
      const repaired = sync();
      assert.equal(repaired.changed.length, 1); assert.equal(repaired.changed[0].status, "different");
    });
    await step("missing source is diagnosed without writes; missing input/build copies and copy failure are errors", async () => {
      const artifact = artifacts[0], original = fs.readFileSync(artifact.sourcePath);
      fs.unlinkSync(artifact.sourcePath);
      const before = snapshot();
      assert.equal(inspect().sources.find(s => s.path.endsWith("firebaseEnvironment.cjs")).status, "missing");
      assert.throws(sync, /ENOENT/);
      assert.deepEqual(snapshot(), before);
      fs.writeFileSync(artifact.sourcePath, original);
      for (const target of artifact.targetPaths) {
        fs.unlinkSync(target);
        assert.equal(inspect().ok, false);
        assert.equal(check("input").ok, authority.targetKind(target) === "build");
        sync();
      }
      const target = artifact.targetPaths.at(-1);
      fs.unlinkSync(target); fs.mkdirSync(target);
      assert.throws(sync, /EISDIR|EPERM|EACCES/);
      assert.equal(inspect().ok, false);
      fs.rmdirSync(target); sync();
      assert.equal(fs.readFileSync(unmapped, "utf8"), "module.exports = 'preserve me';\n");
    });
    await step("build compiles and checks all copies with the existing TypeScript runtime", async () => {
      await run(["scripts/buildContracts.cjs"], "build", 180000);
      assert.equal(inspect().ok, true);
      const states = fs.readFileSync(path.join(directory, "build.log"), "utf8").trim().split(/\r?\n/).map(line => JSON.parse(line));
      assert.equal(states.at(-1).state, "ready");
      assert.equal(states.at(-1).copies, artifacts.flatMap(a => a.targetPaths).length);
    });
    const loader = artifacts.find(a => a.sourcePath.endsWith(`${path.sep}invitationLoaderPresentation.cjs`));
    assert.ok(loader);
    const original = fs.readFileSync(loader.sourcePath, "utf8");
    const consumerFile = path.join(functionsDir, "lib/utils/generarInvitationLoaderRuntime.js");
    // This actual compiled Functions consumer captures the contract in require's
    // cache. A fresh process below is intentionally a different observation.
    const residentConsumer = require(consumerFile);
    const originalHTML = residentConsumer.generarInvitationLoaderRuntimeHTML();
    const replace = text => {
      assert.ok(original.includes("Preparando tu invitación..."));
      return original.replace("Preparando tu invitación...", text);
    };
    const consume = async text => {
      const script = `const assert=require('node:assert/strict'); const c=require(${JSON.stringify(consumerFile)}); const html=c.generarInvitationLoaderRuntimeHTML(); assert.ok(html.includes(${JSON.stringify(text)})); console.log(JSON.stringify({kind:'fresh-process',text:${JSON.stringify(text)},observed:true}));`;
      await run(["-e", script], `consumer-${report.consumption.length}`);
      report.consumption.push({ kind: "fresh-process", consumer: "functions/lib/utils/generarInvitationLoaderRuntime.js", text, observed: true });
      assert.equal(residentConsumer.generarInvitationLoaderRuntimeHTML(), originalHTML, "Existing CommonJS consumer is still cached");
      report.consumption.push({ kind: "resident-process", observed: "original cached HTML; restart required" });
    };
    const watchLog = path.join(directory, "watch.log"), stopFile = path.join(directory, "stop-watch");
    events = () => fs.existsSync(watchLog) ? fs.readFileSync(watchLog, "utf8").split(/\r?\n/).flatMap(line => {
      try { const event = JSON.parse(line); return event.component === "contracts-build" ? [event] : []; } catch { return []; }
    }) : [];
    const readyAfter = async index => until(() => {
      assert.equal(watcher.done, undefined, "Watcher must stay active");
      return events().slice(index).find(e => e.state === "ready");
    }, "watch ready for latest inputs");
    // Cross-platform test driver invokes the real watch entrypoint and its same
    // signal handler; it never kills by process name or by a shared port.
    const driver = `const fs=require('node:fs'); const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(stopFile)})){clearInterval(timer);process.emit('SIGINT');}},25); require('./scripts/buildContracts.cjs').buildContracts(true).finally(()=>clearInterval(timer));`;
    await step("watch synchronizes initially and a real consumer observes later canonical behavior", async () => {
      watcher = owner.start(["-e", driver], { cwd: functionsDir, env, log: watchLog, name: "contracts watch" });
      await readyAfter(0);
      const index = events().length;
      for (const artifact of artifacts) fs.appendFileSync(artifact.sourcePath, "\n// FASE 5C: every mapped input changed in the disposable watcher.\n");
      fs.writeFileSync(loader.sourcePath, replace("Prueba 5C: cambio activo"));
      await readyAfter(index);
      assert.equal(inspect().ok, true);
      assert.equal(events().slice(index).find(e => e.state === "compiling").changed.length, artifacts.flatMap(a => a.targetPaths).length);
      await consume("Prueba 5C: cambio activo");
    });
    await step("editor replacement and rapid saves converge to the last behavior", async () => {
      let index = events().length;
      const temporary = `${loader.sourcePath}.editor-tmp`;
      fs.writeFileSync(temporary, replace("Prueba 5C: reemplazo"));
      fs.renameSync(temporary, loader.sourcePath);
      await readyAfter(index); await consume("Prueba 5C: reemplazo");
      index = events().length;
      fs.writeFileSync(loader.sourcePath, replace("Prueba 5C: intermedio"));
      await until(() => events().slice(index).some(e => e.state === "compiling"), "compilation started before more saves");
      for (let n = 0; n < 8; n++) fs.writeFileSync(loader.sourcePath, replace(`Prueba 5C: ráfaga ${n}`));
      await readyAfter(index);
      assert.equal(inspect().ok, true); await consume("Prueba 5C: ráfaga 7");
    });
    await step("source removal reports error, restoration explicitly recovers; unmapped file preserved", async () => {
      const index = events().length;
      fs.renameSync(loader.sourcePath, `${loader.sourcePath}.removed`);
      await until(() => events().slice(index).some(e => e.state === "error" && e.message.includes("ENOENT")), "missing-source diagnostic");
      assert.equal(events().slice(index).some(e => e.state === "ready"), false);
      const recoveryIndex = events().length;
      fs.renameSync(`${loader.sourcePath}.removed`, loader.sourcePath);
      await readyAfter(recoveryIndex);
      assert.equal(inspect().ok, true); await consume("Prueba 5C: ráfaga 7");
      assert.equal(fs.readFileSync(unmapped, "utf8"), "module.exports = 'preserve me';\n");
    });
    await step("watch cannot report ready after a copy failure; repaired destination and edited input recover", async () => {
      const index = events().length, target = loader.targetPaths.find(file => authority.targetKind(file) === "input");
      fs.unlinkSync(target); fs.mkdirSync(target);
      fs.writeFileSync(loader.sourcePath, replace("Prueba 5C: destino bloqueado"));
      await until(() => events().slice(index).some(e => e.state === "error" && /EISDIR|EPERM|EACCES/.test(e.message)), "copy failure diagnostic");
      assert.equal(events().slice(index).some(e => e.state === "ready"), false);
      const recoveryIndex = events().length;
      fs.rmdirSync(target);
      fs.writeFileSync(loader.sourcePath, replace("Prueba 5C: destino recuperado"));
      await readyAfter(recoveryIndex);
      assert.equal(inspect().ok, true); await consume("Prueba 5C: destino recuperado");
    });
    await step("new TypeScript input recompiles; stop during compile closes owned children", async () => {
      let index = events().length;
      const source = path.join(functionsDir, "src/phase5cWatchInput.ts");
      fs.writeFileSync(source, "export const watchProbe = 5;\n");
      await readyAfter(index);
      const built = path.join(functionsDir, "lib/phase5cWatchInput.js");
      assert.match(fs.readFileSync(built, "utf8"), /watchProbe = 5/);
      index = events().length;
      fs.writeFileSync(source, "export const watchProbe = 6;\n");
      await until(() => events().slice(index).some(e => e.state === "compiling"), "active compiler before stop");
      fs.writeFileSync(stopFile, "stop own watcher");
      await until(() => watcher.done, "watch process stopped", 25000);
      assert.equal((await watcher.completion).code, 0);
      const stopped = events().find(e => e.state === "stopped");
      assert.ok(stopped?.processes.length);
      assert.ok(stopped.processes.every(p => p.closed));
      for (const child of stopped.processes) assert.throws(() => process.kill(child.pid, 0), /ESRCH/);
      assert.equal(events().slice(index).some(e => e.state === "ready"), false);
    });
  } finally {
    report.cleanup = await owner.stop();
    report.watch = events ? events() : [];
    // Keep only synthetic diagnostics, including compiler failures, in the
    // selected CI artifact; never upload the disposable repository wholesale.
    report.logs = Object.fromEntries(fs.readdirSync(directory).filter(name => name.endsWith(".log"))
      .map(name => [name, fs.readFileSync(path.join(directory, name), "utf8")]));
    report.ok = report.cases.length > 0 && report.cases.every(c => c.status === "passed") && report.cleanup.every(p => p.closed);
    save();
    t.diagnostic(`Synthetic evidence: ${evidenceFile}; cases=${report.cases.length}; ok=${report.ok}`);
  }
});
