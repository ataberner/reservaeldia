import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panelSource = readFileSync(new URL("./DesignerAiPanel.jsx", import.meta.url), "utf8");

test("starts a ledger-driven conversation internally and keeps the seed out of the visible chat", () => {
  assert.match(panelSource, /const AUTO_START_MESSAGE = .*primer bloque.*pendiente/);
  assert.doesNotMatch(panelSource, /primera capacidad disponible/);
  assert.doesNotMatch(panelSource, /aunque ya esté completa/);
  assert.match(
    panelSource,
    /submitMessageRef\.current\?\.\(AUTO_START_MESSAGE, \{ showUserMessage: false \}\)/
  );
  assert.match(panelSource, /showUserMessage\s*\? appendSessionMessages/);
});

test("reconciles every batch and completes trusted controls only after a real draft change", () => {
  assert.match(panelSource, /reconcileDesignerAiConversationState/);
  assert.match(panelSource, /baselineFingerprints/);
  assert.match(panelSource, /leafFingerprint\(snapshot, leafId\) !==/);
  assert.match(panelSource, /CONTROL_CONTINUE_MESSAGE/);
  assert.doesNotMatch(panelSource, /coveredCapabilityIds/);
});

test("waits for hydrated draft data and closes only from terminal ledger completeness", () => {
  assert.match(panelSource, /documentState\.hydrated !== true/);
  assert.match(panelSource, /finalSnapshot\.ledger\.completion\.complete/);
  assert.match(panelSource, /Listo, ya tenemos todo\. La información de la invitación quedó preparada/);
});

test("renders a conversation-only surface without technical application notices", () => {
  assert.doesNotMatch(panelSource, />Recorrer Todo Asistente</);
  assert.doesNotMatch(panelSource, />Edita solo las capacidades disponibles en Asistente\.</);
  assert.doesNotMatch(panelSource, /message\.status/);
  assert.doesNotMatch(panelSource, /Aplicado:/);
  assert.doesNotMatch(panelSource, /No fue necesario modificar el borrador\./);
});

test("does not join Designer AI to the Assistant Guided Tour", () => {
  assert.doesNotMatch(panelSource, /data-assistant-tour-/);
});
