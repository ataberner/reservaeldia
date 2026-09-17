const fs = require("node:fs");
const path = require("node:path");
const { failure } = require("./processes.cjs");

const EXIT_CODES = { tests: 1, prerequisite: 2, infrastructure: 3, interrupted: 130 };
// Explicit synthetic artifacts only. No HOME, profiles, env, repository copy,
// browser profile, emulator databases, credentials or arbitrary debug logs.
const ARTIFACTS = ["source-manifest.json", "lint-evidence.json", "contracts-evidence.json", "rules-source.json", "rules-evidence.json", "integration-evidence.json", "browser-evidence.json", "offline-evidence.json", "verified.json", "session.json"];
class Evidence {
  constructor(root, mode, names) {
    const base = path.join(root, ".local-isolation/reports");
    fs.mkdirSync(base, { recursive: true });
    this.directory = fs.mkdtempSync(path.join(base, "run-"));
    this.data = { schemaVersion: 1, mode, startedAt: new Date().toISOString(), status: "running",
      stages: names.map(name => ({ name, status: "not-executed" })) };
    this.save();
  }
  save() { fs.writeFileSync(path.join(this.directory, "result.json"), JSON.stringify(this.data, null, 2)); }
  async stage(name, operation, kind = "infrastructure") {
    const stage = this.data.stages.find(s => s.name === name);
    stage.status = "running"; stage.startedAt = new Date().toISOString(); this.save();
    console.log(`[local] ${name}`);
    try { await operation(path.join(this.directory, `${name}.log`)); stage.status = "passed"; }
    catch (error) { stage.status = "failed"; stage.kind = error.kind || kind; stage.error = error.message; stage.exitCode = error.exitCode; throw Object.assign(error, { kind: stage.kind }); }
    finally { stage.finishedAt = new Date().toISOString(); this.save(); }
  }
  collect(session) {
    if (!session) return;
    for (const name of ARTIFACTS) {
      const source = path.join(session, name);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(this.directory, name));
    }
  }
  finish(error) {
    this.data.status = error ? "failed" : "passed";
    this.data.exitCode = error ? EXIT_CODES[error.kind] || 3 : 0;
    if (error) this.data.failure = { kind: error.kind || "infrastructure", message: error.message };
    this.data.finishedAt = new Date().toISOString(); this.save();
    console.log(`[local] ${this.data.status}; código ${this.data.exitCode}; evidencia: ${this.directory}`);
    return this.data.exitCode;
  }
}
function assertRulesEvidence(session) {
  const file = path.join(session, "rules-evidence.json");
  if (!fs.existsSync(file)) throw failure("Falta evidencia Rules; no se acepta éxito sin tests");
  const report = JSON.parse(fs.readFileSync(file));
  if (!report.planned || report.executed !== report.planned || report.infrastructure.length ||
    Object.values(report.summary).some(s => s.infrastructureErrors)) throw failure("Rules incompletas o infraestructura fallida");
  if (report.summary.acceptance.differs || report.summary.characterization.differs) throw failure("Rules: aceptación/caracterización fallida", "tests");
  return report;
}
function assertTap(log) {
  const text = fs.readFileSync(log, "utf8");
  const count = name => [...text.matchAll(new RegExp(`^# ${name} (\\d+)\\r?$`, "gm"))].reduce((sum, match) => sum + Number(match[1]), 0);
  if (!count("tests") || count("cancelled") || count("skipped")) throw failure("TAP ausente, incompleto o con tests omitidos/cancelados");
  if (count("fail")) throw failure("TAP registra pruebas fallidas", "tests");
  return { tests: count("tests"), passed: count("pass"), failed: count("fail"), skipped: count("skipped"), cancelled: count("cancelled") };
}
function assertLintEvidence(session, exitCode) {
  const file = path.join(session, "lint-evidence.json");
  if (!fs.existsSync(file)) throw failure("Falta evidencia lint");
  const report = JSON.parse(fs.readFileSync(file));
  if (!report.files?.length || report.failure || report.exitCode !== exitCode ||
    ![0, 1].includes(exitCode) || (report.errors > 0) !== (exitCode === 1)) throw failure("Lint incompleto o resultado inconsistente");
  return report;
}
module.exports = { Evidence, EXIT_CODES, ARTIFACTS, assertRulesEvidence, assertTap, assertLintEvidence };
