import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  resolvePublicInvitationHtmlResponse,
  resolvePublicShareImageResponse,
} = requireBuiltModule("lib/payments/publicDeliveryRoutes.js");

function createActivePublication(overrides = {}) {
  return {
    estado: "publicada_activa",
    nombre: "Fiesta",
    userId: "user-1",
    ...overrides,
  };
}

function createLogger() {
  const calls = {
    warnings: [],
    errors: [],
  };

  return {
    calls,
    logger: {
      warn(message, context) {
        calls.warnings.push({ message, context });
      },
      error(message, context) {
        calls.errors.push({ message, context });
      },
    },
  };
}

function assertUnavailableHtml(result, status, slug = "mi-slug") {
  assert.equal(result.status, status);
  assert.deepEqual(result.headers, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    "X-Robots-Tag": "noindex, noarchive",
  });
  assert.match(String(result.body), /<!doctype html>/);
  assert.match(String(result.body), /<html lang="es">/);
  assert.match(String(result.body), /name="viewport"/);
  assert.match(String(result.body), status >= 500
    ? /<h1>No pudimos cargar la invitación<\/h1>/
    : /<h1>Invitación no disponible<\/h1>/);
  assert.ok(String(result.body).includes(`href="${slug ? `/i/${slug}` : "/"}"`));
  assert.doesNotMatch(String(result.body), /<script|publicada_pausada|user-1/);
}

for (const [name, publicationData] of [
  ["missing", null],
  ["paused", createActivePublication({ estado: "publicada_pausada" })],
  ["trashed", createActivePublication({ estado: "papelera" })],
  ["draft", createActivePublication({ estado: "draft" })],
  ["finalized", createActivePublication({ estado: "finalized" })],
  ["expired", createActivePublication({ venceAt: "2000-01-01T00:00:00Z" })],
]) {
  test(`public invitation ${name} rejection is not cached and does not read the artifact`, async () => {
    let finalized = 0;
    const result = await resolvePublicInvitationHtmlResponse({
      slugInput: "mi-slug",
      async loadPublicationData() { return publicationData; },
      async finalizeExpiredPublication() { finalized += 1; },
      async readPublicHtmlArtifact() { assert.fail("must reject before reading storage"); },
    });
    assertUnavailableHtml(result, 404);
    assert.equal(finalized, name === "expired" ? 1 : 0);
  });
}

test("public invitation invalid slug and metadata failures return uncached error pages", async () => {
  const params = {
    slugInput: "",
    async loadPublicationData() { throw new Error("private backend details"); },
    async finalizeExpiredPublication() { assert.fail("must not finalize"); },
    async readPublicHtmlArtifact() { assert.fail("must not read storage"); },
  };
  assertUnavailableHtml(await resolvePublicInvitationHtmlResponse(params), 400, "");
  const failed = await resolvePublicInvitationHtmlResponse({ ...params, slugInput: "mi-slug" });
  assertUnavailableHtml(failed, 500);
  assert.doesNotMatch(String(failed.body), /private backend details/);
});

test("same public url recovers from missing or paused to active without a cacheable rejection", async () => {
  let publicationData = null;
  let htmlReads = 0;
  const params = {
    slugInput: "mi-slug",
    async loadPublicationData() { return publicationData; },
    async finalizeExpiredPublication() { assert.fail("must not finalize"); },
    async readPublicHtmlArtifact() { htmlReads += 1; return "<html>invitation</html>"; },
  };
  assertUnavailableHtml(await resolvePublicInvitationHtmlResponse(params), 404);
  publicationData = createActivePublication({ estado: "publicada_pausada" });
  assertUnavailableHtml(await resolvePublicInvitationHtmlResponse(params), 404);
  publicationData = createActivePublication();
  const active = await resolvePublicInvitationHtmlResponse(params);
  assert.equal(active.status, 200);
  assert.equal(active.body, "<html>invitation</html>");
  assert.equal(active.headers["Cache-Control"], "private, no-store, max-age=0");
  assert.equal(htmlReads, 1);
});

test("public share errors are never cached, including lifecycle, missing artifact and read failures", async () => {
  const params = {
    slugInput: "mi-slug",
    requestedVersionInput: "v1",
    async loadPublicationData() {
      return createActivePublication({
        share: { status: "generated", source: "renderer", version: "v1",
          storagePath: "publicadas/mi-slug/share.jpg" },
      });
    },
    async finalizeExpiredPublication() { assert.fail("must not finalize"); },
    async readPublicShareImageArtifact() { return null; },
  };
  for (const [expectedStatus, override] of [
    [400, { slugInput: "" }],
    [404, { async loadPublicationData() { return null; } }],
    [404, { async loadPublicationData() { return createActivePublication({ estado: "publicada_pausada" }); } }],
    [404, {}],
    [500, { async readPublicShareImageArtifact() { throw new Error("storage failed"); } }],
  ]) {
    const result = await resolvePublicShareImageResponse({ ...params, ...override });
    assert.equal(result.status, expectedStatus);
    assert.equal(result.headers["Cache-Control"], "private, no-store, max-age=0");
    assert.equal(result.headers["X-Robots-Tag"], "noindex");
  }
});

test("public invitation route fails closed when published metadata exists but index artifact is missing", async () => {
  let htmlReads = 0;
  const result = await resolvePublicInvitationHtmlResponse({
    slugInput: "mi-slug",
    async loadPublicationData(slug) {
      assert.equal(slug, "mi-slug");
      return createActivePublication();
    },
    async finalizeExpiredPublication() {
      throw new Error("should not finalize active publication");
    },
    async readPublicHtmlArtifact(slug) {
      htmlReads += 1;
      assert.equal(slug, "mi-slug");
      return null;
    },
  });

  assert.equal(htmlReads, 1);
  assertUnavailableHtml(result, 404);
});

