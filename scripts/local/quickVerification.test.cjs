const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseArguments, checkedFile, changedFiles, createPlan, executePlan } = require("./quickVerification.cjs");

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reserva-quick-test-"));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^reserva-quick-test-/);
    fs.rmSync(root, { recursive: true, force: true });
  });
  for (const file of files) {
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, "// synthetic\n");
  }
  return root;
}

test("default selection never discovers arbitrary changed integration or browser tests", t => {
  const files = ["scripts/local/quickVerification.cjs", "scripts/local/quickVerification.test.cjs",
    "scripts/local/integration.test.mjs", "src/screen.browser.test.mjs", "src/page.jsx", "functions/src/code.ts", "functions/lib/generated.cjs"];
  const root = fixture(t, files);
  const plan = createPlan(root, parseArguments([]), files);
  assert.deepEqual(plan.tests, ["scripts/local/quickVerification.test.cjs"]);
  assert.deepEqual(plan.skipped, ["src/page.jsx", "functions/src/code.ts", "functions/lib/generated.cjs"]);
  assert.ok(plan.syntax.includes("scripts/local/integration.test.mjs"));
  assert.deepEqual(createPlan(root, parseArguments([]), ["src/page.jsx"]).tests, []);
});

test("explicit selection is exact and refuses directory/glob/flag/path traversal expansion", t => {
  const root = fixture(t, ["src/a.test.mjs", "src/a.js", "artifacts/output.test.mjs"]);
  const options = parseArguments(["--list", "src/a.test.mjs", "src/a.test.mjs"]);
  assert.equal(options.list, true);
  assert.deepEqual(createPlan(root, options), { explicit: true, tests: ["src/a.test.mjs"], syntax: [], skipped: [] });
  for (const input of ["src", "src/*.test.mjs", "../outside.test.mjs", "src/a.js", "artifacts/output.test.mjs"]) {
    assert.throws(() => createPlan(root, parseArguments([input])), input);
  }
  assert.throws(() => parseArguments(["--test"]), /Opción desconocida/);
});

test("selection rejects a junction before inspecting its target", t => {
  const root = fixture(t, ["actual/a.test.mjs"]);
  const link = path.join(root, "linked");
  fs.symlinkSync(path.join(root, "actual"), link, process.platform === "win32" ? "junction" : "dir");
  try { assert.throws(() => checkedFile(root, "linked/a.test.mjs"), /No se siguen enlaces/); }
  finally { fs.unlinkSync(link); }
});

test("Git changes include staged, unstaged and untracked files without executing diff helpers", () => {
  const calls = [];
  const outputs = ["src/a.mjs\0src/space name.mjs\0", "src/a.mjs\0src/b.mjs\0", "src/new.mjs\0"];
  const files = changedFiles("synthetic", (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0, stdout: outputs.shift() };
  });
  assert.deepEqual(files, ["src/a.mjs", "src/b.mjs", "src/new.mjs", "src/space name.mjs"]);
  assert.ok(calls.every(call => call.command === "git"));
  assert.ok(calls.slice(0, 2).every(call => call.args.includes("--no-ext-diff") && call.args.includes("--no-textconv")));
  assert.throws(() => changedFiles("synthetic", () => ({ status: 1 })), /archivos de test explícitos/);
});

test("execution is sequential, exact, bounded and stops owned processes after failure", async () => {
  const calls = [];
  let stopped = false;
  const owner = {
    async run(args, options) {
      calls.push({ args, options });
      if (args.at(-1) === "src/failed.test.mjs") throw new Error("synthetic failure");
    },
    async stop() { stopped = true; },
  };
  await assert.rejects(executePlan({ syntax: ["src/a.cjs"], tests: ["src/failed.test.mjs", "src/unreached.test.mjs"] }, "synthetic", owner), /synthetic failure/);
  assert.equal(stopped, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, ["--check", "src/a.cjs"]);
  assert.deepEqual(calls[1].args, ["--test", "--test-concurrency=1", "--test-timeout=60000", "src/failed.test.mjs"]);
  assert.equal(calls[1].options.timeoutMs, 60000);
  assert.ok(calls.every(call => !call.args.some(arg => /(?:install|build|emulators)/.test(arg))));
});

test("empty plan does not invoke Node's implicit full test discovery", async () => {
  let calls = 0;
  const result = await executePlan({ syntax: [], tests: [] }, "synthetic", {
    async run() { calls += 1; }, async stop() {},
  });
  assert.equal(result, 0);
  assert.equal(calls, 0);
});

test("package defaults stay quick while the CI gate and full local route stay explicit", () => {
  const scripts = require("../../package.json").scripts;
  for (const name of ["test", "verify", "verify:quick", "test:local"]) {
    assert.equal(scripts[name], "node scripts/local/quickVerification.cjs");
  }
  assert.equal(scripts["verify:local"], "node scripts/local/runLocal.cjs verify");
  assert.equal(scripts["test:local:full"], "node scripts/local/runLocal.cjs test");
  assert.equal(scripts["verify:local:prepared"], "node scripts/local/prepareLocal.cjs --verify");
});
