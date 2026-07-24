import test from "node:test";
import assert from "node:assert/strict";
import {
  COUNTDOWN_VISUAL_BASELINE_FROZEN_NOW_ISO,
  COUNTDOWN_VISUAL_BASELINE_SURFACES,
  buildCountdownVisualBaselineFixtureManifest,
  countdownVisualBaselineStates,
} from "./countdownVisualBaselineFixtures.mjs";

function computeParts(targetISO, nowISO) {
  const diff = Math.max(
    0,
    new Date(targetISO).getTime() - new Date(nowISO).getTime()
  );
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff / 3600000) % 24),
    minutes: Math.floor((diff / 60000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    expired: new Date(targetISO).getTime() <= new Date(nowISO).getTime(),
  };
}

test("countdown visual baseline freezes all required temporal states", () => {
  assert.deepEqual(
    countdownVisualBaselineStates.map((state) => state.id),
    ["days", "hours", "seconds", "expired"]
  );
  countdownVisualBaselineStates.forEach((state) => {
    assert.deepEqual(
      computeParts(
        state.targetISO,
        COUNTDOWN_VISUAL_BASELINE_FROZEN_NOW_ISO
      ),
      state.expected
    );
  });
});

test("countdown visual baseline reserves builder, canvas, preview, publication and mobile", () => {
  assert.deepEqual(COUNTDOWN_VISUAL_BASELINE_SURFACES, [
    "builder",
    "canvas",
    "preview",
    "publication",
    "mobile",
  ]);
  const manifest = buildCountdownVisualBaselineFixtureManifest();
  assert.equal(manifest.frozenNowISO, "2030-06-15T12:00:00.000Z");
  assert.equal(manifest.states.length, 4);
});
