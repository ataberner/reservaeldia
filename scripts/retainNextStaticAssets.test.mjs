import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  captureExistingRelease,
  finalizeRelease,
  resolvePaths,
} = require("./retainNextStaticAssets.cjs");

function createWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "reservaeldia-static-retention-"));
}

function writeBuild(rootDir, buildId, files) {
  const nextDir = path.join(rootDir, ".next");
  const outputStaticRoot = path.join(rootDir, "out", "_next", "static");
  fs.rmSync(path.join(rootDir, "out"), { recursive: true, force: true });
  fs.mkdirSync(nextDir, { recursive: true });
  fs.mkdirSync(outputStaticRoot, { recursive: true });
  fs.writeFileSync(path.join(nextDir, "BUILD_ID"), `${buildId}\n`);

  for (const [relativePath, content] of Object.entries(files)) {
    const targetPath = path.join(outputStaticRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content);
  }
}

test("a new release retains lazy chunks from the prior dashboard build", () => {
  const rootDir = createWorkspace();
  try {
    writeBuild(rootDir, "build-a", {
      "chunks/264.old.js": "old preview generator",
      "build-a/_buildManifest.js": "manifest a",
    });
    assert.equal(captureExistingRelease({ rootDir }).captured, true);

    writeBuild(rootDir, "build-b", {
      "chunks/264.new.js": "new preview generator",
      "build-b/_buildManifest.js": "manifest b",
    });
    const result = finalizeRelease({
      rootDir,
      maxReleases: 3,
    });
    const paths = resolvePaths(rootDir);

    assert.deepEqual(result.retainedReleaseIds, ["build-a", "build-b"]);
    assert.equal(
      fs.readFileSync(
        path.join(paths.outputStaticRoot, "chunks", "264.old.js"),
        "utf8"
      ),
      "old preview generator"
    );
    assert.equal(
      fs.readFileSync(
        path.join(paths.outputStaticRoot, "chunks", "264.new.js"),
        "utf8"
      ),
      "new preview generator"
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("retention stays bounded and removes assets older than the configured window", () => {
  const rootDir = createWorkspace();
  try {
    for (const buildId of ["build-a", "build-b", "build-c", "build-d"]) {
      writeBuild(rootDir, buildId, {
        [`chunks/${buildId}.js`]: buildId,
        [`${buildId}/_buildManifest.js`]: buildId,
      });
      finalizeRelease({
        rootDir,
        maxReleases: 3,
      });
    }

    const paths = resolvePaths(rootDir);
    const manifest = JSON.parse(fs.readFileSync(paths.manifestFile, "utf8"));
    assert.deepEqual(manifest.releaseIds, ["build-b", "build-c", "build-d"]);
    assert.equal(
      fs.existsSync(path.join(paths.outputStaticRoot, "chunks", "build-a.js")),
      false
    );
    assert.equal(
      fs.existsSync(path.join(paths.outputStaticRoot, "chunks", "build-b.js")),
      true
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("a reused immutable asset path with different bytes fails the release", () => {
  const rootDir = createWorkspace();
  try {
    writeBuild(rootDir, "build-a", {
      "chunks/shared.js": "old bytes",
    });
    finalizeRelease({ rootDir });

    writeBuild(rootDir, "build-b", {
      "chunks/shared.js": "different bytes",
    });
    assert.throws(
      () => finalizeRelease({ rootDir }),
      /Immutable Next\.js asset collision/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
