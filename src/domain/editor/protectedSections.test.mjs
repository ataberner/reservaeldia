import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_SECTION_LOCK_REASON,
  applySectionLockState,
  canEditObject,
  canEditObjectById,
  canInsertIntoSection,
  canMutateSection,
  filterEditableObjectIds,
  buildProtectedSectionObjectSanitizer,
  buildProtectedSectionStateSanitizer,
  isObjectInProtectedSection,
  isProtectedSection,
  placeSectionBeforeProtectedFinal,
  resolveProtectedFinalSection,
} from "./protectedSections.js";

const sections = [
  { id: "intro", orden: 0 },
  { id: "locked", orden: 1, bloqueada: true, bloqueoMotivo: "system-final-section" },
];

test("sections are protected only by explicit marker", () => {
  assert.equal(isProtectedSection({ id: "last", orden: 99 }), false);
  assert.equal(isProtectedSection({ id: "last", bloqueada: false }), false);
  assert.equal(isProtectedSection({ id: "last", bloqueada: "true" }), false);
  assert.equal(isProtectedSection({ id: "last", bloqueada: true }), true);
});

test("admin section lock helper writes and removes editor lock metadata", () => {
  const locked = applySectionLockState({ id: "sec-1", orden: 0 }, true);
  assert.equal(locked.bloqueada, true);
  assert.equal(locked.bloqueoMotivo, ADMIN_SECTION_LOCK_REASON);

  const unlocked = applySectionLockState(locked, false);
  assert.equal("bloqueada" in unlocked, false);
  assert.equal("bloqueoMotivo" in unlocked, false);
  assert.equal(unlocked.id, "sec-1");
});

test("section/object permissions follow explicit protected marker", () => {
  assert.equal(canMutateSection("intro", sections), true);
  assert.equal(canMutateSection("locked", sections), false);
  assert.equal(canInsertIntoSection("intro", sections), true);
  assert.equal(canInsertIntoSection("locked", sections), false);

  assert.equal(
    canEditObject({ id: "obj-1", seccionId: "intro" }, { secciones: sections }),
    true
  );
  assert.equal(
    isObjectInProtectedSection({ id: "obj-2", seccionId: "locked" }, { secciones: sections }),
    true
  );
});

test("group children inherit protected state from their root group", () => {
  const objetos = [
    {
      id: "group-1",
      tipo: "grupo",
      seccionId: "locked",
      children: [{ id: "child-1", tipo: "texto" }],
    },
  ];

  assert.equal(canEditObjectById("group-1", { objetos, secciones: sections }), false);
  assert.equal(canEditObjectById("child-1", { objetos, secciones: sections }), false);
  assert.deepEqual(filterEditableObjectIds(["group-1", "child-1"], { objetos, secciones: sections }), []);
});

test("new sections are inserted before an explicitly protected final section", () => {
  const next = placeSectionBeforeProtectedFinal(sections, { id: "middle", orden: 99 });
  assert.deepEqual(
    next.map((section) => [section.id, section.orden]),
    [
      ["intro", 0],
      ["middle", 1],
      ["locked", 2],
    ]
  );
  assert.equal(resolveProtectedFinalSection(next)?.id, "locked");
});

test("new sections append normally when the final section is not marked", () => {
  const next = placeSectionBeforeProtectedFinal([{ id: "intro", orden: 0 }], {
    id: "new",
    orden: 1,
  });
  assert.deepEqual(next.map((section) => section.id), ["intro", "new"]);
});

test("protected-state sanitizers restore locked sections and root objects", () => {
  const sanitizeObjects = buildProtectedSectionObjectSanitizer({
    currentObjetos: [
      { id: "editable-1", tipo: "texto", seccionId: "intro", texto: "A" },
      { id: "locked-1", tipo: "texto", seccionId: "locked", texto: "Original" },
    ],
    currentSecciones: sections,
  });
  const sanitizeSections = buildProtectedSectionStateSanitizer({
    currentSecciones: sections,
  });

  assert.deepEqual(
    sanitizeObjects([{ id: "locked-1", tipo: "texto", seccionId: "locked", texto: "Mutated" }]),
    [{ id: "locked-1", tipo: "texto", seccionId: "locked", texto: "Original" }]
  );
  assert.deepEqual(
    sanitizeSections([{ id: "locked", orden: 99, bloqueada: true }]),
    [{ id: "locked", orden: 1, bloqueada: true, bloqueoMotivo: "system-final-section" }]
  );
});
