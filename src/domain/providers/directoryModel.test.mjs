import test from "node:test";
import assert from "node:assert/strict";
import { directoryCanFilter, directoryCapacity, directoryContact, directoryErrorState, directoryLocation, directoryPrice, directoryPriceDate, directoryWebUrl } from "./directoryModel.js";

test("unknown capacity and price stay unknown, while approved ranges/price use explicit units", () => {
  assert.equal(directoryCapacity({ capacidadMinima: null, capacidadMaxima: null }), "Capacidad sin informar");
  assert.equal(directoryCapacity({ capacidadMinima: 0 }), "Capacidad sin informar");
  assert.equal(directoryCapacity({ capacidadMinima: 50, capacidadMaxima: 200 }), "50–200 personas");
  assert.equal(directoryCapacity({ capacidadMaxima: 200 }), "Hasta 200 personas");
  assert.equal(directoryPrice(null), "Consultar presupuesto");
  assert.equal(directoryPrice({ modalidad: "desde", importe: -1 }), "Consultar presupuesto");
  assert.match(directoryPrice({ modalidad: "desde", importe: 100, moneda: "ARS", unidad: "evento" }), /Desde.*100.*por evento/);
  assert.equal(directoryPriceDate("invalid"), null);
  assert.equal(directoryLocation({ ciudad: "Rosario", provincia: "Santa Fe" }), "Rosario, Santa Fe");
});

test("contact destinations cannot inject schemes or mail headers and web links only allow HTTP(S)", () => {
  assert.equal(directoryContact({ whatsapp: "+54 (11) 5555-0000" }, "whatsapp"), "https://wa.me/541155550000");
  assert.equal(directoryContact({ whatsapp: "javascript:alert(1)" }, "whatsapp"), null);
  assert.equal(directoryContact({ email: "synthetic@example.test" }, "email"), "mailto:synthetic%40example.test");
  assert.equal(directoryContact({ email: "synthetic@example.test\r\nBcc:other@example.test" }, "email"), null);
  assert.equal(directoryWebUrl("javascript:alert(1)"), null);
  assert.equal(directoryWebUrl("https://user:password@example.test"), null);
  assert.equal(directoryWebUrl("https://example.test/business"), "https://example.test/business");
});

test("directory failures distinguish denial, removed provider, closed beta and retryable error", () => {
  assert.equal(directoryErrorState({ code: "functions/permission-denied" }).status, "forbidden");
  assert.equal(directoryErrorState({ code: "functions/not-found" }).status, "unavailable");
  assert.equal(directoryErrorState({ code: "functions/invalid-argument" }).status, "invalid");
  assert.equal(directoryErrorState({ code: "functions/failed-precondition" }).status, "closed");
  const limit = directoryErrorState({ code: "functions/resource-exhausted", message: "PRIVATE_INTERNAL_LIMIT" });
  assert.equal(limit.status, "limit"); assert.match(limit.message, /límite de la beta.*Administración/); assert.doesNotMatch(limit.message, /PRIVATE_|Volvé a intentar/);
  assert.equal(directoryErrorState(new Error("synthetic private server text")).status, "error");
  assert.doesNotMatch(directoryErrorState(new Error("PRIVATE")).message, /PRIVATE/);
});

test("recoverable query failures keep filters available, access failures keep them closed", () => {
  for (const status of ["ready", "error", "limit", "invalid"]) assert.equal(directoryCanFilter({ catalog: {}, status }), true);
  for (const status of ["loading", "closed", "forbidden", "unavailable"]) assert.equal(directoryCanFilter({ catalog: {}, status }), false);
  assert.equal(directoryCanFilter({ catalog: null, status: "error" }), false);
});
