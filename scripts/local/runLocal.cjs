const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const contract = require("../../shared/firebaseEnvironment.cjs");
const countdownChecks = require("./countdownChecks.cjs");
const { ROOT, checkRequirements, createSession, assertPortsFree, removeSession, validateInheritedDestinations } = require("./session.cjs");
const { Processes, failure } = require("./processes.cjs");
const { Evidence, assertRulesEvidence, assertTap, assertLintEvidence } = require("./evidence.cjs");

const processes = new Processes();
const allPorts = [...Object.values(contract.EMULATORS), 14400, 14500, 19150, 3100];
let currentSession, evidence, stopping, interruption;

async function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    const stopped = await processes.stop();
    if (currentSession) {
      await assertPortsFree(allPorts);
      const file = path.join(currentSession.session, "session.json");
      const marker = JSON.parse(fs.readFileSync(file));
      fs.writeFileSync(file, JSON.stringify({ ...marker, stopped: true, stoppedAt: new Date().toISOString() }, null, 2));
    }
    if (evidence) {
      evidence.data.cleanup = { status: "passed", processes: [...(evidence.data.cleanup?.processes || []), ...stopped], portsFree: currentSession ? allPorts : [] };
      evidence.save();
    }
  })();
  try { await stopping; } finally { stopping = undefined; }
}

async function waitForEmulators(child, env) {
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    if (interruption) throw interruption;
    if (child.done) throw failure("Los emuladores se detuvieron antes de estar listos.");
    try {
      const response = await fetch("http://127.0.0.1:14400/emulators", { signal: AbortSignal.timeout(1000) });
      const status = await response.json();
      if (Object.keys(contract.EMULATORS).every(name => status[name]?.port === contract.EMULATORS[name])) {
        const probe = await fetch(`http://${env.FIREBASE_FUNCTIONS_EMULATOR_HOST}/${contract.LOCAL_PROJECT}/${contract.REGION}/getMyUiPreferences`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: '{"data":{}}', signal: AbortSignal.timeout(10000),
        });
        if (probe.status === 401) return;
      }
    } catch { /* Bounded readiness polling, never a suite retry or remote URL. */ }
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  throw failure("Readiness: no están disponibles los cuatro emuladores demo; no hay fallback.");
}

