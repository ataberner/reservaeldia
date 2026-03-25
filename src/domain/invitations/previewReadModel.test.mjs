import test from "node:test";
import assert from "node:assert/strict";

import {
  getDraftPreviewCandidates,
  getDraftPreviewReadModel,
  getPublicationPreview,
  getPublicationPreviewItemKey,
  getPublicationPreviewReadModel,
  resolvePublicationPreviewReadModel,
  resolvePublicationPreviewReadModelsByItemKey,
} from "./previewReadModel.js";
import {
  draftPreviewFixtures,
  publicationPreviewFixtures,
} from "./previewReadModel.fixtures.mjs";

test("draft preview fixtures keep current metadata compatibility", async (t) => {
  for (const fixture of draftPreviewFixtures) {
    await t.test(fixture.id, () => {
      const readModel = getDraftPreviewReadModel(
        fixture.draft,
        fixture.options
      );

      assert.deepEqual(readModel, fixture.expected);
      assert.deepEqual(
        getDraftPreviewCandidates(fixture.draft, fixture.options),
        fixture.expected.candidates
      );
    });
  }
});

test("publication metadata preview keeps portada-first ordering", () => {
  const publication = {
    portada: "https://cdn.example.com/portada.webp",
    thumbnailUrl: "https://cdn.example.com/thumbnail.webp",
    previewUrl: "https://cdn.example.com/preview.webp",
  };

  const readModel = getPublicationPreviewReadModel(publication);

  assert.equal(readModel.source, "publication_metadata");
  assert.equal(readModel.primarySrc, "https://cdn.example.com/portada.webp");
  assert.deepEqual(readModel.candidates, [
    "https://cdn.example.com/portada.webp",
    "https://cdn.example.com/thumbnail.webp",
    "https://cdn.example.com/preview.webp",
  ]);
  assert.equal(
    getPublicationPreview(publication),
    "https://cdn.example.com/portada.webp"
  );
});

test("publication preview fixtures preserve linked draft fallback behavior", async (t) => {
  for (const fixture of publicationPreviewFixtures) {
    await t.test(fixture.id, async () => {
      const readModel = await resolvePublicationPreviewReadModel({
        publication: fixture.publication,
        fallbackSlug: fixture.fallbackSlug,
        readDraftBySlug: async (draftSlug) => ({
          id: draftSlug,
          data: fixture.linkedDraft,
        }),
      });

      assert.equal(readModel.source, fixture.expected.source);
      assert.equal(readModel.primarySrc, fixture.expected.primarySrc);
      assert.equal(readModel.linkedDraftSlug, fixture.expected.linkedDraftSlug);
      assert.deepEqual(readModel.candidates, fixture.expected.candidates);
    });
  }
});

test("publication metadata keeps linked draft candidates as image fallback order", async () => {
  const readModel = await resolvePublicationPreviewReadModel({
    publication: {
      portada: "https://cdn.example.com/publicada.webp",
      borradorSlug: "draft-linked",
    },
    fallbackSlug: "publicada-con-fallback",
    readDraftBySlug: async (draftSlug) => ({
      id: draftSlug,
      data: {
        thumbnailUrl: "https://cdn.example.com/draft-thumb.webp",
        portada: "https://cdn.example.com/draft-portada.webp",
      },
    }),
  });

  assert.equal(readModel.source, "publication_metadata");
  assert.equal(readModel.primarySrc, "https://cdn.example.com/publicada.webp");
  assert.deepEqual(readModel.publicationCandidates, [
    "https://cdn.example.com/publicada.webp",
  ]);
  assert.deepEqual(readModel.linkedDraftCandidates, [
    "https://cdn.example.com/draft-thumb.webp",
    "https://cdn.example.com/draft-portada.webp",
  ]);
  assert.deepEqual(readModel.candidates, [
    "https://cdn.example.com/publicada.webp",
    "https://cdn.example.com/draft-thumb.webp",
    "https://cdn.example.com/draft-portada.webp",
  ]);
});

test("publication preview read-model map resolves mixed items consistently", async () => {
  const items = [
    {
      id: "publicada-a",
      source: "active",
      data: {
        portada: "https://cdn.example.com/publicada-a.webp",
        borradorSlug: "draft-a",
      },
    },
    {
      id: "publicada-b",
      source: "history",
      data: {
        borradorSlug: "draft-b",
      },
    },
    {
      id: "publicada-c",
      source: "active",
      data: {
        borradorSlug: "draft-c",
      },
    },
  ];

  const draftRecords = new Map([
    ["draft-b", { thumbnailUrl: "https://cdn.example.com/draft-b.webp" }],
    ["draft-c", {}],
  ]);

  const byItemKey = await resolvePublicationPreviewReadModelsByItemKey(items, {
    readDraftBySlug: async (draftSlug) => ({
      id: draftSlug,
      data: draftRecords.get(draftSlug) || {},
    }),
  });

  assert.deepEqual(
    byItemKey.get(getPublicationPreviewItemKey("active", "publicada-a")),
    {
      source: "publication_metadata",
      primarySrc: "https://cdn.example.com/publicada-a.webp",
      candidates: ["https://cdn.example.com/publicada-a.webp"],
      publicationCandidates: ["https://cdn.example.com/publicada-a.webp"],
      linkedDraftSlug: "draft-a",
      linkedDraftCandidates: [],
    }
  );
  assert.deepEqual(
    byItemKey.get(getPublicationPreviewItemKey("history", "publicada-b")),
    {
      source: "linked_draft",
      primarySrc: "https://cdn.example.com/draft-b.webp",
      candidates: ["https://cdn.example.com/draft-b.webp"],
      publicationCandidates: [],
      linkedDraftSlug: "draft-b",
      linkedDraftCandidates: ["https://cdn.example.com/draft-b.webp"],
    }
  );
  assert.deepEqual(
    byItemKey.get(getPublicationPreviewItemKey("active", "publicada-c")),
    {
      source: "none",
      primarySrc: "",
      candidates: [],
      publicationCandidates: [],
      linkedDraftSlug: "draft-c",
      linkedDraftCandidates: [],
    }
  );
});
