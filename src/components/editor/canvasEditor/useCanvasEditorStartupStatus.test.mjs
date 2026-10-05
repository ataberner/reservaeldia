import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import * as backgrounds from "../../../domain/sections/backgrounds.js";
import { applyFunctionalAssociationsToRenderState } from "../../../../shared/functionalAssociations.js";

const require = createRequire(import.meta.url);
const ts = require("../../../../functions/node_modules/typescript");
const { JSDOM } = require("../../../../functions/node_modules/jsdom");
const source = readFileSync(new URL("./useCanvasEditorStartupStatus.js", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const hookModule = { exports: {} };
new Function("require", "module", "exports", outputText)((id) => {
  if (id === "react") return React;
  if (id === "@/domain/sections/backgrounds") return backgrounds;
  throw new Error(`Unexpected dependency: ${id}`);
}, hookModule, hookModule.exports);
const useStartup = hookModule.exports.default;

// Exercise the actual caller's argument mapping without mounting Firebase or
// the rest of the editor. React effects and the render visibility owner are real.
const canvasSource = readFileSync(new URL("../../CanvasEditor.jsx", import.meta.url), "utf8");
const startupArguments = canvasSource.match(/useCanvasEditorStartupStatus\((\{[\s\S]*?\})\);/)[1];
const mapStartupArguments = new Function(
  "slug", "secciones", "seccionesOrdenadas", "renderSecciones",
  "renderSeccionesOrdenadas", "cargado", "onStartupStatusChange",
  `return (${startupArguments});`
);

const imageSection = (id, orden, extra = {}) => ({
  id, orden, altura: 600, fondoTipo: "imagen",
  fondoImagen: `https://assets.test/${id}.png`, ...extra,
});

async function withStartup(run) {
  const dom = new JSDOM("<div id='root'></div>");
  const frames = new Map();
  let frameId = 0;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const root = createRoot(document.getElementById("root"));
  const statuses = [];
  const onStatus = (value) => statuses.push(value);
  let owner;
  let props = { slug: "draft-a", cargado: false, secciones: [], objetos: [] };
  function Host() {
    const rendered = applyFunctionalAssociationsToRenderState({
      ...props, materializeOffsets: false,
    });
    const sort = (sections) => [...sections].sort((a, b) => a.orden - b.orden);
    owner = useStartup(mapStartupArguments(
      props.slug, props.secciones, sort(props.secciones), rendered.secciones,
      sort(rendered.secciones), props.cargado, onStatus
    ));
    return null;
  }
  const render = async (patch) => {
    props = { ...props, ...patch };
    await act(async () => root.render(React.createElement(Host)));
  };
  const draw = async () => {
    for (let index = 0; index < 2; index++) {
      await act(async () => {
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback());
      });
    }
  };
  const imageStatus = async (section, status = "loaded") => {
    await act(async () => owner.handleBackgroundImageStatusChange({
      assetKey: `${section.id}:base`, sectionId: section.id,
      imageUrl: section.fondoImagen, hasBackgroundImage: true, status,
    }));
  };
  try {
    await render({});
    await run({ render, draw, imageStatus, statuses });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of ["window", "document", "IS_REACT_ACT_ENVIRONMENT",
      "requestAnimationFrame", "cancelAnimationFrame"]) delete globalThis[key];
  }
}

test("opening a draft waits for the first rendered section, not a hidden functional section", async () => {
  await withStartup(async ({ render, draw, imageStatus, statuses }) => {
    const hidden = imageSection("gifts", 0, { functionalAssociation: "gifts" });
    const visible = imageSection("cover", 1);
    await render({ cargado: true, secciones: [hidden, visible], gifts: { enabled: false } });
    await draw();
    assert.equal(statuses.at(-1).status, "running");
    await imageStatus(visible);
    await draw();
    assert.equal(statuses.at(-1).status, "ready");
    assert.equal(statuses.at(-1).totalBackgrounds, 1);
    assert.equal(statuses.at(-1).pendingBackgrounds, 0);
  });
});

test("hidden images do not block a visible section with a color background", async () => {
  await withStartup(async ({ render, draw, statuses }) => {
    await render({ cargado: true, gifts: { enabled: false }, secciones: [
      imageSection("gifts", 0, { functionalAssociation: "gifts" }),
      { id: "cover", orden: 1, altura: 600, fondo: "#ffffff" },
    ] });
    await draw();
    assert.equal(statuses.at(-1).status, "ready");
    assert.equal(statuses.at(-1).totalBackgrounds, 0);
  });
});

test("rehydration of the same draft revokes ready and waits for its current image URL", async () => {
  await withStartup(async ({ render, draw, imageStatus, statuses }) => {
    const previous = imageSection("cover", 0);
    await render({ cargado: true, secciones: [previous] });
    await imageStatus(previous);
    await draw();
    assert.equal(statuses.at(-1).status, "ready");
    await render({ cargado: false });
    assert.equal(statuses.at(-1).status, "running");
    const current = { ...previous, fondoImagen: "https://assets.test/new-cover.png" };
    await render({ cargado: true, secciones: [current] });
    await draw();
    assert.equal(statuses.at(-1).status, "running");
    await imageStatus(current);
    await draw();
    assert.equal(statuses.at(-1).status, "ready");
  });
});

test("failed visible images allow opening, while later edits do not reopen the startup loader", async () => {
  await withStartup(async ({ render, draw, imageStatus, statuses }) => {
    const first = imageSection("cover", 0);
    await render({ cargado: true, secciones: [first, imageSection("later", 1)] });
    await imageStatus(first, "failed");
    await draw();
    assert.equal(statuses.at(-1).status, "ready");
    assert.equal(statuses.at(-1).failedBackgrounds, 1);
    const count = statuses.length;
    await render({ secciones: [imageSection("replacement", 0)] });
    await draw();
    assert.equal(statuses.length, count);
  });
});

test("a pending ready frame is cancelled when hydration restarts", async () => {
  await withStartup(async ({ render, draw, statuses }) => {
    await render({ cargado: true });
    await render({ cargado: false });
    await draw();
    assert.equal(statuses.some((status) => status.status === "ready"), false);
  });
});
