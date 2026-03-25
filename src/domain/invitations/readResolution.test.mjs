import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDraftPublicationReadPlan,
  getPublicationEditableDraftCandidates,
  resolveDraftLinkedPublicSlug,
  resolveDraftLinkedPublicSlugCandidates,
  resolveDraftPublicationLifecycleState,
  resolveOwnedDraftSlugForEditorRead,
  resolvePublicationDraftLookupSlug,
  resolvePublicationEditableDraftSlug,
  resolvePublicationLinkForDraftRead,
  sanitizeDraftSlug,
} from "./readResolution.js";

test("sanitizeDraftSlug keeps current dashboard-compatible decoding behavior", () => {
  assert.equal(sanitizeDraftSlug("borrador%20uno?foo=bar"), "borrador uno");
  assert.equal(sanitizeDraftSlug("  borrador-dos  "), "borrador-dos");
  assert.equal(sanitizeDraftSlug(null), null);
});

test("draft public linkage candidates preserve priority and lifecycle fallback", () => {
  const draft = {
    slugPublico: "Mi Publico",
    publicationLifecycle: {
      activePublicSlug: "Otro Publico",
    },
  };

  assert.deepEqual(resolveDraftLinkedPublicSlugCandidates(draft), [
    "mi-publico",
    "otro-publico",
  ]);
  assert.equal(resolveDraftLinkedPublicSlug(draft), "mi-publico");
  assert.equal(resolveDraftPublicationLifecycleState(draft), "published");
  assert.equal(
    resolveDraftPublicationLifecycleState({
      publicationLifecycle: { activePublicSlug: "solo-lifecycle" },
    }),
    "published"
  );
});

test("publication draft candidate helpers freeze current compatibility order", () => {
  const publication = {
    borradorSlug: "draft-primary",
    borradorId: "draft-secondary",
    draftSlug: "draft-third",
    slugOriginal: "draft-original",
    slug: "publico-final",
  };

  assert.deepEqual(getPublicationEditableDraftCandidates(publication), [
    "draft-primary",
    "draft-secondary",
    "draft-third",
    "draft-original",
  ]);
  assert.equal(resolvePublicationEditableDraftSlug(publication), "draft-primary");
  assert.equal(resolvePublicationDraftLookupSlug(publication), "draft-primary");
  assert.equal(
    resolvePublicationDraftLookupSlug(
      { slugOriginal: "draft-original", slug: "publico-final" },
      "fallback-draft"
    ),
    "draft-original"
  );
  assert.equal(
    resolvePublicationDraftLookupSlug({ slug: "publico-final" }, "fallback-draft"),
    "publico-final"
  );
});

test("buildDraftPublicationReadPlan keeps direct public lookup before slugOriginal query", () => {
  const plan = buildDraftPublicationReadPlan({
    draftSlug: "Borrador Uno",
    draftData: {
      slugPublico: "Publico Uno",
      publicationLifecycle: { activePublicSlug: "Publico Dos" },
    },
  });

  assert.deepEqual(plan, {
    draftSlug: "Borrador Uno",
    directPublicSlugs: ["publico-uno", "publico-dos", "borrador-uno"],
    slugOriginalQuery: "Borrador Uno",
  });
});

test("resolvePublicationLinkForDraftRead favors explicit draft public slug before other fallbacks", async () => {
  const calls = [];

  const result = await resolvePublicationLinkForDraftRead({
    draftSlug: "draft-uno",
    draftData: { slugPublico: "publico-explicito" },
    readPublicationBySlug: async (slug) => {
      calls.push(slug);
      if (slug !== "publico-explicito") {
        throw new Error(`unexpected lookup: ${slug}`);
      }
      return {
        id: slug,
        data: {
          slug,
          urlPublica: `https://reservaeldia.com.ar/i/${slug}`,
          readable: true,
        },
      };
    },
    queryPublicationBySlugOriginal: async () => {
      throw new Error("slugOriginal query should not run");
    },
    isPublicationReadable: (publication) => publication.readable === true,
  });

  assert.deepEqual(calls, ["publico-explicito"]);
  assert.deepEqual(result, {
    publicSlug: "publico-explicito",
    publicUrl: "https://reservaeldia.com.ar/i/publico-explicito",
    publication: {
      slug: "publico-explicito",
      urlPublica: "https://reservaeldia.com.ar/i/publico-explicito",
      readable: true,
    },
    source: "direct",
    matchedInactive: false,
  });
});

