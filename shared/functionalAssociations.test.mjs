import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFunctionalAssociationsToRenderState,
  normalizeFunctionalConfigs,
  resolveGroupAbsoluteBounds,
  sanitizeMovedGroupFunctionalAssociation,
  setGroupFunctionalAssociation,
  setSectionFunctionalAssociation,
} from "./functionalAssociations.js";

const sections = [
  { id: "hero", orden: 0, altura: 400 },
  { id: "shared", orden: 1, altura: 400 },
  { id: "gifts", orden: 2, altura: 400 },
];

function group({
  id,
  seccionId = "shared",
  association,
  x,
  y = 40,
  width = 140,
  height = 120,
  children = null,
  rotation = 0,
} = {}) {
  return {
    id,
    tipo: "grupo",
    seccionId,
    x,
    y,
    width,
    height,
    rotation,
    functionalAssociation: association,
    children:
      children ||
      [
        { id: `${id}-title`, tipo: "texto", x: 0, y: 0, width, height: 30 },
        { id: `${id}-button`, tipo: association === "gifts" ? "regalo-boton" : "rsvp-boton", x: 10, y: 60, width: width - 20, height: 40 },
      ],
  };
}

test("section association hides the entire inactive section and keeps always-visible sections", () => {
  const result = applyFunctionalAssociationsToRenderState({
    secciones: [
      { id: "hero", orden: 0, altura: 400 },
      { id: "rsvp", orden: 1, altura: 400, functionalAssociation: "rsvp" },
      { id: "gifts", orden: 2, altura: 400, functionalAssociation: "gifts" },
    ],
    objetos: [
      { id: "hero-text", tipo: "texto", seccionId: "hero" },
      { id: "rsvp-text", tipo: "texto", seccionId: "rsvp" },
      { id: "gift-text", tipo: "texto", seccionId: "gifts" },
    ],
    rsvp: { enabled: true },
    gifts: { enabled: false },
  });

  assert.deepEqual(result.secciones.map((section) => section.id), ["hero", "rsvp"]);
  assert.deepEqual(result.objetos.map((object) => object.id), ["hero-text", "rsvp-text"]);
  assert.deepEqual(result.hiddenSectionIds, ["gifts"]);
});

test("shared section renders both functional groups in original positions when both features are enabled", () => {
  const rsvpGroup = group({ id: "rsvp-group", association: "rsvp", x: 90 });
  const giftsGroup = group({ id: "gifts-group", association: "gifts", x: 560 });
  const result = applyFunctionalAssociationsToRenderState({
    secciones: sections,
    objetos: [
      { id: "shared-title", tipo: "texto", seccionId: "shared", x: 300, y: 10, width: 200, height: 30 },
      rsvpGroup,
      giftsGroup,
    ],
    rsvp: { enabled: true },
    gifts: { enabled: true },
  });

  assert.deepEqual(result.hiddenSectionIds, []);
  assert.deepEqual(result.centeredGroupDeltas, {});
  assert.equal(result.objetos.find((object) => object.id === "rsvp-group").x, 90);
  assert.equal(result.objetos.find((object) => object.id === "gifts-group").x, 560);
});

test("shared section centers all visible RSVP groups as a joint bounding box when gifts are disabled", () => {
  const result = applyFunctionalAssociationsToRenderState({
    secciones: sections,
    objetos: [
      { id: "shared-title", tipo: "texto", seccionId: "shared", x: 300, y: 10, width: 200, height: 30 },
      group({ id: "rsvp-left", association: "rsvp", x: 80, width: 100 }),
      group({ id: "rsvp-right", association: "rsvp", x: 240, width: 100 }),
      group({ id: "gifts-group", association: "gifts", x: 560, width: 120 }),
    ],
    rsvp: { enabled: true },
    gifts: { enabled: false },
  });

  assert.deepEqual(result.objetos.map((object) => object.id), ["shared-title", "rsvp-left", "rsvp-right"]);
  assert.equal(result.centeredGroupDeltas["rsvp-left"], 190);
  assert.equal(result.centeredGroupDeltas["rsvp-right"], 190);
  assert.equal(result.objetos.find((object) => object.id === "rsvp-left").x, 270);
  assert.equal(result.objetos.find((object) => object.id === "rsvp-right").x, 430);
});

