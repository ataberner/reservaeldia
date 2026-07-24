import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COUNTDOWN_VISUAL_BASELINE_SURFACES,
  buildCountdownVisualBaselineFixtureManifest,
  countdownVisualBaselineStates,
} from "./countdownVisualBaselineFixtures.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const baselineDirectory = path.resolve(
  currentDirectory,
  "../artifacts/countdown-phase0/baseline"
);

test("committed countdown visual baseline matches fixtures and file hashes", () => {
  const manifestPath = path.join(baselineDirectory, "manifest.json");
  assert.equal(
    fs.existsSync(manifestPath),
    true,
    "Run npm run countdowns:baseline:update to create the baseline."
  );

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const fixtureManifest = buildCountdownVisualBaselineFixtureManifest();
  assert.equal(manifest.fixtureVersion, fixtureManifest.fixtureVersion);
  assert.equal(manifest.frozenNowISO, fixtureManifest.frozenNowISO);
  assert.deepEqual(manifest.surfaces, fixtureManifest.surfaces);
  assert.deepEqual(manifest.states, fixtureManifest.states);
  assert.equal(
    manifest.captures.length,
    countdownVisualBaselineStates.length *
      COUNTDOWN_VISUAL_BASELINE_SURFACES.length
  );

  manifest.captures.forEach((capture) => {
    const filePath = path.resolve(
      baselineDirectory,
      ...capture.file.split("/")
    );
    assert.equal(fs.existsSync(filePath), true, capture.file);
    const bytes = fs.readFileSync(filePath);
    const fileHash = crypto
      .createHash("sha256")
      .update(bytes)
      .digest("hex");
    assert.equal(fileHash, capture.sha256, capture.file);
  });
});
