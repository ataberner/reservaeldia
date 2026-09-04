import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./SectionActionsOverlay.jsx", import.meta.url),
  "utf8"
);
const eventDetailsSource = readFileSync(
  new URL("../../MiniToolbarTabDetallesEvento.jsx", import.meta.url),
  "utf8"
);

test("admin section menus expose Countdown through the section-only association normalizer", () => {
  assert.match(source, /canManageSite &&[\s\S]*templateWorkspace\?\.mode === "template_edit"/);
  assert.match(source, /normalizeSectionFunctionalAssociation/);
  assert.equal(
    source.match(/<option value="countdown">Countdown<\/option>/g)?.length,
    2
  );
});

test("Detalles del evento delegates countdown visibility to the dynamic field owner", () => {
  assert.match(eventDetailsSource, /Mostrar contador con cuenta regresiva/);
  assert.match(
    eventDetailsSource,
    /updateLinkedFieldDefault\(details\.fieldKey,[\s\S]*representationVisibility: checked,[\s\S]*representationKind: "countdown"/
  );
  assert.doesNotMatch(eventDetailsSource, /dispatchCountdownPatch/);
});
