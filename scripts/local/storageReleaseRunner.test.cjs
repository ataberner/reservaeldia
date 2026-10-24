const test = require("node:test");
const assert = require("node:assert/strict");
const { selectedModes } = require("./runStorageRelease.cjs");

test("default remains the two Storage artifacts in order", () => assert.deepEqual(selectedModes([]), ["base", "candidate"]));
test("fixed Firestore mode does not repeat the approved Storage suites", () => assert.deepEqual(selectedModes(["--firestore-assets"]), ["firestore-assets"]));
test("reject unknown modes, repeated flags and any destination overrides before starting services", () => {
  for (const args of [["candidate"], ["--project", "production"], ["--firestore-assets", "--project", "production"],
    ["--firestore-assets", "--firestore-assets"], ["--config", "firebase.json"], ["--bucket", "production"]])
    assert.throws(() => selectedModes(args), /runner_accepts_only_fixed_firestore_assets_mode/);
});
