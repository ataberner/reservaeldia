const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { artifacts } = require("./syncTemplateContract.cjs");

const functionsRoot = path.resolve(__dirname, "..");
const emailRoot = path.resolve(functionsRoot, "../functions-email");

function buildEmail() {
  if (fs.realpathSync(emailRoot) !== emailRoot) throw new Error("Email source must not be a link");
  // firebaseAdmin requires this shared authority at runtime. Other domains' contracts
  // and configuration never enter this package. Reuse the canonical mapping.
  const copies = artifacts.filter(({ sourcePath }) => path.basename(sourcePath) === "firebaseEnvironment.cjs")
    .flatMap(({ sourcePath, targetPaths }) => targetPaths.map(target => {
      const relative = path.relative(functionsRoot, target);
      if (!/^(lib|shared)[\\/]/.test(relative)) throw new Error("Unexpected contract destination");
      return { bytes: fs.readFileSync(sourcePath), target: path.join(emailRoot, relative) };
    }));
  if (copies.length !== 2) throw new Error("Missing firebaseEnvironment contract mapping");
  for (const name of ["lib", "shared"]) {
    const target = path.resolve(emailRoot, name);
    if (path.dirname(target) !== emailRoot || (fs.existsSync(target) && fs.realpathSync(target) !== target)) {
      throw new Error("Unsafe generated destination");
    }
    fs.rmSync(target, { recursive: true, force: true });
  }
  const result = spawnSync(process.execPath, [require.resolve("typescript/bin/tsc"), "--project", "tsconfig.email-package.json"], {
    cwd: functionsRoot, windowsHide: true, stdio: "inherit",
  });
  if (result.error || result.status !== 0) throw new Error("Email TypeScript build failed");
  for (const { bytes, target } of copies) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  if (fs.existsSync(path.join(emailRoot, "lib/index.js"))) throw new Error("Core entrypoint included in email");
  console.log(JSON.stringify({ source: "functions-email", main: "lib/emails/entrypoint.js", contracts: copies.length }));
}
if (require.main === module) {
  try { buildEmail(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildEmail };
