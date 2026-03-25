import test from "node:test";
import assert from "node:assert/strict";

import { normalizePantallaObjectPosition } from "./pantallaPosition.js";

test("aligns y to yNorm when a pantalla object already has yNorm", () => {
  const normalized = normalizePantallaObjectPosition(
    {
      id: "title-1",
      tipo: "texto",
      y: 320,
      yNorm: 0.2,
    },
    {
      sectionMode: "pantalla",
      alturaPantalla: 500,
    }
  );

  assert.deepEqual(normalized, {
    id: "title-1",
    tipo: "texto",
    y: 100,
    yNorm: 0.2,
  });
});

test("backfills yNorm from y for pantalla objects that do not have it yet", () => {
  const normalized = normalizePantallaObjectPosition(
    {
      id: "title-2",
      tipo: "texto",
      y: 125,
    },
    {
      sectionMode: "pantalla",
      alturaPantalla: 500,
    }
  );

  assert.deepEqual(normalized, {
    id: "title-2",
    tipo: "texto",
    y: 125,
    yNorm: 0.25,
  });
});

test("removes yNorm outside pantalla sections without touching y", () => {
  const normalized = normalizePantallaObjectPosition(
    {
      id: "title-3",
      tipo: "texto",
      y: 180,
      yNorm: 0.36,
    },
    {
      sectionMode: "fijo",
      alturaPantalla: 500,
    }
  );

  assert.deepEqual(normalized, {
    id: "title-3",
    tipo: "texto",
    y: 180,
  });
});
