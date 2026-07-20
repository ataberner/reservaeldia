import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./DashboardHeader.jsx", import.meta.url)),
  "utf8"
);

test("dashboard header defers the shell CSS write outside ResizeObserver delivery", () => {
  assert.match(
    source,
    /const scheduleHeaderHeightVarUpdate = \(\) => \{[\s\S]*?requestAnimationFrame/
  );
  assert.match(
    source,
    /new ResizeObserver\(scheduleHeaderHeightVarUpdate\)/
  );
  assert.doesNotMatch(
    source,
    /new ResizeObserver\([^)]*updateHeaderHeightVar/
  );
});

test("dashboard header coalesces unchanged measurements and cancels scheduled cleanup", () => {
  assert.match(
    source,
    /getPropertyValue\([\s\S]*?--dashboard-header-height[\s\S]*?=== nextValue/
  );
  assert.match(source, /if \(updateFrame !== null\) return/);
  assert.match(source, /observer\.disconnect\(\)/);
  assert.match(source, /cancelAnimationFrame\(updateFrame\)/);
});
