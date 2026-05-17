import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDashboardDraftSummary,
  buildDashboardPublicationSummary,
  formatDashboardPublishedDate,
  resolveDashboardPublicationPreviewCandidates,
  resolveDashboardDraftPreviewCandidates,
  resolvePublicationPublishedMs,
  selectLatestDashboardDraft,
  selectLatestActiveDashboardPublication,
} from "./dashboardSummary.js";

function timestamp(ms) {
  return {
    seconds: Math.floor(ms / 1000),
  };
}

test("selectLatestActiveDashboardPublication chooses the latest active publication only", () => {
  const olderActive = {
    id: "older",
    source: "active",
    publicSlug: "older",
    isActive: true,
    raw: {
      ultimaPublicacionEn: timestamp(1000),
    },
  };
  const newestActive = {
    id: "newest",
    source: "active",
    publicSlug: "newest",
    isActive: true,
    raw: {
      ultimaPublicacionEn: timestamp(3000),
    },
  };
  const paused = {
    id: "paused",
    source: "active",
    publicSlug: "paused",
    isActive: false,
    raw: {
      ultimaPublicacionEn: timestamp(5000),
    },
  };
  const history = {
    id: "history",
    source: "history",
    publicSlug: "history",
    isActive: false,
    raw: {
      finalizadaEn: timestamp(7000),
    },
  };

  assert.equal(
    selectLatestActiveDashboardPublication([
      olderActive,
      paused,
      history,
      newestActive,
    ])?.id,
    "newest"
  );
});

test("buildDashboardPublicationSummary uses publication date and real preview candidates", () => {
  const publication = {
    id: "boda-luis-maria",
    source: "active",
    publicSlug: "boda-luis-maria",
    nombre: "Luis & Maria se casan!",
    isActive: true,
    url: "https://reservaeldia.com.ar/i/boda-luis-maria",
    portada: "/placeholder.jpg",
    previewCandidates: [
      "",
      "https://cdn.example.com/vertical.webp",
      "https://cdn.example.com/vertical.webp",
    ],
    raw: {
      publicadaEn: timestamp(Date.UTC(2025, 9, 18, 12)),
      ultimaPublicacionEn: timestamp(Date.UTC(2025, 9, 19, 12)),
      share: {
        status: "generated",
        imageUrl: "https://reservaeldia.com.ar/i/boda-luis-maria/share.jpg?v=1",
      },
    },
  };

  const summary = buildDashboardPublicationSummary([publication]);

  assert.equal(summary.publicSlug, "boda-luis-maria");
  assert.equal(summary.title, "Luis & Maria se casan!");
  assert.equal(summary.publishedDateLabel, "19 de octubre, 2025");
  assert.deepEqual(summary.previewCandidates, [
    "https://cdn.example.com/vertical.webp",
    "https://reservaeldia.com.ar/i/boda-luis-maria/share.jpg?v=1",
  ]);
});

test("buildDashboardPublicationSummary returns null without active publication, date, url, or real preview", () => {
  assert.equal(buildDashboardPublicationSummary([]), null);
  assert.equal(
    buildDashboardPublicationSummary([
      {
        id: "paused",
        source: "active",
        publicSlug: "paused",
        isActive: false,
      },
    ]),
    null
  );
  assert.equal(
    buildDashboardPublicationSummary([
      {
        id: "missing-preview",
        source: "active",
        publicSlug: "missing-preview",
        isActive: true,
        url: "https://reservaeldia.com.ar/i/missing-preview",
        raw: {
          publicadaEn: timestamp(2000),
        },
      },
    ]),
    null
  );
});

test("resolvePublicationPublishedMs falls back to publication timestamps", () => {
  const publishedMs = Date.UTC(2026, 2, 3, 12);

  assert.equal(
    resolvePublicationPublishedMs({
      publishedAt: new Date(publishedMs),
      raw: {},
    }),
    publishedMs
  );
  assert.equal(
    formatDashboardPublishedDate(publishedMs),
    "3 de marzo, 2026"
  );
});

test("resolveDashboardPublicationPreviewCandidates ignores fallback share metadata", () => {
  assert.deepEqual(
    resolveDashboardPublicationPreviewCandidates({
      portada: "",
      previewCandidates: [],
      raw: {
        share: {
          status: "fallback",
          imageUrl: "https://example.com/fallback.jpg",
        },
      },
    }),
    []
  );
});

test("buildDashboardDraftSummary uses the latest edited draft and real preview", () => {
  const olderDraft = {
    id: "older",
    slug: "older",
    updatedAtMs: Date.UTC(2026, 4, 1, 10),
    previewCandidates: ["https://cdn.example.com/older.jpg"],
  };
  const latestDraft = {
    id: "latest",
    slug: "latest",
    updatedAtMs: Date.UTC(2026, 4, 3, 10),
    previewCandidates: [
      "/placeholder.jpg",
      "https://cdn.example.com/latest.jpg",
    ],
  };

  assert.equal(
    selectLatestDashboardDraft([olderDraft, latestDraft])?.slug,
    "latest"
  );

  const summary = buildDashboardDraftSummary([olderDraft, latestDraft]);

  assert.equal(summary.slug, "latest");
  assert.equal(summary.title, "¡Nos casamos!");
  assert.equal(summary.updatedDateLabel, "3 de mayo, 2026");
  assert.deepEqual(summary.previewCandidates, [
    "https://cdn.example.com/latest.jpg",
  ]);
});

test("buildDashboardDraftSummary returns null without draft date or real preview", () => {
  assert.equal(buildDashboardDraftSummary([]), null);
  assert.equal(
    buildDashboardDraftSummary([
      {
        id: "placeholder",
        slug: "placeholder",
        updatedAtMs: Date.UTC(2026, 4, 3, 10),
        previewCandidates: ["/placeholder.jpg"],
      },
    ]),
    null
  );
  assert.deepEqual(
    resolveDashboardDraftPreviewCandidates({
      previewSrc: "/placeholder.jpg",
      raw: {
        portada: "https://cdn.example.com/cover.jpg",
      },
    }),
    ["https://cdn.example.com/cover.jpg"]
  );
});