test("shared elements hide with the section when no functional group remains active", () => {
  const result = applyFunctionalAssociationsToRenderState({
    secciones: sections,
    objetos: [
      { id: "shared-title", tipo: "texto", seccionId: "shared", x: 300, y: 10, width: 200, height: 30 },
      group({ id: "rsvp-group", association: "rsvp", x: 90 }),
      group({ id: "gifts-group", association: "gifts", x: 560 }),
    ],
    rsvp: { enabled: false },
    gifts: { enabled: false },
  });

  assert.equal(result.secciones.some((section) => section.id === "shared"), false);
  assert.equal(result.objetos.some((object) => object.seccionId === "shared"), false);
});

test("derived centering does not accumulate when repeated from source state", () => {
  const sourceObjetos = [
    group({ id: "rsvp-group", association: "rsvp", x: 80, width: 100 }),
    group({ id: "gifts-group", association: "gifts", x: 560, width: 120 }),
  ];
  const first = applyFunctionalAssociationsToRenderState({
    secciones: sections,
    objetos: sourceObjetos,
    rsvp: { enabled: true },
    gifts: { enabled: false },
  });
  const second = applyFunctionalAssociationsToRenderState({
    secciones: sections,
    objetos: sourceObjetos,
    rsvp: { enabled: true },
    gifts: { enabled: false },
  });

  assert.equal(first.objetos.find((object) => object.id === "rsvp-group").x, 350);
  assert.equal(second.objetos.find((object) => object.id === "rsvp-group").x, 350);
  assert.equal(sourceObjetos[0].x, 80);
});

test("visual offset mode keeps source x and exposes render offset for editor canvas", () => {
  const result = applyFunctionalAssociationsToRenderState({
    secciones: sections,
    objetos: [
      group({ id: "rsvp-group", association: "rsvp", x: 80, width: 100 }),
      group({ id: "gifts-group", association: "gifts", x: 560, width: 120 }),
    ],
    rsvp: { enabled: true },
    gifts: { enabled: false },
    materializeOffsets: false,
  });
  const rendered = result.objetos.find((object) => object.id === "rsvp-group");

  assert.equal(rendered.x, 80);
  assert.equal(rendered.__functionalRenderOffsetX, 270);
});

test("CTA visibility follows enabled even when legacy hidden disagrees", () => {
  const result = applyFunctionalAssociationsToRenderState({
    secciones: [{ id: "hero", orden: 0, altura: 400 }],
    objetos: [
      { id: "cta-rsvp", tipo: "rsvp-boton", seccionId: "hero", hidden: true },
      { id: "cta-gift", tipo: "regalo-boton", seccionId: "hero", hidden: false },
    ],
    rsvp: { enabled: true },
    gifts: { enabled: false },
  });

  assert.equal(result.objetos.find((object) => object.id === "cta-rsvp").hidden, false);
  assert.equal(result.objetos.find((object) => object.id === "cta-gift").hidden, true);
});

test("legacy configs normalize to enabled from visible CTA when enabled is missing", () => {
  const normalized = normalizeFunctionalConfigs({
    objetos: [{ id: "cta-rsvp", tipo: "rsvp-boton", hidden: false }],
    rsvp: { title: "Legacy RSVP" },
    gifts: null,
  });

  assert.equal(normalized.rsvp.enabled, true);
  assert.equal(normalized.gifts, null);
});

test("event details mode drives ceremony and party section visibility", () => {
  const single = applyFunctionalAssociationsToRenderState({
    secciones: [
      { id: "ceremony", orden: 0, altura: 400, functionalAssociation: "ceremony" },
      { id: "party", orden: 1, altura: 400, functionalAssociation: "party" },
    ],
    objetos: [
      { id: "ceremony-text", tipo: "texto", seccionId: "ceremony" },
      { id: "party-text", tipo: "texto", seccionId: "party" },
    ],
    eventDetails: { mode: "single" },
  });
  const double = applyFunctionalAssociationsToRenderState({
    secciones: [
      { id: "ceremony", orden: 0, altura: 400, functionalAssociation: "ceremony" },
      { id: "party", orden: 1, altura: 400, functionalAssociation: "party" },
    ],
    objetos: [
      { id: "ceremony-text", tipo: "texto", seccionId: "ceremony" },
      { id: "party-text", tipo: "texto", seccionId: "party" },
    ],
    eventDetails: { mode: "ceremony_party" },
  });

  assert.deepEqual(single.secciones.map((section) => section.id), ["ceremony"]);
  assert.deepEqual(single.objetos.map((object) => object.id), ["ceremony-text"]);
  assert.deepEqual(double.secciones.map((section) => section.id), ["ceremony", "party"]);
});

