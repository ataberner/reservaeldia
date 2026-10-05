import test from "node:test";
import assert from "node:assert/strict";
import { buildTemplateAuthoringTargetPatches } from "./targetApplication.js";
import { resolveTemplateTargetValue } from "../fieldValueResolver.js";
import { normalizeVisibleEventDateValue } from "../../eventDetails/date.js";

for (const [before, after] of [
  ["18|10|26", "24|12|26"], ["18/10/26", "24/12/26"],
  ["18/10/2026", "24/12/2026"], ["18.10.26", "24.12.26"],
  ["18.10.2026", "24.12.2026"], ["18 | 10 | 26", "24 | 12 | 26"],
  ["18 de octubre de 2026", "24 de diciembre de 2026"],
  ["18 de Octubre", "24 de Diciembre"],
]) {
  test(`AI date content preserves ${before}, style and binding metadata`, () => {
    const object = { id: "date", tipo: "texto", texto: before, x: 25, y: 80, fontFamily: "Georgia", fontSize: 30, fill: "#123456", textAlign: "left" };
    const field = { key: "event_ceremony_date", type: "date", eventDetailsRole: "ceremony_date",
      dateTextFormatPreset: "event_date_long_es_ar", applyTargets: [{ scope: "objeto", id: "date", path: "texto", transform: { kind: "date_to_text", preset: "event_date_long_es_ar" } }] };
    const originalField = structuredClone(field);
    const [{ patch }] = buildTemplateAuthoringTargetPatches({ field, value: "2026-12-24", objetos: [object], preservePresentation: true });
    assert.equal(patch.texto, after);
    assert.deepEqual(field, originalField);
    for (const key of ["fontFamily", "fontSize", "fill", "textAlign"]) assert.equal(({ ...object, ...patch })[key], object[key]);
    assert.equal(object.texto, before);
    if (/26$/.test(after)) assert.equal(normalizeVisibleEventDateValue(after), "2026-12-24");
  });
}

test("time-only projection keeps date view and only changes displayed time where present", () => {
  const field = { type: "date" };
  const target = { path: "texto" };
  const project = (currentValue) => resolveTemplateTargetValue({ field, target, value: "2026-12-24T20:00", currentValue, preservePresentation: true });
  assert.equal(project("24|12|26"), "24|12|26");
  assert.equal(project("24.12.26, 18.30 hs."), "24.12.26, 20.00 hs.");
  assert.equal(project("24 de diciembre de 2026, 18:30"), "24 de diciembre de 2026, 20:00");
  for (const [currentValue, expected] of [["18.30 hs", "20.00 hs"], ["18:30", "20:00"], ["18 h", "20 h"]]) {
    assert.equal(resolveTemplateTargetValue({ field: { type: "time" }, target, value: "20:00", currentValue, preservePresentation: true }), expected);
  }
  assert.equal(resolveTemplateTargetValue({ field, target: { path: "fechaObjetivo" }, value: "2026-12-24", currentValue: "18|10|26", preservePresentation: true }).slice(0, 10), "2026-12-24");
});

test("explicit presentation operations still apply the binding preset; unknown text uses that preset", () => {
  const input = { field: { type: "date", dateTextFormatPreset: "event_date_short_es_ar" }, target: { path: "texto" }, value: "2026-12-24", currentValue: "18|10|26" };
  assert.equal(resolveTemplateTargetValue(input), "24/12/2026");
  assert.equal(resolveTemplateTargetValue({ ...input, currentValue: "Fecha a definir", preservePresentation: true }), "24/12/2026");
});
