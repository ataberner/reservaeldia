const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { artifacts } = require("./syncTemplateContract.cjs");

const functionsRoot = path.resolve(__dirname, "..");
const paymentsRoot = path.resolve(functionsRoot, "../functions-payments");

function buildPayments() {
  // Only generated directories are replaced. Never read/copy dotenv, credentials
  // or node_modules, and never clean the source/package root itself.
  if (fs.realpathSync(paymentsRoot) !== paymentsRoot) throw new Error("Payments source must not be a link");
  const copies = artifacts.flatMap(({ sourcePath, targetPaths }) => targetPaths.map(target => {
    const relative = path.relative(functionsRoot, target);
    if (!/^(lib|shared)[\\/]/.test(relative)) throw new Error("Unexpected contract destination");
    return { bytes: fs.readFileSync(sourcePath), target: path.join(paymentsRoot, relative) };
  }));
  for (const name of ["lib", "shared"]) {
    const target = path.resolve(paymentsRoot, name);
    if (path.dirname(target) !== paymentsRoot || (fs.existsSync(target) && fs.realpathSync(target) !== target)) {
      throw new Error("Unsafe generated destination");
    }
    fs.rmSync(target, { recursive: true, force: true });
  }
  const result = spawnSync(process.execPath, [require.resolve("typescript/bin/tsc"), "--project", "tsconfig.payments.json"], {
    cwd: functionsRoot, windowsHide: true, stdio: "inherit",
  });
  if (result.error || result.status !== 0) throw new Error("Payments TypeScript build failed");
  for (const { bytes, target } of copies) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  if (fs.existsSync(path.join(paymentsRoot, "lib/index.js"))) throw new Error("Core entrypoint included in Payments");
  console.log(JSON.stringify({ source: "functions-payments", main: "lib/payments/entrypoint.js", contracts: copies.length }));
}

if (require.main === module) {
  try { buildPayments(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildPayments };
