import test from "node:test";
import assert from "node:assert/strict";

import {
  assembleDashboardPublicationItems,
  loadUserPublicationSourceRecords,
} from "./dashboardList.js";

function createDoc(id, data) {
  return {
    id,
    data: () => data,
  };
}

test("loadUserPublicationSourceRecords keeps active records when history read is permission-denied", async () => {
  const records = await loadUserPublicationSourceRecords({
    userUid: "user-1",
    limit: 10,
    loadActiveSnapshot: async () => ({
      docs: [createDoc("pub-activa", { nombre: "Activa" })],
    }),
    loadHistorySnapshot: async () => {
      throw { code: "permission-denied" };
    },
    enrichActiveRecord: async (record) => ({
      ...record,
      data: {
        ...record.data,
        enriched: true,
      },
    }),
  });

  assert.deepEqual(records, [
    {
      id: "pub-activa",
      source: "active",
      data: {
        nombre: "Activa",
        enriched: true,
      },
    },
  ]);
});

test("assembleDashboardPublicationItems preserves dashboard ordering and shared publication shaping", async () => {
  const draftRecords = new Map([
    ["draft-activa", { thumbnailUrl: "https://cdn.example.com/draft-activa.webp" }],
    ["draft-historial", { portada: "https://cdn.example.com/draft-historial.webp" }],
  ]);

  const items = await assembleDashboardPublicationItems(
    [
      {
        id: "pub-activa",
        source: "active",
        data: {
          nombre: "Invitacion activa",
          urlPublica: "https://reserva.example.com/pub-activa",
          borradorSlug: "draft-activa",
          ultimaPublicacionEn: 200,
        },
      },
      {
        id: "pub-papelera",
        source: "active",
        data: {
          nombre: "En papelera",
          borradorSlug: "draft-papelera",
          estado: "papelera",
          enPapeleraAt: 500,
        },
      },
      {
        id: "historial-principal",
        source: "history",
        data: {
          sourceSlug: "slug-finalizada",
          nombre: "Invitacion finalizada",
          borradorSlug: "draft-historial",
          finalizadaEn: 300,
        },
      },
      {
        id: "historial-fallback",
        source: "history",
        data: {
          slug: "slug-legacy",
          finalizadaEn: 100,
        },
      },
    ],
    {
      nowMs: 1000,
      readDraftBySlug: async (draftSlug) => ({
        id: draftSlug,
        data: draftRecords.get(draftSlug) || {},
      }),
    }
  );

  assert.deepEqual(
    items.map((item) => item.id),
    ["historial-principal", "pub-activa", "historial-fallback"]
  );

  const activeItem = items.find((item) => item.id === "pub-activa");
  assert.equal(
    activeItem.portada,
    "https://cdn.example.com/draft-activa.webp"
  );
  assert.deepEqual(activeItem.previewCandidates, [
    "https://cdn.example.com/draft-activa.webp",
  ]);
  assert.equal(
    activeItem.url,
    "https://reserva.example.com/pub-activa"
  );
  assert.equal(activeItem.borradorSlug, "draft-activa");

  const historyItem = items.find((item) => item.id === "historial-principal");
  assert.equal(historyItem.statusLabel, "Finalizada");
  assert.equal(historyItem.isFinalized, true);
  assert.equal(historyItem.publicSlug, "slug-finalizada");

  const historyFallbackItem = items.find(
    (item) => item.id === "historial-fallback"
  );
  assert.equal(historyFallbackItem.publicSlug, "slug-legacy");

  assert.equal(
    items.some((item) => item.id === "pub-papelera"),
    false
  );
});
