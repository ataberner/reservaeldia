import test from "node:test";
import assert from "node:assert/strict";

import { getRemainingParts } from "./countdownUtils.js";

const FROZEN_NOW = Date.parse("2030-06-15T12:00:00.000Z");

test("editor countdown uses freezeZero for empty and invalid targets", () => {
  const empty = getRemainingParts("", FROZEN_NOW);
  const invalid = getRemainingParts("invalid", FROZEN_NOW);

  assert.deepEqual([empty.d, empty.h, empty.m, empty.s], [0, 0, 0, 0]);
  assert.deepEqual([invalid.d, invalid.h, invalid.m, invalid.s], [0, 0, 0, 0]);
  assert.equal(empty.invalid, true);
  assert.equal(invalid.invalid, true);
});

test("editor countdown freezes expired targets at zero without replacing content", () => {
  const expired = getRemainingParts(
    "2030-06-15T11:59:59.000Z",
    FROZEN_NOW
  );

  assert.equal(expired.ended, true);
  assert.equal(expired.policy, "freezeZero");
  assert.deepEqual(
    [expired.d, expired.h, expired.m, expired.s],
    [0, 0, 0, 0]
  );
});

test("editor countdown uses the frozen clock for deterministic remaining parts", () => {
  const running = getRemainingParts(
    "2030-06-17T15:04:05.000Z",
    FROZEN_NOW
  );
  assert.deepEqual(
    [running.d, running.h, running.m, running.s],
    [2, 3, 4, 5]
  );
});
