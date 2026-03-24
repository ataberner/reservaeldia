import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeRenderAssetObject,
  normalizeRenderAssetSection,
  resolveGalleryCellMediaUrl,
  resolveObjectPrimaryAssetUrl,
} from "./renderAssetContract.js";

test("normalizes image objects with legacy url into canonical src", () => {
  const normalized = normalizeRenderAssetObject({
    id: "img-1",
    tipo: "imagen",
    url: "https://cdn.example.com/photo.jpg",
  });

  assert.equal(resolveObjectPrimaryAssetUrl(normalized), "https://cdn.example.com/photo.jpg");
  assert.equal(normalized.src, "https://cdn.example.com/photo.jpg");
  assert.equal(normalized.url, "https://cdn.example.com/photo.jpg");
});

test("normalizes raster icon objects with legacy url into canonical src", () => {
  const normalized = normalizeRenderAssetObject({
    id: "icon-1",
    tipo: "icono",
    formato: "png",
    url: "https://cdn.example.com/icon.png",
  });

  assert.equal(resolveObjectPrimaryAssetUrl(normalized), "https://cdn.example.com/icon.png");
  assert.equal(normalized.src, "https://cdn.example.com/icon.png");
});

test("normalizes gallery cells to canonical mediaUrl", () => {
  const normalized = normalizeRenderAssetObject({
    id: "gallery-1",
    tipo: "galeria",
    cells: [
      { mediaUrl: "https://cdn.example.com/a.jpg" },
      { url: "https://cdn.example.com/b.jpg" },
      { src: "https://cdn.example.com/c.jpg" },
    ],
  });

  assert.deepEqual(
    normalized.cells.map((cell) => resolveGalleryCellMediaUrl(cell)),
    [
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
      "https://cdn.example.com/c.jpg",
    ]
  );
  assert.deepEqual(
    normalized.cells.map((cell) => cell.mediaUrl),
    [
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
      "https://cdn.example.com/c.jpg",
    ]
  );
});

test("preserves canonical section background and decoration fields", () => {
  const normalized = normalizeRenderAssetSection({
    id: "section-1",
    fondoImagen: "https://cdn.example.com/background.jpg",
    decoracionesFondo: {
      parallax: "soft",
      items: [
        {
          id: "decor-1",
          src: "https://cdn.example.com/decor.png",
        },
      ],
    },
  });

  assert.equal(normalized.fondoImagen, "https://cdn.example.com/background.jpg");
  assert.equal(
    normalized.decoracionesFondo.items[0].src,
    "https://cdn.example.com/decor.png"
  );
});
