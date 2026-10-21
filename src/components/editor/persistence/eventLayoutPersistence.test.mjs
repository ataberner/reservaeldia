import test from "node:test";
import assert from "node:assert/strict";
import { buildLoadedEditorRenderState, buildPersistableRenderState } from "./borradorSyncRenderState.js";
import { transitionEventLayoutMode } from "../../../../shared/eventLayout.js";

const persist = state => buildPersistableRenderState({ ...state, ALTURA_PANTALLA_EDITOR: 500, validarPuntosLinea: object => object });

test("event compositions survive persistence and reload, retaining hidden roots and independent positions", () => {
  const legacy = {
    objetos: [
      { id: "c", tipo: "forma", figura: "rect", x: 240, y: 100, yNorm: 0.2, width: 100, height: 40, seccionId: "s", functionalAssociation: "ceremony" },
      { id: "p", tipo: "forma", figura: "rect", x: 550, y: 100, yNorm: 0.2, width: 100, height: 40, seccionId: "s", functionalAssociation: "party" },
    ],
    secciones: [{ id: "s", altura: 500, altoModo: "pantalla" }],
    eventDetails: { mode: "ceremony_party" },
  };
  const single = transitionEventLayoutMode({ ...legacy, nextMode: "single" });
  single.objetos[0] = { ...single.objetos[0], x: 420, y: 150, yNorm: 0.3 };
  const saved = persist(single);
  const loaded = { ...buildLoadedEditorRenderState({ ...JSON.parse(JSON.stringify(saved)), ALTURA_PANTALLA_EDITOR: 500 }), eventDetails: saved.eventDetails };
  assert.equal(loaded.objetos[0].x, 420);
  assert.equal(loaded.objetos[0].yNorm, 0.3);
  const both = transitionEventLayoutMode({ ...loaded, nextMode: "ceremony_party" });
  assert.equal(both.objetos[0].x, 240);
  assert.equal(both.objetos[0].yNorm, 0.2);
  assert.equal(both.objetos[1].x, 550);
  assert.deepEqual(transitionEventLayoutMode({ ...both, nextMode: "single" }).objetos[0], loaded.objetos[0]);
});

test("editor-only event layout markers are never persisted, including group children", () => {
  const saved = persist({ objetos: [{ id: "g", tipo: "grupo", __eventLayoutManaged: true, children: [{ id: "c", tipo: "texto", texto: "A", __eventLayoutManaged: true }] }], secciones: [] });
  assert.equal("__eventLayoutManaged" in saved.objetos[0], false);
  assert.equal("__eventLayoutManaged" in saved.objetos[0].children[0], false);
});
