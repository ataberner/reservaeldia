import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  dedupeCatalogItems,
  isCatalogItemAvailableForNewInsertion,
  normalizeCatalogIconItem,
} from "./catalog.js";
import {
  buildSvgIconInsertPayload,
} from "./insertions.js";

function canonicalRenderable() {
  const svgText = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M2 2h20v20H2z"/></svg>';
  return {
    schemaVersion: 1,
    contractId: "icon_svg_snapshot_v1",
    mediaType: "image/svg+xml",
    svgText,
    viewBox: "0 0 24 24",
    viewBoxWidth: 24,
    viewBoxHeight: 24,
    colorMode: "currentColor",
    geometryCount: 1,
    bytes: Buffer.byteLength(svgText),
    hashSha256: createHash("sha256").update(svgText).digest("hex"),
  };
}

function rawIcon(overrides = {}) {
  return {
    id: "icon-1",
    nombre: "Seguro",
    url: "https://cdn.test/icon.svg",
    format: "svg",
    status: "active",
    hashSha256: canonicalRenderable().hashSha256,
    iconRender: canonicalRenderable(),
    ...overrides,
  };
}

test("new catalog insertion is fail-closed for every non-active status", () => {
  for (const status of ["processing", "inactive", "archived", "rejected", "duplicate", "", null]) {
    const item = normalizeCatalogIconItem(rawIcon({ status }));
    assert.equal(isCatalogItemAvailableForNewInsertion(item), false, String(status));
  }
  assert.equal(
    isCatalogItemAvailableForNewInsertion(normalizeCatalogIconItem(rawIcon())),
    true
  );
});

test("active SVG without a canonical renderable snapshot cannot be inserted", () => {
  const missing = normalizeCatalogIconItem(rawIcon({ iconRender: null }));
  assert.equal(isCatalogItemAvailableForNewInsertion(missing), false);
  assert.equal(buildSvgIconInsertPayload(missing), null);

  const valid = normalizeCatalogIconItem(rawIcon());
  const payload = buildSvgIconInsertPayload(valid, 1000);
  assert.equal(payload?.tipo, "icono");
  assert.equal(payload?.formato, "svg");
  assert.equal(payload?.iconRender?.geometryCount, 1);
  assert.equal(payload?.colorizable, true);
  assert.equal(Array.isArray(payload?.paths), false);
});

test("active records with an unknown file format remain unavailable", () => {
  const item = normalizeCatalogIconItem(rawIcon({
    format: "pdf",
    url: "https://cdn.test/icon.pdf",
    iconRender: null,
  }));
  assert.equal(isCatalogItemAvailableForNewInsertion(item), false);
});

test("catalog deduplication uses canonical content hash before URL", () => {
  const first = normalizeCatalogIconItem(rawIcon());
  const second = normalizeCatalogIconItem(rawIcon({
    id: "icon-2",
    url: "https://cdn.test/same-content-other-url.svg",
  }));
  assert.equal(dedupeCatalogItems([first, second]).length, 1);
});

test("catalog service has no Storage enumeration fallback and queries explicit active state", () => {
  const serviceSource = readFileSync(new URL("./service.js", import.meta.url), "utf8");
  const hookSource = readFileSync(new URL("../../hooks/useElementCatalog.js", import.meta.url), "utf8");
  assert.doesNotMatch(serviceSource, /firebase\/storage|fetchStorageCatalogPage|\blist\(/);
  assert.doesNotMatch(hookSource, /fetchStorageCatalogPage|source:\s*["']storage/);
  assert.match(serviceSource, /where\(["']status["'],\s*["']==["'],\s*["']active["']\)/);
  assert.match(serviceSource, /getDocFromServer/);
  assert.match(serviceSource, /snapshot\.metadata\.fromCache/);
});

test("elements panel keeps catalog verification failures silent", () => {
  const panelSource = readFileSync(
    new URL("../../components/PanelDeFormas.jsx", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(panelSource, /^\s*error,\s*$/m);
  assert.doesNotMatch(panelSource, /insertionError\s*\|\|\s*error/);
  assert.match(panelSource, /\{insertionError \? \(/);
});
