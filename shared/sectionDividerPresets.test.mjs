import test from "node:test";
import assert from "node:assert/strict";

import {
  SECTION_DIVIDER_DEFAULT_HEIGHT,
  SECTION_DIVIDER_MAX_HEIGHT,
  SECTION_DIVIDER_MIN_HEIGHT,
  SECTION_DIVIDER_PRESETS,
  hasActiveSectionDividers,
  normalizeSectionDividers,
  resolveSectionDividerFillColor,
  resolveSectionDividerPreset,
  resolveSectionDividerRenderSlots,
} from "./sectionDividerPresets.js";

test("section divider catalog exposes stable unique presets with one shared SVG geometry", () => {
  assert.deepEqual(
    SECTION_DIVIDER_PRESETS.map((preset) => preset.id),
    [
      "none",
      "wave-soft",
      "wave-wide",
      "wave-double",
      "wave-asymmetric",
    ]
  );
  assert.equal(
    new Set(SECTION_DIVIDER_PRESETS.map((preset) => preset.id)).size,
    SECTION_DIVIDER_PRESETS.length
  );
  SECTION_DIVIDER_PRESETS.slice(1).forEach((preset) => {
    assert.equal(preset.viewBox, "0 0 1000 100");
    assert.match(preset.path, /^M0 /);
    assert.match(preset.path, / Z$/);
  });
});

test("legacy and invalid section divider values normalize safely", () => {
  assert.deepEqual(normalizeSectionDividers(undefined), {
    top: "none",
    bottom: "none",
    height: SECTION_DIVIDER_DEFAULT_HEIGHT,
  });
  assert.deepEqual(
    normalizeSectionDividers({
      top: "unknown",
      bottom: "wave-wide",
      height: 999,
    }),
    {
      top: "none",
      bottom: "wave-wide",
      height: SECTION_DIVIDER_MAX_HEIGHT,
    }
  );
  assert.equal(
    normalizeSectionDividers({ height: -20 }).height,
    SECTION_DIVIDER_MIN_HEIGHT
  );
  assert.equal(hasActiveSectionDividers(undefined), false);
  assert.equal(
    hasActiveSectionDividers({ top: "wave-soft" }),
    true
  );
  assert.equal(resolveSectionDividerPreset("invalid").id, "none");
});

test("section divider neighbor fill uses deterministic safe color fallbacks", () => {
  assert.equal(
    resolveSectionDividerFillColor(
      "linear-gradient(90deg, #f6d1e7, #7a3e9d)"
    ),
    "#f6d1e7"
  );
  assert.equal(resolveSectionDividerFillColor("rgb(10, 20, 30)"), "rgb(10, 20, 30)");
  assert.equal(
    resolveSectionDividerFillColor("url(javascript:alert(1))"),
    "#ffffff"
  );
});

test("each shared section boundary has one deterministic divider owner", () => {
  SECTION_DIVIDER_PRESETS.slice(1).forEach((preset) => {
    assert.deepEqual(
      resolveSectionDividerRenderSlots(
        {
          top: "none",
          bottom: preset.id,
          height: 84,
        },
        {
          nextDividers: {
            top: preset.id,
            bottom: "none",
            height: 68,
          },
        }
      ),
      {
        top: "none",
        bottom: "none",
        height: 84,
      }
    );
  });

  assert.deepEqual(
    resolveSectionDividerRenderSlots(
      {
        top: "wave-soft",
        bottom: "wave-double",
        height: 96,
      },
      { nextDividers: { top: "none" } }
    ),
    {
      top: "wave-soft",
      bottom: "wave-double",
      height: 96,
    }
  );
});
