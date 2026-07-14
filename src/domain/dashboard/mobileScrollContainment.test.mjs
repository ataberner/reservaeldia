import test from "node:test";
import assert from "node:assert/strict";

import { shouldPreventMobileScrollChain } from "./mobileScrollContainment.js";

test("mobile sidebar scroll allows movement while the panel can consume it", () => {
  assert.equal(
    shouldPreventMobileScrollChain({
      deltaY: 24,
      scrollTop: 40,
      scrollHeight: 400,
      clientHeight: 200,
    }),
    false
  );

  assert.equal(
    shouldPreventMobileScrollChain({
      deltaY: -24,
      scrollTop: 40,
      scrollHeight: 400,
      clientHeight: 200,
    }),
    false
  );
});

test("mobile sidebar scroll prevents chaining at the vertical edges", () => {
  assert.equal(
    shouldPreventMobileScrollChain({
      deltaY: -18,
      scrollTop: 0,
      scrollHeight: 400,
      clientHeight: 200,
    }),
    true
  );

  assert.equal(
    shouldPreventMobileScrollChain({
      deltaY: 18,
      scrollTop: 200,
      scrollHeight: 400,
      clientHeight: 200,
    }),
    true
  );
});

test("mobile sidebar scroll prevents chaining when content is not scrollable", () => {
  assert.equal(
    shouldPreventMobileScrollChain({
      deltaY: 18,
      scrollTop: 0,
      scrollHeight: 200,
      clientHeight: 200,
    }),
    true
  );
});

test("mobile sidebar scroll ignores tiny deltas", () => {
  assert.equal(
    shouldPreventMobileScrollChain({
      deltaY: 0.25,
      scrollTop: 0,
      scrollHeight: 200,
      clientHeight: 200,
    }),
    false
  );
});