test("dress code enabled state drives complete section visibility", () => {
  const hidden = applyFunctionalAssociationsToRenderState({
    secciones: [
      { id: "dress", orden: 0, altura: 400, functionalAssociation: "dress_code" },
      { id: "shared", orden: 1, altura: 400 },
    ],
    objetos: [
      { id: "dress-title", tipo: "texto", seccionId: "dress" },
      { id: "shared-title", tipo: "texto", seccionId: "shared" },
    ],
    eventDetails: {
      mode: "single",
      dressCode: { enabled: false, value: "Formal" },
    },
  });
  const visible = applyFunctionalAssociationsToRenderState({
    secciones: [
      { id: "dress", orden: 0, altura: 400, functionalAssociation: "dress_code" },
      { id: "shared", orden: 1, altura: 400 },
    ],
    objetos: [
      { id: "dress-title", tipo: "texto", seccionId: "dress" },
      { id: "shared-title", tipo: "texto", seccionId: "shared" },
    ],
    eventDetails: {
      mode: "single",
      dressCode: { enabled: true, value: "Formal" },
    },
  });

  assert.deepEqual(hidden.secciones.map((section) => section.id), ["shared"]);
  assert.deepEqual(hidden.objetos.map((object) => object.id), ["shared-title"]);
  assert.deepEqual(visible.secciones.map((section) => section.id), ["dress", "shared"]);
});

test("shared section centers all visible dress code groups when it is the only active functionality", () => {
  const result = applyFunctionalAssociationsToRenderState({
    secciones: sections,
    objetos: [
      { id: "shared-title", tipo: "texto", seccionId: "shared", x: 300, y: 10, width: 200, height: 30 },
      group({ id: "dress-left", association: "dress_code", x: 80, width: 100 }),
      group({ id: "dress-right", association: "dress_code", x: 240, width: 100 }),
      group({ id: "party-group", association: "party", x: 560, width: 120 }),
    ],
    eventDetails: {
      mode: "single",
      dressCode: { enabled: true, value: "Elegante sport" },
    },
  });

  assert.deepEqual(result.objetos.map((object) => object.id), ["shared-title", "dress-left", "dress-right"]);
  assert.equal(result.centeredGroupDeltas["dress-left"], 190);
  assert.equal(result.centeredGroupDeltas["dress-right"], 190);
  assert.equal(result.objetos.find((object) => object.id === "dress-left").x, 270);
  assert.equal(result.objetos.find((object) => object.id === "dress-right").x, 430);
});

test("shared ceremony party section centers visible ceremony groups in single-event mode", () => {
  const result = applyFunctionalAssociationsToRenderState({
    secciones: sections,
    objetos: [
      { id: "shared-title", tipo: "texto", seccionId: "shared", x: 300, y: 10, width: 200, height: 30 },
      group({ id: "ceremony-group", association: "ceremony", x: 80, width: 100 }),
      group({ id: "party-group", association: "party", x: 560, width: 120 }),
    ],
    eventDetails: { mode: "single" },
  });

  assert.deepEqual(result.objetos.map((object) => object.id), ["shared-title", "ceremony-group"]);
  assert.equal(result.centeredGroupDeltas["ceremony-group"], 270);
  assert.equal(result.objetos.find((object) => object.id === "ceremony-group").x, 350);
});

test("shared ceremony party section keeps original positions when both event parts are active", () => {
  const result = applyFunctionalAssociationsToRenderState({
    secciones: sections,
    objetos: [
      group({ id: "ceremony-group", association: "ceremony", x: 80, width: 100 }),
      group({ id: "party-group", association: "party", x: 560, width: 120 }),
    ],
    eventDetails: { mode: "ceremony_party" },
  });

  assert.deepEqual(result.hiddenSectionIds, []);
  assert.deepEqual(result.centeredGroupDeltas, {});
  assert.equal(result.objetos.find((object) => object.id === "ceremony-group").x, 80);
  assert.equal(result.objetos.find((object) => object.id === "party-group").x, 560);
});

