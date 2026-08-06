const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const HISTORY_SCHEMA_VERSION = 1;
const DEFAULT_MAX_RELEASES = 3;

function resolvePaths(rootDir) {
  const root = path.resolve(rootDir || process.cwd());
  const historyRoot = path.join(root, ".hosting-static-history");
  return {
    root,
    buildIdFile: path.join(root, ".next", "BUILD_ID"),
    outputStaticRoot: path.join(root, "out", "_next", "static"),
    historyRoot,
    releasesRoot: path.join(historyRoot, "releases"),
    manifestFile: path.join(historyRoot, "manifest.json"),
  };
}

function normalizeReleaseId(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 120);
  if (!normalized) {
    throw new Error("A valid Next.js buildId is required for static asset retention.");
  }
  return normalized;
}

function readBuildId(buildIdFile) {
  if (!fs.existsSync(buildIdFile)) {
    throw new Error(`Next.js BUILD_ID not found: ${buildIdFile}`);
  }
  return normalizeReleaseId(fs.readFileSync(buildIdFile, "utf8"));
}

function readManifest(paths) {
  if (!fs.existsSync(paths.manifestFile)) {
    return {
      schemaVersion: HISTORY_SCHEMA_VERSION,
      releaseIds: [],
    };
  }

  const parsed = JSON.parse(fs.readFileSync(paths.manifestFile, "utf8"));
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    releaseIds: Array.isArray(parsed?.releaseIds)
      ? parsed.releaseIds.map(normalizeReleaseId)
      : [],
  };
}

function writeManifest(paths, releaseIds) {
  fs.mkdirSync(paths.historyRoot, { recursive: true });
  fs.writeFileSync(
    paths.manifestFile,
    `${JSON.stringify(
      {
        schemaVersion: HISTORY_SCHEMA_VERSION,
        releaseIds,
      },
      null,
      2
    )}\n`
  );
}

function assertHistoryTarget(paths, targetPath) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedReleasesRoot = path.resolve(paths.releasesRoot);
  if (
    resolvedTarget === resolvedReleasesRoot ||
    !resolvedTarget.startsWith(`${resolvedReleasesRoot}${path.sep}`)
  ) {
    throw new Error(`Refusing to mutate a path outside release history: ${targetPath}`);
  }
}

function hashFile(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function listFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const files = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  };
  visit(rootDir);
  return files.sort();
}

function replaceSnapshot(paths, sourceRoot, releaseId) {
  const releaseRoot = path.join(paths.releasesRoot, normalizeReleaseId(releaseId));
  assertHistoryTarget(paths, releaseRoot);
  fs.rmSync(releaseRoot, { recursive: true, force: true });
  fs.mkdirSync(releaseRoot, { recursive: true });
  fs.cpSync(sourceRoot, releaseRoot, { recursive: true });
  return releaseRoot;
}

function mergeSnapshot(sourceRoot, outputRoot) {
  let copiedFiles = 0;
  let matchingFiles = 0;

  for (const sourceFile of listFiles(sourceRoot)) {
    const relativePath = path.relative(sourceRoot, sourceFile);
    const outputFile = path.join(outputRoot, relativePath);
    if (!fs.existsSync(outputFile)) {
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.copyFileSync(sourceFile, outputFile);
      copiedFiles += 1;
      continue;
    }

    if (hashFile(sourceFile) !== hashFile(outputFile)) {
      throw new Error(
        `Immutable Next.js asset collision with different content: ${relativePath}`
      );
    }
    matchingFiles += 1;
  }

  return {
    copiedFiles,
    matchingFiles,
  };
}

function pruneHistory(paths, releaseIds, maxReleases) {
  const retainedReleaseIds = releaseIds.slice(-maxReleases);
  const retainedSet = new Set(retainedReleaseIds);

  if (fs.existsSync(paths.releasesRoot)) {
    for (const entry of fs.readdirSync(paths.releasesRoot, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory() || retainedSet.has(entry.name)) continue;
      const releaseRoot = path.join(paths.releasesRoot, entry.name);
      assertHistoryTarget(paths, releaseRoot);
      fs.rmSync(releaseRoot, { recursive: true, force: true });
    }
  }

  return retainedReleaseIds;
}

