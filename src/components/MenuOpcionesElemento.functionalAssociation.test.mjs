import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./MenuOpcionesElemento.jsx", import.meta.url),
  "utf8"
);

test("multi-selection assigns standalone associations without invoking structural grouping", () => {
  const handlerStart = source.indexOf("const handleFunctionalAssociationChange");
  const handlerEnd = source.indexOf("useEffect(() =>", handlerStart);
  assert.notEqual(handlerStart, -1);
  assert.notEqual(handlerEnd, -1);

  const handlerSource = source.slice(handlerStart, handlerEnd);
  assert.match(handlerSource, /setStandaloneFunctionalAssociation\(\{/);
  assert.match(handlerSource, /objectIds: multiSelectionIds/);
  assert.doesNotMatch(handlerSource, /onAgrupar/);
});

test("standalone and group controls expose every supported association", () => {
  assert.match(source, /MIXED_FUNCTIONAL_ASSOCIATION_VALUE/);
  assert.match(source, /Varias asociaciones/);
  assert.match(source, /Se aplica a cada elemento sin agrupar la seleccion/);
  assert.match(source, /<option value="rsvp">Confirmacion de asistencia<\/option>/);
  assert.match(source, /<option value="gifts">Regalos<\/option>/);
  assert.match(source, /<option value="ceremony">Ceremonia<\/option>/);
  assert.match(source, /<option value="party">Fiesta<\/option>/);
  assert.match(source, /<option value="dress_code">Dress Code<\/option>/);
  assert.match(source, /onAgrupar\?\.\(\)/);
  assert.match(source, /Agrupar elementos/);
});
