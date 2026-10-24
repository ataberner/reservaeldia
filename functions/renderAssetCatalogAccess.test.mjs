import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const appsBeforeImport = admin.apps.length;
const { createSharedRenderAssetAccessReader } = requireBuiltModule("lib/render/renderAssetCatalogAccess.js");
const bucket = "demo-render-assets.firebasestorage.app";
const draft = { kind: "draft", ownerUid: "synthetic-owner", draftId: "synthetic-draft" };
const template = { kind: "template", actorUid: "synthetic-admin", templateId: "synthetic-template" };

function getField(data, field) {
  return field.split(".").reduce((value, key) => value?.[key], data);
}

function fixture(records = {}) {
  const reads = [];
  const repository = {
    async getDocument(path) {
      reads.push({ method: "get", path });
      return records[path] ? { id: path.split("/").at(-1), data: records[path] } : null;
    },
    async findDocuments(collection, field, value, match) {
      reads.push({ method: "find", collection, field, match });
      return Object.entries(records).filter(([path, data]) => {
        if (path.slice(0, path.lastIndexOf("/")) !== collection) return false;
        const fieldValue = getField(data, field);
        return match === "equal" ? fieldValue === value : typeof fieldValue === "string" && fieldValue.startsWith(value);
      }).slice(0, 20).map(([path, data]) => ({ id: path.split("/").at(-1), data }));
    },
  };
  const reader = createSharedRenderAssetAccessReader(repository);
  return { reads, allow: (path, context = draft) => reader(path, bucket, context) };
}

function firebaseUrl(path, targetBucket = bucket) {
  return `https://firebasestorage.googleapis.com/v0/b/${targetBucket}/o/${encodeURIComponent(path)}?alt=media&token=synthetic-token`;
}

test("importing the shared asset repository does not initialize Admin", () => {
  assert.equal(admin.apps.length, appsBeforeImport);
});

test("published and legacy template assets include on-demand clones absent from the template payload", async () => {
  for (const data of [{ estado: "active", estadoEditorial: "publicada", objetos: [] }, { objetos: [] }]) {
    const f = fixture({ "plantillas/synthetic-template": data });
    assert.equal(await f.allow("plantillas/synthetic-template/assets/on-demand-clone.webp"), true);
    assert.deepEqual(f.reads, [{ method: "get", path: "plantillas/synthetic-template" }]);
  }
});

test("only the verified same-template context may preview unpublished template assets", async () => {
  for (const estadoEditorial of ["en_proceso", "en_revision"]) {
    const f = fixture({ "plantillas/synthetic-template": { estadoEditorial } });
    const path = "plantillas/synthetic-template/assets/image.webp";
    assert.equal(await f.allow(path), false);
    assert.equal(await f.allow(path, template), true);
    assert.equal(await f.allow(path, { ...template, templateId: "other-template" }), false);
  }
});

test("missing, trashed, archived and unknown editorial templates do not grant shared access", async () => {
  const path = "plantillas/synthetic-template/assets/image.webp";
  for (const data of [null, { estadoEditorial: "unknown" }, { estadoEditorial: null },
    { estadoEditorial: "PUBLICADA" }, { estadoEditorial: "" },
    { estadoEditorial: "publicada", estado: "archived" },
    { estadoEditorial: "publicada", estado: " ARCHIVED " },
    { estadoEditorial: "publicada", trash: { active: true } }]) {
    const f = fixture(data ? { "plantillas/synthetic-template": data } : {});
    assert.equal(await f.allow(path), false);
    assert.equal(await f.allow(path, template), false);
  }
});

test("catalog records cannot transfer access outside the bounded shared namespaces", async () => {
  for (const path of ["usuarios/another-owner/imagenes/private.webp", "proveedores/provider/private.webp",
    "borradores/private/index.html", "publicadas/private/index.html", "analytics/private.json",
    "exports/private.csv", "iconos_archived/private.svg", "decoraciones/private.webp",
    "plantillas/synthetic-template/private.webp", "user_uploads/private.webp"]) {
    const f = fixture({ "iconos/forged": { status: "active", storagePath: path },
      "decoraciones/forged": { status: "active", storagePath: path },
      "plantillas/synthetic-template": { estadoEditorial: "publicada" } });
    assert.equal(await f.allow(path, template), false);
    assert.equal(f.reads.length, 0);
  }
});

