import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DEFAULT_TEXT_ALIGNMENT,
  DEFAULT_TEXT_BOX_WIDTH,
  DEFAULT_TEXT_WRAP_MODE,
  resolveTextInsertAlignment,
} from "./insertions.js";

const computeInsertDefaultsSource = readFileSync(
  new URL("../../components/editor/events/computeInsertDefaults.js", import.meta.url),
  "utf8"
);
const editorEventsSource = readFileSync(
  new URL("../../components/editor/events/useEditorEvents.js", import.meta.url),
  "utf8"
);

test("new text elements default to centered alignment", () => {
  assert.equal(DEFAULT_TEXT_ALIGNMENT, "center");
  assert.equal(resolveTextInsertAlignment(), "center");
  assert.equal(resolveTextInsertAlignment(null), "center");
});

test("new text elements share one fixed-width wrapping default", () => {
  assert.equal(DEFAULT_TEXT_BOX_WIDTH, 260);
  assert.equal(DEFAULT_TEXT_WRAP_MODE, "word");
  assert.match(
    computeInsertDefaultsSource,
    /width:\s*incomingWidth\s*\?\?\s*DEFAULT_TEXT_BOX_WIDTH/
  );
  assert.match(
    computeInsertDefaultsSource,
    /textWrapMode:\s*payload\.textWrapMode\s*\?\?\s*DEFAULT_TEXT_WRAP_MODE/
  );
  assert.match(
    editorEventsSource,
    /width:\s*DEFAULT_TEXT_BOX_WIDTH[\s\S]*__autoWidth:\s*false[\s\S]*textWrapMode:\s*DEFAULT_TEXT_WRAP_MODE/
  );
});

test("explicit text alignment from presets and insertion payloads is preserved", () => {
  assert.equal(resolveTextInsertAlignment("left"), "left");
  assert.equal(resolveTextInsertAlignment("center"), "center");
  assert.equal(resolveTextInsertAlignment("right"), "right");
});

test("all generic text insertion routes consume the shared alignment default", () => {
  assert.match(
    computeInsertDefaultsSource,
    /align:\s*resolveTextInsertAlignment\(payload\.align\)/
  );
  assert.match(
    editorEventsSource,
    /align:\s*resolveTextInsertAlignment\(\)/
  );
});