function captureExistingRelease({
  rootDir = process.cwd(),
} = {}) {
  const paths = resolvePaths(rootDir);
  const manifest = readManifest(paths);
  if (manifest.releaseIds.length > 0) {
    return {
      captured: false,
      reason: "history-present",
      releaseIds: manifest.releaseIds,
    };
  }
  if (!fs.existsSync(paths.outputStaticRoot)) {
    return {
      captured: false,
      reason: "output-missing",
      releaseIds: [],
    };
  }

  const buildId = readBuildId(paths.buildIdFile);
  replaceSnapshot(paths, paths.outputStaticRoot, buildId);
  writeManifest(paths, [buildId]);
  return {
    captured: true,
    reason: "existing-output-captured",
    releaseIds: [buildId],
  };
}

function seedReleaseSnapshot({
  rootDir = process.cwd(),
  releaseId,
  sourceStaticRoot,
} = {}) {
  const paths = resolvePaths(rootDir);
  const manifest = readManifest(paths);
  if (manifest.releaseIds.length > 0) {
    return {
      seeded: false,
      reason: "history-present",
      releaseIds: manifest.releaseIds,
    };
  }
  if (!sourceStaticRoot || !fs.existsSync(sourceStaticRoot)) {
    throw new Error("A downloaded Next.js static directory is required.");
  }

  const normalizedReleaseId = normalizeReleaseId(releaseId);
  replaceSnapshot(
    paths,
    path.resolve(sourceStaticRoot),
    normalizedReleaseId
  );
  writeManifest(paths, [normalizedReleaseId]);
  return {
    seeded: true,
    reason: "snapshot-seeded",
    releaseIds: [normalizedReleaseId],
  };
}

function finalizeRelease({
  rootDir = process.cwd(),
  maxReleases = DEFAULT_MAX_RELEASES,
} = {}) {
  const safeMaxReleases = Math.max(2, Math.floor(Number(maxReleases) || 0));
  const paths = resolvePaths(rootDir);
  if (!fs.existsSync(paths.outputStaticRoot)) {
    throw new Error(`Next.js static export not found: ${paths.outputStaticRoot}`);
  }

  const buildId = readBuildId(paths.buildIdFile);
  const manifest = readManifest(paths);

  // Snapshot only the just-built files before older releases are merged into out/.
  replaceSnapshot(paths, paths.outputStaticRoot, buildId);

  const orderedReleaseIds = [
    ...manifest.releaseIds.filter((releaseId) => releaseId !== buildId),
    buildId,
  ];
  const retainedReleaseIds = pruneHistory(
    paths,
    orderedReleaseIds,
    safeMaxReleases
  );
  writeManifest(paths, retainedReleaseIds);

  let copiedFiles = 0;
  let matchingFiles = 0;
  for (const releaseId of retainedReleaseIds) {
    const result = mergeSnapshot(
      path.join(paths.releasesRoot, releaseId),
      paths.outputStaticRoot
    );
    copiedFiles += result.copiedFiles;
    matchingFiles += result.matchingFiles;
  }

  return {
    buildId,
    retainedReleaseIds,
    copiedFiles,
    matchingFiles,
  };
}

function runCli() {
  const command = String(process.argv[2] || "").trim();
  if (command === "capture") {
    const result = captureExistingRelease();
    console.log(
      `[next-static-retention] capture=${result.reason} releases=${result.releaseIds.length}`
    );
    return;
  }
  if (command === "finalize") {
    const result = finalizeRelease();
    console.log(
      `[next-static-retention] buildId=${result.buildId} retained=${result.retainedReleaseIds.length} restored=${result.copiedFiles}`
    );
    return;
  }

  throw new Error(
    "Usage: node scripts/retainNextStaticAssets.cjs <capture|finalize>"
  );
}

if (require.main === module) {
  runCli();
}

module.exports = {
  DEFAULT_MAX_RELEASES,
  captureExistingRelease,
  finalizeRelease,
  listFiles,
  resolvePaths,
  seedReleaseSnapshot,
};