test("only explicit active icon catalog records are eligible; validation warnings are not a role", async () => {
  const path = "iconos/synthetic.svg";
  for (const status of [undefined, "ready", "processing", "archived", "rejected", "duplicate", "ACTIVE", "unknown"]) {
    const f = fixture({ "iconos/synthetic": { status, storagePath: path, validation: { status: "passed" } } });
    assert.equal(await f.allow(path), false);
  }
  const f = fixture({ "iconos/synthetic": { status: "active", storagePath: path, validation: { status: "warning" } } });
  assert.equal(await f.allow(path), true);
});

test("legacy icon filename and same-bucket URL references must resolve to the exact requested path", async () => {
  const path = "iconos/synthetic.svg";
  for (const fields of [{ nombre: "synthetic.svg" }, { nombre: path },
    { storagePath: `/${path}` }, { storagePath: `gs://${bucket}/${path}` },
    { storagePath: `gs://demo-render-assets.appspot.com/${path}` },
    { nombre: "Arbitrary label", url: firebaseUrl(path) },
    { url: firebaseUrl(path, "demo-render-assets.appspot.com") },
    { url: `gs://${bucket}/${path}` }]) {
    const f = fixture({ "iconos/synthetic": { status: "active", ...fields } });
    assert.equal(await f.allow(path), true);
  }
});

test("an invalid explicit catalog reference cannot fall back to a legacy filename or sibling URL", async () => {
  const path = "iconos/synthetic.svg";
  for (const fields of [
    { nombre: "synthetic.svg", storagePath: "usuarios/another-owner/imagenes/private.webp" },
    { nombre: "synthetic.svg", storagePath: `gs://another-project.appspot.com/${path}` },
    { nombre: "synthetic.svg", url: firebaseUrl(path, "another-project.appspot.com") },
    { nombre: "synthetic.svg", url: "https://external.example.test/icon.svg" },
    { url: firebaseUrl(`${path}.different`) },
    { nombre: "synthetic.svg", storagePath: "iconos/../private.svg" },
  ]) {
    const f = fixture({ "iconos/synthetic": { status: "active", ...fields } });
    assert.equal(await f.allow(path), false);
  }
});

test("decoration originals and both thumbnail variants require active exact catalog references", async () => {
  const original = "decoraciones/originals/synthetic.webp";
  const card = "decoraciones/thumbnails/synthetic/card.webp";
  const thumb = "decoraciones/thumbnails/synthetic/thumb.webp";
  const data = { status: "active", storagePath: original,
    thumbnails: { card: { storagePath: card }, thumb: { url: firebaseUrl(thumb) } } };
  const f = fixture({ "decoraciones/synthetic": data });
  for (const path of [original, card, thumb]) assert.equal(await f.allow(path), true);
  assert.equal(await f.allow("decoraciones/thumbnails/synthetic/unlisted.webp"), false);
  for (const status of [undefined, "processing", "ready", "archived"]) {
    const inactive = fixture({ "decoraciones/synthetic": { ...data, status } });
    for (const path of [original, card, thumb]) assert.equal(await inactive.allow(path), false);
  }
});

test("decoration legacy names and nested thumbnail queries still require an exact match", async () => {
  const original = "decoraciones/originals/synthetic.webp";
  const thumbnail = "decoraciones/thumbnails/synthetic/thumb.webp";
  const f = fixture({ "decoraciones/different-document-id": { status: "active", nombre: "synthetic.webp",
    thumbnails: { thumb: { storagePath: thumbnail } } } });
  assert.equal(await f.allow(original), true);
  assert.equal(await f.allow(thumbnail), true);
  const forged = fixture({ "decoraciones/synthetic": { status: "active",
    thumbnails: { thumb: { storagePath: "usuarios/another-owner/imagenes/private.webp", url: firebaseUrl(thumbnail) } } } });
  assert.equal(await forged.allow(thumbnail), false);
});

