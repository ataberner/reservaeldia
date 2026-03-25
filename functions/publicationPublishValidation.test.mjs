import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIXTURE_BUCKET,
  FIXTURE_PATHS,
  createRepresentativePublishNormalizationStageState,
} from "../shared/renderAssetContractFixtures.mjs";
import {
  installFirebaseStorageMock,
} from "./testUtils/firebaseStorageMock.mjs";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

function requireBuiltModule(relativePath) {
  const absolutePath = join(__dirname, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(
      `Missing built module '${relativePath}'. Run 'npm run build' inside functions before running this test.`
    );
  }
  return require(absolutePath);
}

const {
  preparePublicationRenderState,
  validatePreparedPublicationRenderState,
} = requireBuiltModule("lib/payments/publicationPublishValidation.js");

const FIXED_SECTION = [{ id: "section-1", orden: 1, altoModo: "fijo", altura: 600 }];

test("reports legacy frozen contracts as warnings without blocking publish", () => {
  const rawObjetos = [
    {
      id: "count-legacy",
      tipo: "countdown",
      seccionId: "section-1",
      fechaISO: "2026-05-10T20:00:00.000Z",
      width: 280,
      height: 96,
    },
    {
      id: "icon-legacy",
      tipo: "icono-svg",
      seccionId: "section-1",
      width: 96,
      height: 96,
      color: "#111111",
      d: "M0 0 L10 10",
    },
  ];

  const result = validatePreparedPublicationRenderState({
    rawObjetos,
    rawSecciones: FIXED_SECTION,
    objetosFinales: rawObjetos,
    seccionesFinales: FIXED_SECTION,
  });

  const warningCodes = result.warnings.map((warning) => warning.code);

  assert.equal(result.canPublish, true);
  assert.equal(result.blockers.length, 0);
  assert.ok(warningCodes.includes("legacy-countdown-schema-v1-frozen"));
  assert.ok(warningCodes.includes("countdown-target-compat-alias"));
  assert.ok(warningCodes.includes("legacy-icono-svg-frozen"));
});

test("keeps v2 frame validation blocking while avoiding false legacy warnings", () => {
  const rawObjetos = [
    {
      id: "count-modern",
      tipo: "countdown",
      seccionId: "section-1",
      countdownSchemaVersion: 2,
      fechaObjetivo: "2026-05-10T20:00:00.000Z",
      frameSvgUrl: "gs://private/frame.svg",
      width: 320,
      height: 120,
      visibleUnits: ["days", "hours", "minutes", "seconds"],
    },
  ];

  const result = validatePreparedPublicationRenderState({
    rawObjetos,
    rawSecciones: FIXED_SECTION,
    objetosFinales: rawObjetos,
    seccionesFinales: FIXED_SECTION,
  });

  const warningCodes = result.warnings.map((warning) => warning.code);
  const blockerCodes = result.blockers.map((blocker) => blocker.code);

  assert.equal(result.canPublish, false);
  assert.ok(blockerCodes.includes("countdown-frame-unresolved"));
  assert.ok(!warningCodes.includes("legacy-countdown-schema-v1-frozen"));
});

test("blocks the representative asset-heavy draft when publish normalization is skipped", () => {
  const draftState = createRepresentativePublishNormalizationStageState();

  const result = validatePreparedPublicationRenderState({
    rawObjetos: draftState.objetos,
    rawSecciones: draftState.secciones,
    objetosFinales: draftState.objetos,
    seccionesFinales: draftState.secciones,
  });

  const blockerCodes = result.blockers.map((blocker) => blocker.code);

  assert.equal(result.canPublish, false);
  assert.ok(blockerCodes.includes("image-asset-unresolved"));
  assert.ok(blockerCodes.includes("icon-asset-unresolved"));
  assert.ok(blockerCodes.includes("gallery-media-unresolved"));
  assert.ok(blockerCodes.includes("countdown-frame-unresolved"));
  assert.ok(blockerCodes.includes("section-background-unresolved"));
});

test("prepares the representative asset-heavy draft into a publish-safe state", async (t) => {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: {
      [FIXTURE_PATHS.heroImage]: {},
      [FIXTURE_PATHS.rasterIcon]: {},
      [FIXTURE_PATHS.galleryOne]: {},
      [FIXTURE_PATHS.galleryTwo]: {},
      [FIXTURE_PATHS.galleryThree]: {},
      [FIXTURE_PATHS.sectionBackground]: {},
      [FIXTURE_PATHS.decorTop]: {},
      [FIXTURE_PATHS.decorBottom]: {},
      [FIXTURE_PATHS.countdownFrame]: {},
    },
  });
  t.after(() => storageMock.restore());

  const draftState = createRepresentativePublishNormalizationStageState();
  const prepared = await preparePublicationRenderState(draftState);
  const result = validatePreparedPublicationRenderState({
    rawObjetos: draftState.objetos,
    rawSecciones: draftState.secciones,
    objetosFinales: prepared.objetosFinales,
    seccionesFinales: prepared.seccionesFinales,
    functionalCtaContract: prepared.functionalCtaContract,
  });

  const warningCodes = result.warnings.map((warning) => warning.code);
  const blockerCodes = result.blockers.map((blocker) => blocker.code);

  assert.equal(result.canPublish, true);
  assert.equal(result.blockers.length, 0);
  assert.ok(warningCodes.includes("legacy-countdown-schema-v1-frozen"));
  assert.ok(warningCodes.includes("countdown-target-compat-alias"));
  assert.ok(warningCodes.includes("legacy-icono-svg-frozen"));
  assert.ok(!blockerCodes.includes("image-asset-unresolved"));
  assert.ok(!blockerCodes.includes("icon-asset-unresolved"));
  assert.ok(!blockerCodes.includes("gallery-media-unresolved"));
  assert.ok(!blockerCodes.includes("countdown-frame-unresolved"));
  assert.ok(!blockerCodes.includes("section-background-unresolved"));
  assert.ok(!blockerCodes.includes("section-decoration-unresolved"));
});
