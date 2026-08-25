import assert from "node:assert/strict";
import test from "node:test";

import {
  COVER_IMAGE_SOURCE_KINDS,
  normalizeCoverImageSource,
} from "./coverImageContract.mjs";

test("normalizes the exact canvas object or section background marked as cover", () => {
  assert.deepEqual(
    normalizeCoverImageSource({
      kind: COVER_IMAGE_SOURCE_KINDS.CANVAS_OBJECT,
      objectId: "  hero-image  ",
      ignored: true,
    }),
    { kind: "canvas-object", objectId: "hero-image" }
  );
  assert.deepEqual(
    normalizeCoverImageSource({
      kind: COVER_IMAGE_SOURCE_KINDS.SECTION_BACKGROUND,
      sectionId: "  hero-section  ",
    }),
    { kind: "section-background", sectionId: "hero-section" }
  );
});

test("rejects incomplete or unsupported cover identities", () => {
  assert.equal(normalizeCoverImageSource(null), null);
  assert.equal(
    normalizeCoverImageSource({ kind: "canvas-object", objectId: "" }),
    null
  );
  assert.equal(
    normalizeCoverImageSource({ kind: "first-section-background" }),
    null
  );
});