test("party and ceremony allow multiple groups for the same functionality", () => {
  const baseSections = [{ id: "shared", orden: 0, altura: 400 }];
  const baseObjects = [
    group({ id: "party-a", association: "party", x: 80 }),
    group({ id: "party-b", association: "party", x: 240 }),
    group({ id: "party-c", x: 420 }),
  ];

  const assigned = setGroupFunctionalAssociation({
    secciones: baseSections,
    objetos: baseObjects,
    groupId: "party-c",
    association: "party",
  });
  assert.equal(assigned.objetos.find((object) => object.id === "party-a").functionalAssociation, "party");
  assert.equal(assigned.objetos.find((object) => object.id === "party-b").functionalAssociation, "party");
  assert.equal(assigned.objetos.find((object) => object.id === "party-c").functionalAssociation, "party");

  const moved = sanitizeMovedGroupFunctionalAssociation({
    secciones: [
      { id: "source", orden: 0, altura: 400 },
      { id: "target", orden: 1, altura: 400 },
    ],
    objetos: [
      group({ id: "moved-party", seccionId: "target", association: "party", x: 80 }),
      group({ id: "existing-party", seccionId: "target", association: "party", x: 300 }),
    ],
    groupId: "moved-party",
    previousSectionId: "source",
  });

  assert.equal(moved.changed, false);
  assert.equal(moved.objetos[0].functionalAssociation, "party");
  assert.equal(moved.objetos[1].functionalAssociation, "party");
});

test("rotated child bounds are included in group bounds", () => {
  const bounds = resolveGroupAbsoluteBounds(
    group({
      id: "rotated",
      association: "rsvp",
      x: 100,
      children: [
        { id: "rotated-child", tipo: "texto", x: 0, y: 0, width: 100, height: 20, rotation: 90 },
      ],
    })
  );

  assert.equal(Math.round(bounds.left), 80);
  assert.equal(Math.round(bounds.right), 100);
});

test("section and group assignment helpers resolve conflicts explicitly", () => {
  const baseSections = [{ id: "shared", orden: 0, altura: 400 }];
  const baseObjects = [
    group({ id: "rsvp-group", association: "rsvp", x: 80 }),
    group({ id: "other-rsvp-group", association: "rsvp", x: 240 }),
    group({ id: "gifts-group", association: "gifts", x: 560 }),
  ];

  const sectionResult = setSectionFunctionalAssociation({
    secciones: baseSections,
    objetos: baseObjects,
    sectionId: "shared",
    association: "gifts",
  });
  assert.equal(sectionResult.secciones[0].functionalAssociation, "gifts");
  assert.equal(sectionResult.objetos.some((object) => object.functionalAssociation), false);

  const groupResult = setGroupFunctionalAssociation({
    secciones: [{ id: "shared", orden: 0, altura: 400, functionalAssociation: "rsvp" }],
    objetos: baseObjects,
    groupId: "rsvp-group",
    association: "rsvp",
  });
  assert.equal("functionalAssociation" in groupResult.secciones[0], false);
  assert.equal(groupResult.objetos.find((object) => object.id === "rsvp-group").functionalAssociation, "rsvp");
  assert.equal("functionalAssociation" in groupResult.objetos.find((object) => object.id === "other-rsvp-group"), false);
});

test("moved functional groups keep association only without destination conflicts", () => {
  const noConflict = sanitizeMovedGroupFunctionalAssociation({
    secciones: [
      { id: "source", orden: 0, altura: 400 },
      { id: "target", orden: 1, altura: 400 },
    ],
    objetos: [
      group({ id: "rsvp-group", seccionId: "target", association: "rsvp", x: 80 }),
      group({ id: "gifts-group", seccionId: "target", association: "gifts", x: 300 }),
    ],
    groupId: "rsvp-group",
    previousSectionId: "source",
  });
  assert.equal(noConflict.changed, false);
  assert.equal(noConflict.objetos[0].functionalAssociation, "rsvp");

  const sectionConflict = sanitizeMovedGroupFunctionalAssociation({
    secciones: [
      { id: "source", orden: 0, altura: 400 },
      { id: "target", orden: 1, altura: 400, functionalAssociation: "gifts" },
    ],
    objetos: [
      group({ id: "rsvp-group", seccionId: "target", association: "rsvp", x: 80 }),
    ],
    groupId: "rsvp-group",
    previousSectionId: "source",
  });
  assert.equal(sectionConflict.changed, true);
  assert.equal("functionalAssociation" in sectionConflict.objetos[0], false);

  const groupConflict = sanitizeMovedGroupFunctionalAssociation({
    secciones: [
      { id: "source", orden: 0, altura: 400 },
      { id: "target", orden: 1, altura: 400 },
    ],
    objetos: [
      group({ id: "moved-rsvp", seccionId: "target", association: "rsvp", x: 80 }),
      group({ id: "existing-rsvp", seccionId: "target", association: "rsvp", x: 300 }),
    ],
    groupId: "moved-rsvp",
    previousSectionId: "source",
  });
  assert.equal(groupConflict.changed, true);
  assert.equal("functionalAssociation" in groupConflict.objetos[0], false);
  assert.equal(groupConflict.objetos[1].functionalAssociation, "rsvp");
});
