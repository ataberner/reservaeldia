import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  applyDashboardPublicationTransition,
  assembleDashboardPublicationItems,
  loadUserPublicationSourceRecords,
} from "./dashboardList.js";

function createDoc(id, data) {
  return {
    id,
    data: () => data,
  };
}

function readSource(relativeUrl) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
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

test("applyDashboardPublicationTransition updates only the affected active item", () => {
  const unaffected = {
    id: "otra-publicacion",
    source: "active",
    publicSlug: "otra-publicacion",
    isActive: true,
    raw: { urlPublica: "https://reserva.example.com/otra-publicacion" },
  };
  const affected = {
    id: "mi-publicacion",
    source: "active",
    publicSlug: "mi-publicacion",
    url: "https://reserva.example.com/mi-publicacion",
    isActive: true,
    isPaused: false,
    raw: {
      urlPublica: "https://reserva.example.com/mi-publicacion",
      publicadaAt: "2026-01-10T10:00:00.000Z",
      venceAt: "2099-01-10T10:00:00.000Z",
    },
  };

  const paused = applyDashboardPublicationTransition(
    [unaffected, affected],
    {
      slug: "mi-publicacion",
      estado: "publicada_pausada",
      publicadaAt: "2026-01-10T10:00:00.000Z",
      venceAt: "2099-01-10T10:00:00.000Z",
      pausadaAt: "2026-07-22T12:00:00.000Z",
      enPapeleraAt: null,
    }
  );

  assert.equal(paused[0], unaffected);
  assert.equal(paused[1].isPaused, true);
  assert.equal(paused[1].isActive, false);
  assert.equal(paused[1].statusLabel, "Pausada");
  assert.equal(paused[1].url, "");
  assert.equal(
    paused[1].raw.urlPublica,
    "https://reserva.example.com/mi-publicacion"
  );

  const resumed = applyDashboardPublicationTransition(paused, {
    slug: "mi-publicacion",
    estado: "publicada_activa",
    publicadaAt: "2026-01-10T10:00:00.000Z",
    venceAt: "2099-01-10T10:00:00.000Z",
    pausadaAt: null,
    enPapeleraAt: null,
  });

  assert.equal(resumed[0], unaffected);
  assert.equal(resumed[1].isActive, true);
  assert.equal(resumed[1].isPaused, false);
  assert.equal(resumed[1].statusLabel, "Activa");
  assert.equal(
    resumed[1].url,
    "https://reserva.example.com/mi-publicacion"
  );
});

test("applyDashboardPublicationTransition removes only an item moved to trash", () => {
  const unaffected = {
    id: "otra-publicacion",
    source: "active",
    publicSlug: "otra-publicacion",
  };
  const affected = {
    id: "mi-publicacion",
    source: "active",
    publicSlug: "mi-publicacion",
    isPaused: true,
    raw: {
      estado: "publicada_pausada",
      publicadaAt: "2026-01-10T10:00:00.000Z",
      venceAt: "2099-01-10T10:00:00.000Z",
    },
  };

  const nextItems = applyDashboardPublicationTransition(
    [unaffected, affected],
    {
      slug: "mi-publicacion",
      estado: "papelera",
      publicadaAt: "2026-01-10T10:00:00.000Z",
      venceAt: "2099-01-10T10:00:00.000Z",
      pausadaAt: "2026-07-22T12:00:00.000Z",
      enPapeleraAt: "2026-07-22T12:00:00.000Z",
    }
  );

  assert.deepEqual(nextItems, [unaffected]);
});

test("applyDashboardPublicationTransition preserves the list when the slug is unknown", () => {
  const items = [
    {
      id: "mi-publicacion",
      source: "active",
      publicSlug: "mi-publicacion",
    },
  ];

  assert.equal(
    applyDashboardPublicationTransition(items, {
      slug: "otra-publicacion",
      estado: "publicada_pausada",
    }),
    items
  );
});

test("dashboard home applies successful publication transitions without a global refetch", () => {
  const carouselSource = readSource(
    "../../components/dashboard/home/DashboardLandingCarouselSections.jsx"
  );
  const homeSource = readSource(
    "../../components/dashboard/home/DashboardHomeView.jsx"
  );
  const hookSource = readSource("../../hooks/useDashboardPublications.js");

  assert.match(
    carouselSource,
    /const transition = await transitionPublishedInvitationState\([\s\S]*onPublicationTransition\?\.\(transition\)/
  );
  assert.doesNotMatch(carouselSource, /onPublicationsRefresh/);
  assert.match(
    homeSource,
    /onPublicationTransition=\{applyPublicationTransition\}/
  );
  assert.match(
    hookSource,
    /setPublications\(\(current\) =>[\s\S]*applyDashboardPublicationTransition\(current, transition\)/
  );
  assert.doesNotMatch(hookSource, /refreshTick/);
  assert.doesNotMatch(
    hookSource,
    /const applyPublicationTransition[\s\S]*setLoading\(/
  );
});
