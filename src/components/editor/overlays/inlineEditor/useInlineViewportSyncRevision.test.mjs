import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldTrackInlineViewportScroll,
} from "./useInlineViewportSyncRevision.js";

test("inline viewport sync tracks scroll in phase_atomic_v2 mode", () => {
  assert.equal(
    shouldTrackInlineViewportScroll({ isPhaseAtomicV2: true }),
    true
  );
});

test("inline viewport sync also tracks scroll in legacy mode", () => {
  assert.equal(
    shouldTrackInlineViewportScroll({ isPhaseAtomicV2: false }),
    true
  );
});