async function main(mode) {
  const integration = ["test", "verify"].includes(mode), rules = ["rules", "verify"].includes(mode);
  const names = ["prerequisites", "copy", "contracts-input", ...(mode === "verify" ? ["lint", "tooling", "contracts-tests"] : []), ...(integration ? ["configuration"] : []), "sync", "compile", "contracts-built",
    ...(integration ? ["backend", "compatibility"] : []), "emulators", ...(rules ? ["rules-countdown"] : []),
    ...(integration ? ["integration", "seed", "browser", "stop-services", "offline"] : [])];
  evidence = new Evidence(ROOT, mode, mode === "check" ? ["prerequisites"] : names);
  let requirements;
  const stage = (name, operation, kind) => {
    if (interruption) throw interruption;
    return evidence.stage(name, operation, kind);
  };
  await stage("prerequisites", async () => {
    if (!["dev", "emulators", "test", "rules", "verify", "check"].includes(mode) || process.argv.length > 3)
      throw failure("Modo local inválido; no se aceptan overrides de destino.", "prerequisite");
    validateInheritedDestinations();
    requirements = checkRequirements();
    await assertPortsFree(allPorts);
    evidence.data.versions = { node: requirements.node, java: requirements.java, firebase: requirements.firebase, browser: requirements.browser, emulators: requirements.emulators };
    evidence.data.project = contract.LOCAL_PROJECT;
    evidence.data.credentials = "none; allowlisted environment and empty personal configuration";
  }, "prerequisite");
  if (mode === "check") return;
  await stage("copy", async () => {
    currentSession = createSession(requirements);
    evidence.data.session = path.relative(ROOT, currentSession.session);
    console.log(`Copia del estado actual: ${currentSession.workspace}`);
  });
  const { workspace, env, session } = currentSession;
  const run = (name, args, { kind = "tests", timeoutMs = 180000, cwd = workspace } = {}) =>
    stage(name, async log => {
      const stderrLog = ["contracts-input", "contracts-built"].includes(name) ? `${log}.stderr` : undefined;
      try {
        const result = await processes.run(args, { cwd, env, log, stderrLog, name, kind, timeoutMs });
        evidence.data.stages.find(s => s.name === name).exitCode = result.code;
      }
      catch (error) {
        if (/failureType: 'testTimeoutFailure'/.test(fs.readFileSync(log, "utf8"))) error.kind = "infrastructure";
        throw error;
      }
      finally {
        if (stderrLog && fs.existsSync(stderrLog)) process.stderr.write(fs.readFileSync(stderrLog, "utf8"));
      }
      if (args.includes("--test") || name === "compatibility") evidence.data.stages.find(s => s.name === name).tap = assertTap(log);
      if (name === "contracts-tests") {
        const file = path.join(workspace, ".local-isolation/contracts-evidence.json");
        if (!fs.existsSync(file)) throw failure("Falta evidencia de sincronización/watch");
        const report = JSON.parse(fs.readFileSync(file));
        if (!report.ok || !report.cases?.length || !report.cleanup?.length || report.cleanup.some(p => !p.closed))
          throw failure("Evidencia de sincronización/watch incompleta o sin limpieza confirmada");
      }
    }, kind);
  await run("contracts-input", ["scripts/syncTemplateContract.cjs", "--check", "--input"], { cwd: path.join(workspace, "functions") });
  if (mode === "verify") {
    await stage("lint", async log => {
      let error;
      try {
        await processes.run(["scripts/lint.cjs", "--report", path.join(session, "lint-evidence.json")],
          { cwd: path.join(workspace, "functions"), env, log, name: "lint", kind: "tests", timeoutMs: 180000 });
      } catch (e) { error = e; }
      finally { if (fs.existsSync(log)) process.stdout.write(fs.readFileSync(log, "utf8")); }
      if (error && error.exitCode !== 1) throw Object.assign(error, { kind: "infrastructure" });
      const report = assertLintEvidence(session, error?.exitCode || 0);
      Object.assign(evidence.data.stages.find(s => s.name === "lint"), {
        exitCode: report.exitCode, files: report.files.length, errors: report.errors, warnings: report.warnings,
      });
      if (error) throw error;
    }, "tests");
    await run("tooling", ["--test", "--test-reporter=tap", "scripts/local/tooling.test.mjs", "functions/scripts/lint.test.cjs"]);
    try {
      await run("contracts-tests", ["--test", "--test-reporter=tap", "functions/scripts/contracts.test.cjs"], { timeoutMs: 300000 });
    } finally {
      const report = path.join(workspace, ".local-isolation/contracts-evidence.json");
      if (fs.existsSync(report)) fs.copyFileSync(report, path.join(session, "contracts-evidence.json"));
    }
  }
  if (integration) await run("configuration", ["--test", "--test-reporter=tap", "scripts/local/environment.test.mjs", "src/firebaseInitializationContract.test.mjs"]);
  await run("sync", ["scripts/syncTemplateContract.cjs"], { cwd: path.join(workspace, "functions"), kind: "infrastructure" });
  await run("compile", ["node_modules/typescript/bin/tsc"], { cwd: path.join(workspace, "functions"), kind: "tests" });
  await run("contracts-built", ["scripts/syncTemplateContract.cjs", "--check"], { cwd: path.join(workspace, "functions") });
  if (integration) {
    await run("backend", ["--test", "--test-reporter=tap", "scripts/local/backend.test.cjs"]);
    await run("compatibility", ["scripts/local/productionCompatibility.cjs"]);
  }
  await stage("emulators", async log => {
    const emulators = processes.start([requirements.cli, "emulators:start", "--config", "firebase.local.json", "--project", contract.LOCAL_PROJECT,
      "--only", "auth,firestore,functions,storage", "--non-interactive"], { cwd: workspace, env, log, name: "emulators" });
    await waitForEmulators(emulators, env);
    const manifestFile = path.join(session, "rules-source.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile));
    for (const [name, hash] of Object.entries(manifest.rules)) {
      if (createHash("sha256").update(fs.readFileSync(path.join(workspace, name))).digest("hex") !== hash) throw failure("Rules cambiaron durante arranque");
    }
    manifest.loadedAfterReadiness = new Date().toISOString();
    manifest.configuration = JSON.parse(fs.readFileSync(path.join(workspace, "firebase.local.json")));
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  });
  if (rules) await stage("rules-countdown", async log => {
    let testError;
    try {
      await processes.run(["--test", "--test-reporter=tap", "scripts/local/rules.test.mjs", ...Object.values(countdownChecks).flat()],
        { cwd: workspace, env, log, name: "Rules y countdown", kind: "tests", timeoutMs: 600000 });
    } catch (error) { testError = error; }
    // Infrastructure/missing evidence takes precedence over an assertion exit.
    assertRulesEvidence(session);
    if (testError) throw testError;
    evidence.data.stages.find(s => s.name === "rules-countdown").tap = assertTap(log);
  });
  if (mode === "rules") return;
  if (integration || mode === "dev") {
    if (integration) await run("integration", ["--test", "--test-reporter=tap", "scripts/local/integration.test.mjs"]);
    if (mode === "dev") evidence.data.stages.push({ name: "seed", status: "not-executed" });
    await run("seed", ["scripts/local/seedLocal.cjs"]);
    const next = processes.start(["scripts/runNextDev.cjs"], { cwd: workspace, env: { ...env, NODE_ENV: "development" },
      log: path.join(evidence.directory, "next.log"), name: "next" });
    if (integration) {
      await run("browser", ["--test", "--test-reporter=tap", "scripts/local/browser.test.mjs"], { timeoutMs: 360000 });
      if (next.done) throw failure("Next se detuvo durante la prueba.");
      await stage("stop-services", stop);
      await run("offline", ["--test", "--test-reporter=tap", "scripts/local/offline.test.mjs"]);
      for (const name of ["integration", "browser", "offline"]) {
        if (!fs.existsSync(path.join(session, `${name}-evidence.json`))) throw failure(`Falta evidencia ${name}`);
      }
      fs.writeFileSync(path.join(session, "verified.json"), JSON.stringify({ project: contract.LOCAL_PROJECT, checkedAt: new Date().toISOString(), mode,
        checks: evidence.data.stages.filter(s => s.status === "passed").map(s => s.name), countdown: rules ? countdownChecks : undefined,
        exclusions: [...(mode === "verify" ? ["frontend lint"] : ["lint", "watch behavior tests"]), "production Next build/export", "disabled handlers", "Q1 approval", "remote configuration/deployment", "live Functions module reload", "original-to-prepared tree synchronization"] }, null, 2));
      return;
    }
  }
  console.log(mode === "dev" ? "Desarrollo: http://localhost:3100 — Ctrl+C detiene la sesión." : "Cuatro emuladores demo — Ctrl+C detiene la sesión.");
  await Promise.race([...processes.owned].filter(c => !c.done).map(c => c.completion));
  if (!interruption) throw failure("Un servicio local terminó inesperadamente.");
}

async function entry() {
  const mode = process.argv[2] || "dev";
  if (mode === "clean") {
    if (!process.argv[3] || process.argv.length !== 4) throw failure("Usar clean <ruta-absoluta-de-sesión-detenida>", "prerequisite");
    removeSession(process.argv[3]); return;
  }
  let error;
  const interrupt = kind => {
    interruption ||= failure(kind === "interrupted" ? "Interrupción solicitada" : "Tiempo máximo global (25 minutos)", kind);
    stop().catch(e => { error = e; });
  };
  const onSignal = () => interrupt("interrupted");
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  const timer = ["verify", "test", "rules", "check"].includes(mode) ? setTimeout(() => interrupt("infrastructure"), 25 * 60000) : undefined;
  try { await main(mode); } catch (e) { error = e; }
  finally {
    clearTimeout(timer);
    // Save test evidence before cleanup; keep it even if stopping fails.
    evidence?.collect(currentSession?.session);
    try { await stop(); } catch (e) {
      error = e;
      if (evidence) evidence.data.cleanup = { status: "failed", message: e.message };
    }
    if (interruption && evidence?.data.cleanup?.status !== "failed") error = interruption;
    evidence?.collect(currentSession?.session);
    process.exitCode = evidence ? evidence.finish(error) : 3;
    process.removeListener("SIGINT", onSignal); process.removeListener("SIGTERM", onSignal);
    if (error) console.error(error.message);
  }
}
if (require.main === module) entry().catch(error => { console.error(error.message); process.exitCode = 3; });
module.exports = { entry };