test("immutable historical countdown versions remain eligible without an active root", async () => {
  const frame = "assets/countdown/frames/synthetic/operations/op/attempt/frame.svg";
  const thumbnail = "assets/countdown/thumbnails/synthetic/operations/op/attempt/thumbnail.png";
  const f = fixture({ "countdownPresets/synthetic": { estado: "archived", activeVersion: 9 },
    "countdownPresets/synthetic/versions/1": { id: "synthetic", version: 1,
      svgRef: { storagePath: frame, thumbnailPath: thumbnail } } });
  assert.equal(await f.allow(frame), true);
  assert.equal(await f.allow(thumbnail), true);
  assert.equal(f.reads.every((read) => read.method === "find" && read.collection === "countdownPresets/synthetic/versions"), true);
});

test("countdown draft/staging files are denied even with a matching version record and admin context", async () => {
  for (const path of ["assets/countdown/frames/synthetic/draft/frame.svg",
    "assets/countdown/thumbnails/synthetic/draft/thumbnail.png", "assets/countdown/staging/synthetic/frame.svg",
    "assets/countdown/frames/synthetic/operations/staging/frame.svg"]) {
    const f = fixture({ "countdownPresets/synthetic/versions/1": { id: "synthetic", version: 1,
      svgRef: { storagePath: path, thumbnailPath: path } } });
    assert.equal(await f.allow(path, template), false);
    assert.equal(f.reads.length, 0);
  }
});

test("countdown roots, operations, wrong preset/version and unlisted files cannot confer access", async () => {
  const path = "assets/countdown/frames/synthetic/legacy-frame.svg";
  for (const records of [
    { "countdownPresets/synthetic": { estado: "published", svgRef: { storagePath: path } } },
    { "countdownPresets/synthetic/operations/op": { svgRef: { storagePath: path } } },
    { "countdownPresets/other/versions/1": { id: "other", version: 1, svgRef: { storagePath: path } } },
    { "countdownPresets/synthetic/versions/1": { id: "other", version: 1, svgRef: { storagePath: path } } },
    { "countdownPresets/synthetic/versions/1": { id: "synthetic", version: 2, svgRef: { storagePath: path } } },
    { "countdownPresets/synthetic/versions/draft": { id: "synthetic", version: 1, svgRef: { storagePath: path } } },
    { "countdownPresets/synthetic/versions/1": { id: "synthetic", version: 1, svgRef: { storagePath: `${path}.different` } } },
  ]) assert.equal(await fixture(records).allow(path), false);
});

test("legacy published countdown URL references are exact and cannot override a foreign explicit path", async () => {
  const path = "assets/countdown/frames/synthetic/legacy-frame.svg";
  const base = { id: "synthetic", version: 1 };
  const valid = fixture({ "countdownPresets/synthetic/versions/1": { ...base, svgRef: { downloadUrl: firebaseUrl(path) } } });
  assert.equal(await valid.allow(path), true);
  const foreign = fixture({ "countdownPresets/synthetic/versions/1": { ...base,
    svgRef: { storagePath: `gs://other.appspot.com/${path}`, downloadUrl: firebaseUrl(path) } } });
  assert.equal(await foreign.allow(path), false);
});

test("invalid contexts and noncanonical paths fail before any repository read", async () => {
  const f = fixture();
  for (const context of [null, {}, { kind: "draft", ownerUid: "", draftId: "synthetic" },
    { kind: "template", actorUid: "admin", templateId: "../other" }]) {
    assert.equal(await f.allow("iconos/synthetic.svg", context), false);
  }
  for (const path of ["", "/iconos/synthetic.svg", "iconos/../private.svg", "iconos/%2e%2e/private.svg",
    "iconos/synthetic.svg?token=synthetic", "iconos//synthetic.svg", "iconos\\synthetic.svg",
    firebaseUrl("iconos/synthetic.svg")]) assert.equal(await f.allow(path), false);
  assert.equal(f.reads.length, 0);
});

test("repository errors never turn into an access grant or a cross-request permission cache", async () => {
  let shouldFail = false;
  const reader = createSharedRenderAssetAccessReader({
    async getDocument() {
      if (shouldFail) throw new Error("synthetic read failure");
      return { id: "synthetic-template", data: { estadoEditorial: "publicada" } };
    },
    async findDocuments() { throw new Error("unexpected query"); },
  });
  const path = "plantillas/synthetic-template/assets/clone.webp";
  assert.equal(await reader(path, bucket, draft), true);
  shouldFail = true;
  await assert.rejects(reader(path, bucket, draft), /synthetic read failure/);
});
