const test = require("node:test");
const assert = require("node:assert/strict");
const { selectedModes } = require("./runStorageRelease.cjs");

test("default remains the two Storage artifacts in order", () => assert.deepEqual(selectedModes([]), ["base", "candidate"]));
test("fixed Firestore mode does not repeat the approved Storage suites", () => assert.deepEqual(selectedModes(["--firestore-assets"]), ["firestore-assets"]));
test("fixed administrative draft mode evaluates the exact scoped Firestore candidate", () => assert.deepEqual(selectedModes(["--administrative-drafts"]), ["administrative-drafts"]));
test("reject unknown modes, repeated flags and any destination overrides before starting services", () => {
  for (const args of [["candidate"], ["--project", "production"], ["--firestore-assets", "--project", "production"],
    ["--firestore-assets", "--firestore-assets"], ["--administrative-drafts", "--firestore-assets"],
    ["--administrative-drafts", "--project", "production"], ["--config", "firebase.json"], ["--bucket", "production"]])
    assert.throws(() => selectedModes(args), /runner_accepts_only_fixed_artifact_modes/);
});