test("resolvePublicationLinkForDraftRead falls back to direct publicadas lookup by draft slug", async () => {
  const result = await resolvePublicationLinkForDraftRead({
    draftSlug: "draft-directo",
    draftData: {},
    readPublicationBySlug: async (slug) =>
      slug === "draft-directo"
        ? {
            id: slug,
            data: {
              readable: true,
            },
          }
        : null,
    queryPublicationBySlugOriginal: async () => null,
    isPublicationReadable: (publication) => publication.readable === true,
  });

  assert.equal(result.publicSlug, "draft-directo");
  assert.equal(result.publicUrl, "https://reservaeldia.com.ar/i/draft-directo");
  assert.equal(result.source, "direct");
  assert.equal(result.matchedInactive, false);
});

test("resolvePublicationLinkForDraftRead preserves slugOriginal query fallback", async () => {
  let slugOriginalCalls = 0;

  const result = await resolvePublicationLinkForDraftRead({
    draftSlug: "draft-original",
    draftData: {},
    readPublicationBySlug: async () => null,
    queryPublicationBySlugOriginal: async (draftSlug) => {
      slugOriginalCalls += 1;
      assert.equal(draftSlug, "draft-original");
      return {
        id: "publico-final",
        data: {
          slug: "publico-final",
          slugOriginal: "draft-original",
          readable: true,
        },
      };
    },
    isPublicationReadable: (publication) => publication.readable === true,
  });

  assert.equal(slugOriginalCalls, 1);
  assert.equal(result.publicSlug, "publico-final");
  assert.equal(result.publicUrl, "https://reservaeldia.com.ar/i/publico-final");
  assert.equal(result.source, "slugOriginal");
});

test("resolvePublicationLinkForDraftRead reports inactive matches without resolving a usable slug", async () => {
  const result = await resolvePublicationLinkForDraftRead({
    draftSlug: "draft-inactivo",
    draftData: { slugPublico: "publico-inactivo" },
    readPublicationBySlug: async () => ({
      id: "publico-inactivo",
      data: {
        slug: "publico-inactivo",
        readable: false,
      },
    }),
    queryPublicationBySlugOriginal: async () => null,
    isPublicationReadable: (publication) => publication.readable === true,
  });

  assert.deepEqual(result, {
    publicSlug: null,
    publicUrl: "",
    publication: null,
    source: null,
    matchedInactive: true,
  });
});

test("resolveOwnedDraftSlugForEditorRead resolves linked draft from publication slug", async () => {
  const drafts = new Map([
    [
      "draft-editable",
      {
        userId: "user-1",
        nombre: "Mi borrador",
      },
    ],
  ]);
  const publications = new Map([
    [
      "publico-uno",
      {
        userId: "user-1",
        borradorSlug: "draft-editable",
      },
    ],
  ]);

  const resolvedSlug = await resolveOwnedDraftSlugForEditorRead({
    slug: "publico-uno",
    uid: "user-1",
    readDraftBySlug: async (slug) =>
      drafts.has(slug) ? { id: slug, data: drafts.get(slug) } : null,
    readPublicationBySlug: async (slug) =>
      publications.has(slug) ? { id: slug, data: publications.get(slug) } : null,
    isDraftTrashed: () => false,
  });

  assert.equal(resolvedSlug, "draft-editable");
});

test("resolveOwnedDraftSlugForEditorRead keeps permission-denied fallback semantics", async () => {
  const permissionDenied = Object.assign(new Error("denied"), {
    code: "permission-denied",
  });

  const resolvedSlug = await resolveOwnedDraftSlugForEditorRead({
    slug: "publico-denegado",
    uid: "user-1",
    readDraftBySlug: async () => {
      throw permissionDenied;
    },
    readPublicationBySlug: async () => null,
    isDraftTrashed: () => false,
  });

  assert.equal(resolvedSlug, null);
});
