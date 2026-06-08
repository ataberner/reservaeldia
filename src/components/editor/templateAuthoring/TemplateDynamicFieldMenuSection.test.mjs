import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./TemplateDynamicFieldMenuSection.jsx", import.meta.url),
  "utf8"
);

test("dynamic field menu exposes only guided event detail bindings", () => {
  assert.doesNotMatch(source, /Configurar como campo dinamico/);
  assert.doesNotMatch(source, /Editar configuracion del campo/);
  assert.doesNotMatch(source, /Vincular a campo existente/);
  assert.doesNotMatch(source, />\s*Label\s*</);
  assert.doesNotMatch(source, />\s*Tipo\s*</);
  assert.doesNotMatch(source, /Campo opcional/);

  assert.match(source, /Vincular a fecha del evento/);
  assert.match(source, /Vincular a primera persona/);
  assert.match(source, /Vincular a segunda persona/);
  assert.match(source, /Vincular a nombres juntos/);
  assert.match(source, /Vincular a nombre del lugar/);
  assert.match(source, /Vincular a direccion/);
  assert.match(source, /Vincular a Hora inicio/);
  assert.match(source, /Vincular a Hora fin/);
});
