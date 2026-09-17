const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const YAML = require("./tools/node_modules/yaml");

function readWorkflows(root) {
  const directory = path.join(root, ".github/workflows");
  return Object.fromEntries(fs.readdirSync(directory).filter(name => /\.ya?ml$/.test(name)).map(name => {
    const doc = YAML.parseDocument(fs.readFileSync(path.join(directory, name), "utf8"), { uniqueKeys: true });
    assert.deepEqual(doc.errors, [], `${name}: YAML inválido`);
    return [name, doc.toJS()];
  }));
}
function checkWorkflows(workflows) {
  for (const [name, workflow] of Object.entries(workflows)) {
    assert.ok(workflow.name && workflow.on && workflow.jobs, `${name}: estructura de workflow`);
    assert.ok(!JSON.stringify(workflow).includes("pull_request_target"), "Sin contexto privilegiado para PR");
    const jobs = workflow.jobs;
    const visit = (id, visiting = new Set()) => {
      assert.ok(jobs[id], `${name}: dependencia inexistente ${id}`);
      assert.ok(!visiting.has(id), `${name}: ciclo en needs`);
      for (const dependency of [jobs[id].needs || []].flat()) visit(dependency, new Set([...visiting, id]));
    };
    for (const id of Object.keys(jobs)) visit(id);
  }
  const reusable = workflows["local-verification.yml"];
  assert.ok(Object.hasOwn(reusable.on, "workflow_call"));
  assert.deepEqual(reusable.permissions, { contents: "read" });
  assert.ok(!JSON.stringify(reusable).includes("secrets."), "La verificación no necesita secretos");
  assert.ok(!JSON.stringify(reusable).includes("continue-on-error"));
  assert.deepEqual(Object.keys(reusable.jobs), ["verify"]);
  const verify = reusable.jobs.verify;
  assert.equal(verify.if, undefined);
  assert.equal(verify.permissions, undefined);
  assert.ok(verify["timeout-minutes"] > 0);
  const steps = verify.steps;
  for (const step of steps) if (!step.uses?.startsWith("actions/upload-artifact@")) assert.equal(step.if, undefined, "No omitir preparación o verificaciones");
  assert.ok(steps.some(s => s.run === "npm run local:prepare"));
  assert.ok(steps.some(s => s.run === 'npm --prefix "$VERIFY_WORKSPACE" run verify:local'));
  assert.ok(steps.some(s => s.uses?.startsWith("actions/checkout@") && s.with["persist-credentials"] === false));
  const artifacts = steps.find(s => s.uses?.startsWith("actions/upload-artifact@"));
  assert.equal(artifacts.if, "${{ always() }}");
  assert.equal(artifacts.with["if-no-files-found"], "error");
  for (const name of ["lint-evidence.json", "lint.log"]) assert.ok(artifacts.with.path.includes(`/reports/run-*/${name}`), `Preservar diagnóstico de lint: ${name}`);
  for (const name of ["contracts-input.log", "contracts-built.log", "contracts-tests.log", "contracts-evidence.json"]) assert.ok(artifacts.with.path.includes(`/reports/run-*/${name}`), `Preservar diagnóstico de contratos: ${name}`);
  for (const file of artifacts.with.path.trim().split(/\s+/)) assert.match(file, /^\.local-isolation\/(?:prepared-\*\/workspace\/\.local-isolation\/)?reports\/run-\*\/[a-z-]+\.(json|log)$/, "Sólo archivos explícitos de evidencia");
  for (const [file, deploy] of [["firebase-hosting-merge.yml", "build_and_deploy"], ["firebase-hosting-pull-request.yml", "build_and_preview"]]) {
    const workflow = workflows[file], gate = workflow.jobs.verification;
    assert.deepEqual(workflow.permissions, { contents: "read" });
    assert.deepEqual(gate, { uses: "./.github/workflows/local-verification.yml" });
    assert.equal(workflow.jobs[deploy].needs, "verification", "Hosting debe depender de verification");
    assert.ok(!JSON.stringify(workflow).includes("continue-on-error"));
    assert.ok(!JSON.stringify(workflow.on).includes("paths"), "Sin filtros de rutas");
  }
  assert.equal(workflows["firebase-hosting-pull-request.yml"].on, "pull_request");
  assert.equal(workflows["firebase-hosting-pull-request.yml"].jobs.build_and_preview.if, "${{ github.event.pull_request.head.repo.full_name == github.repository }}");
  assert.equal(workflows["firebase-hosting-merge.yml"].jobs.build_and_deploy.if, undefined);
  assert.deepEqual(workflows["firebase-hosting-merge.yml"].on.push.branches, ["main"]);
  return { method: "YAML parsing and local structural/dependency assertions; no GitHub execution", edges: ["verification -> build_and_preview", "verification -> build_and_deploy"] };
}
module.exports = { readWorkflows, checkWorkflows };
