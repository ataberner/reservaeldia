#!/usr/bin/env node

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = process.cwd();
const firebaseConfigPath = path.join(repoRoot, "firebase.json");
const tempFirebaseConfigPath = path.join(repoRoot, ".firebase.batched.functions.json");
const functionsBuildEntry = path.join(repoRoot, "functions", "lib", "index.js");

const batchSize = normalizePositiveInt(process.env.FUNCTIONS_DEPLOY_BATCH_SIZE, 10);
const delayMs = normalizePositiveInt(process.env.FUNCTIONS_DEPLOY_DELAY_MS, 15000);
const dryRun = process.argv.includes("--dry-run");

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function chunk(array, size) {
  const result = [];
  for (let index = 0; index < array.length; index += size) {
    result.push(array.slice(index, index + size));
  }
  return result;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${command} ${args.join(" ")}`);
    if (dryRun) {
      resolve();
      return;
    }

    const child = spawn(command, args, {
      cwd: repoRoot,
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function buildTempFirebaseConfig() {
  const raw = fs.readFileSync(firebaseConfigPath, "utf8");
  const config = JSON.parse(raw);

  if (Array.isArray(config.functions)) {
    config.functions = config.functions.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const next = { ...entry };
      delete next.predeploy;
      return next;
    });
  } else if (config.functions && typeof config.functions === "object") {
    config.functions = { ...config.functions };
    delete config.functions.predeploy;
  }

  fs.writeFileSync(tempFirebaseConfigPath, `${JSON.stringify(config, null, 2)}\n`);
}

function loadFunctionNames() {
  delete require.cache[functionsBuildEntry];
  const exported = require(functionsBuildEntry);

  return Object.entries(exported)
    .filter(([, value]) => typeof value === "function" && value && value.__endpoint)
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right));
}

async function main() {
  await run("npm", ["--prefix", "functions", "run", "build"]);

  if (!fs.existsSync(functionsBuildEntry)) {
    throw new Error(`No se encontro ${functionsBuildEntry} despues del build.`);
  }

  const functionNames = loadFunctionNames();
  if (functionNames.length === 0) {
    throw new Error("No se detectaron funciones exportadas para desplegar.");
  }

  buildTempFirebaseConfig();

  try {
    const batches = chunk(functionNames, batchSize);
    console.log(
      `\nDeploy batched de ${functionNames.length} funciones en ${batches.length} lotes de hasta ${batchSize}.`
    );

    for (const [index, batch] of batches.entries()) {
      const selector = batch.map((name) => `functions:${name}`).join(",");
      console.log(`\nLote ${index + 1}/${batches.length}: ${batch.join(", ")}`);
      await run("firebase", ["deploy", "--config", tempFirebaseConfigPath, "--only", selector]);

      if (index < batches.length - 1) {
        console.log(`Esperando ${delayMs}ms antes del siguiente lote...`);
        if (!dryRun) {
          await delay(delayMs);
        }
      }
    }
  } finally {
    if (fs.existsSync(tempFirebaseConfigPath)) {
      fs.unlinkSync(tempFirebaseConfigPath);
    }
  }
}

main().catch((error) => {
  console.error("\nFallo el deploy batched de functions.");
  console.error(error instanceof Error ? error.message : String(error || ""));
  process.exit(1);
});
