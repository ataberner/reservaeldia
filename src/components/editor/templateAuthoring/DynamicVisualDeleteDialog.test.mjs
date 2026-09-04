import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./DynamicVisualDeleteDialog.jsx", import.meta.url),
  "utf8"
);

test("dynamic visual deletion is an accessible modal alertdialog", () => {
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby=\{titleId\}/);
  assert.match(source, /aria-describedby=\{describedBy\}/);
  assert.match(source, /role="alert"/);
});

test("dialog keeps the promised product copy and async states", () => {
  assert.match(source, /Quitar de la invitación/);
  assert.match(source, /Vas a quitar \$\{formatFieldLabels\(labels\)\} de la invitación/);
  assert.match(source, /La información seguirá guardada/);
  assert.match(source, /buscá ese campo/);
  assert.match(source, /buscá cada campo/);
  assert.match(source, /tocá “Volver a insertar”/);
  assert.match(source, /panel de datos/);
  assert.match(source, />\s*Cancelar\s*</);
  assert.match(source, /"Quitar"/);
  assert.match(source, /Quitando…/);
  assert.match(source, /aria-busy=\{isConfirming/);
});

test("dialog receives the affected field labels and keeps a safe fallback", () => {
  assert.match(source, /fieldLabels = \[\]/);
  assert.match(source, /buildDynamicVisualDeleteDescription\(fieldLabels\)/);
  assert.match(source, /Vas a quitar este contenido de la invitación/);
});

test("dialog owns focus entry, focus trapping, Escape and focus return", () => {
  assert.match(source, /cancelRef\.current\?\.focus/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /event\.shiftKey && activeElement === first/);
  assert.match(source, /activeElement === last/);
  assert.match(source, /onRestoreFocusRef\.current\(previouslyFocused\)/);
  assert.match(source, /previouslyFocused\.focus/);
});

test("dialog is anchored on desktop and remains a compact touch-safe mobile card", () => {
  assert.match(source, /computeDynamicVisualDeleteDialogPosition/);
  assert.match(source, /const DESKTOP_DIALOG_WIDTH = 340/);
  assert.match(source, /const DESKTOP_DIALOG_HEIGHT = 212/);
  assert.match(source, /inset-x-3 bottom-\[max\(12px,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(source, /h-fit max-h-\[calc\(100dvh-24px\)\]/);
  assert.match(source, /mx-auto[^"]*max-w-\[340px\]/);
  assert.match(source, /overflow-y-auto rounded-\[18px\]/);
  assert.match(source, /bg-white p-\[14px\]/);
  assert.match(source, /sm:left-\[var\(--dynamic-delete-left\)\]/);
  assert.match(source, /sm:top-\[var\(--dynamic-delete-top\)\]/);
  assert.match(source, /sm:w-\[340px\]/);
  assert.doesNotMatch(source, /<section/);
  assert.match(source, /min-h-10 min-w-10/);
  assert.match(source, /motion-reduce:transition-none/);
  assert.match(source, /motion-reduce:animate-none/);
});

test("eye-off icon stays compact and does not reserve a separate content column", () => {
  assert.match(source, /className="flex items-center gap-2"/);
  assert.match(source, /className="h-4 w-4 shrink-0 text-\[#692b9a\]"/);
  assert.doesNotMatch(source, /flex h-10 w-10 shrink-0/);
  assert.doesNotMatch(source, /flex items-start gap-3/);
});