test("public invitation route serves active html with noindex robots headers", async () => {
  const result = await resolvePublicInvitationHtmlResponse({
    slugInput: "mi-slug",
    async loadPublicationData() {
      return createActivePublication();
    },
    async finalizeExpiredPublication() {
      throw new Error("should not finalize active publication");
    },
    async readPublicHtmlArtifact(slug) {
      assert.equal(slug, "mi-slug");
      return "<!doctype html><html><head></head><body>ok</body></html>";
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.headers, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    "X-Robots-Tag": "noindex, noarchive",
  });
  assert.match(String(result.body), /<body>ok<\/body>/);
});

test("public invitation route fails closed when index artifact cannot be downloaded", async () => {
  const { calls, logger } = createLogger();
  const result = await resolvePublicInvitationHtmlResponse({
    slugInput: "mi-slug",
    async loadPublicationData() {
      return createActivePublication();
    },
    async finalizeExpiredPublication() {
      throw new Error("should not finalize active publication");
    },
    async readPublicHtmlArtifact() {
      throw new Error("storage read failed");
    },
    logger,
  });

  assertUnavailableHtml(result, 500);
  assert.equal(calls.errors.length, 1);
  assert.equal(calls.errors[0].message, "Error descargando invitacion publica por slug");
  assert.equal(calls.errors[0].context.slug, "mi-slug");
  assert.equal(calls.errors[0].context.error, "storage read failed");
});

test("public share image route rejects stale versions before reading storage", async () => {
  let shareReads = 0;
  const result = await resolvePublicShareImageResponse({
    slugInput: "mi-slug",
    requestedVersionInput: "old-version",
    async loadPublicationData() {
      return createActivePublication({
        share: {
          status: "generated",
          source: "renderer",
          storagePath: "publicadas/mi-slug/share.jpg",
          version: "current-version",
          imageUrl: "https://reservaeldia.com.ar/i/mi-slug/share.jpg?v=current-version",
        },
      });
    },
    async finalizeExpiredPublication() {
      throw new Error("should not finalize active publication");
    },
    async readPublicShareImageArtifact() {
      shareReads += 1;
      return Buffer.from("stale");
    },
    async isShareImageCompliant() {
      throw new Error("should not validate stale version");
    },
  });

  assert.equal(shareReads, 0);
  assert.deepEqual(result, {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex",
    },
    body: "Imagen share no encontrada",
  });
});

test("public share image route rejects fallback metadata as non-current generated output", async () => {
  let shareReads = 0;
  const result = await resolvePublicShareImageResponse({
    slugInput: "mi-slug",
    requestedVersionInput: "fallback-version",
    async loadPublicationData() {
      return createActivePublication({
        share: {
          status: "fallback",
          source: "static-default",
          storagePath: null,
          version: "fallback-version",
          imageUrl: "https://reservaeldia.com.ar/assets/img/default-share.jpg?v=fallback-version",
        },
      });
    },
    async finalizeExpiredPublication() {
      throw new Error("should not finalize active publication");
    },
    async readPublicShareImageArtifact() {
      shareReads += 1;
      return Buffer.from("fallback");
    },
    async isShareImageCompliant() {
      throw new Error("should not validate fallback metadata");
    },
  });

  assert.equal(shareReads, 0);
  assert.deepEqual(result, {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex",
    },
    body: "Imagen share no encontrada",
  });
});

test("public share image route serves only current generated metadata with a compliant artifact", async () => {
  const image = Buffer.from("jpeg");
  const result = await resolvePublicShareImageResponse({
    slugInput: "mi-slug",
    requestedVersionInput: ["current-version"],
    async loadPublicationData() {
      return createActivePublication({
        share: {
          status: "generated",
          source: "published-html-first-section",
          storagePath: "publicadas/mi-slug/share.jpg",
          version: "current-version",
          imageUrl: "https://reservaeldia.com.ar/i/mi-slug/share.jpg?v=current-version",
        },
      });
    },
    async finalizeExpiredPublication() {
      throw new Error("should not finalize active publication");
    },
    async readPublicShareImageArtifact(slug) {
      assert.equal(slug, "mi-slug");
      return image;
    },
    async isShareImageCompliant(input) {
      assert.equal(input, image);
      return true;
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.headers, {
    "Content-Type": "image/jpeg",
    "Cache-Control": "public,max-age=31536000,immutable",
    "X-Robots-Tag": "noindex",
  });
  assert.equal(result.body, image);
});

test("public share image route fails closed when the current artifact is not compliant", async () => {
  const { calls, logger } = createLogger();
  const result = await resolvePublicShareImageResponse({
    slugInput: "mi-slug",
    requestedVersionInput: "current-version",
    async loadPublicationData() {
      return createActivePublication({
        share: {
          status: "generated",
          source: "renderer",
          storagePath: "publicadas/mi-slug/share.jpg",
          version: "current-version",
          imageUrl: "https://reservaeldia.com.ar/i/mi-slug/share.jpg?v=current-version",
        },
      });
    },
    async finalizeExpiredPublication() {
      throw new Error("should not finalize active publication");
    },
    async readPublicShareImageArtifact() {
      return Buffer.from("not-a-valid-share-image");
    },
    async isShareImageCompliant() {
      return false;
    },
    logger,
  });

  assert.deepEqual(result, {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex",
    },
    body: "Imagen share no encontrada",
  });
  assert.equal(calls.warnings.length, 1);
  assert.equal(
    calls.warnings[0].message,
    "Imagen share publica no cumple dimensiones requeridas"
  );
  assert.equal(calls.warnings[0].context.slug, "mi-slug");
});
