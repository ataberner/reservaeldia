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
  assert.deepEqual(result, {
    status: 404,
    headers: {
      "X-Robots-Tag": "noindex, noarchive",
    },
    body: "Invitacion publicada no encontrada",
  });
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

  assert.deepEqual(result, {
    status: 500,
    headers: {
      "X-Robots-Tag": "noindex, noarchive",
    },
    body: "No se pudo cargar la invitacion",
  });
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
