import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actionsSource = readFileSync(
  new URL("./SectionActionsOverlay.jsx", import.meta.url),
  "utf8"
);
const sectionsManagerSource = readFileSync(
  new URL("../sections/useSectionsManager.js", import.meta.url),
  "utf8"
);

test("mobile adaptation is exposed without an admin role gate", () => {
  assert.match(
    actionsSource,
    /const canToggleMobileLayoutMode = Boolean\(\s*typeof toggleMobileLayoutModeSeccion === "function"\s*\)/
  );
  assert.match(
    actionsSource,
    /\{canToggleMobileLayoutMode \? \([\s\S]*?title=\{mobileReflowLabel\}/
  );
  assert.match(
    actionsSource,
    /\.\.\.\(canToggleMobileLayoutMode[\s\S]*?id: "mobile-reflow"[\s\S]*?title: mobileReflowLabel/
  );

  const toggleOwner = sectionsManagerSource.match(
    /const toggleMobileLayoutModeSeccion = useCallback\([\s\S]*?\/\/ C\) Crear secci/
  )?.[0];

  assert.ok(toggleOwner, "expected to find the mobile layout mutation owner");
  assert.doesNotMatch(toggleOwner, /canManageSite/);
  assert.match(toggleOwner, /canMutateSection\(targetSection\)/);
});

test("mobile adaptation uses the requested descriptive label", () => {
  assert.match(actionsSource, /mobileReflow: "Adaptar para celular"/);
  assert.doesNotMatch(actionsSource, /Reflow movil:/);
});
