import { createHash } from "crypto";
import * as admin from "firebase-admin";
import sharp from "sharp";
import {
  DECOR_CATALOG_PROCESSOR_VERSION,
  DECOR_CATALOG_SCHEMA_VERSION,
  DECOR_CATALOG_STORAGE_THUMBNAILS_PREFIX,
  DECOR_V1_ENFORCEMENT,
  DECOR_V1_ENABLED,
} from "./config";
import { mergeLegacyMetadata, normalizeDecorMetadata, normalizeStatus } from "./metadata";
import {
  readStorageFile,
  resolveStoragePathFromDecorData,
  sha256Hex,
  uploadBinaryWithToken,
} from "./repository";
import { inspectDecorAsset } from "./rasterValidation";
import type {
  DecorCatalogStatus,
  DecorThumbnails,
  DecorValidationIssue,
} from "./types";

type ProcessDecorDocParams = {
  decorId: string;
  rawData: Record<string, unknown>;
  force: boolean;
  triggeredByUid: string | null;
};

type ProcessDecorDocResult = {
  skip: boolean;
  patch: Record<string, unknown>;
  shouldArchive: boolean;
  archiveReason: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function makeIssue(
  severity: "error" | "warning",
  code: string,
  message: string
): DecorValidationIssue {
  return { severity, code, message };
}

function deriveProcessorFingerprint(raw: Record<string, unknown>): string {
  const fingerprintPayload = {
    nombre: normalizeString(raw.nombre),
    url: normalizeString(raw.url),
    storagePath: normalizeString(raw.storagePath),
    categoria: raw.categoria || "",
    categorias: Array.isArray(raw.categorias) ? raw.categorias : [],
    keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    popular: raw.popular === true,
    priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : null,
    status: normalizeStatus(raw.status),
    format: normalizeString(raw.format || raw.formato || ""),
    bytes: Number(raw.bytes || 0),
  };

  return createHash("sha256").update(JSON.stringify(fingerprintPayload)).digest("hex");
}

function toStatusForMode(status: "passed" | "warning" | "rejected"): DecorCatalogStatus {
  if (DECOR_V1_ENFORCEMENT === "observe") return "active";
  if (status === "rejected") return "rejected";
  if (DECOR_V1_ENFORCEMENT === "strict" && status === "warning") {
    return "rejected";
  }
  return "active";
}

type UploadedThumb = {
  storagePath: string;
  url: string;
  bytes: number;
  width: number | null;
  height: number | null;
};

async function buildThumbVariant(params: {
  decorId: string;
  variant: "card" | "thumb";
  sourceBuffer: Buffer;
  width: number;
  height: number;
  quality: number;
}): Promise<UploadedThumb> {
  const rendered = await sharp(params.sourceBuffer, { animated: false, failOnError: false })
    .resize({
      width: params.width,
      height: params.height,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: params.quality })
    .toBuffer();

  const uploaded = await uploadBinaryWithToken({
    storagePath: `${DECOR_CATALOG_STORAGE_THUMBNAILS_PREFIX}${params.decorId}/${params.variant}.webp`,
    buffer: rendered,
    contentType: "image/webp",
  });

  const meta = await sharp(rendered, { animated: false, failOnError: false }).metadata();

  return {
    ...uploaded,
    width: Number.isFinite(Number(meta.width)) ? Number(meta.width) : null,
    height: Number.isFinite(Number(meta.height)) ? Number(meta.height) : null,
  };
}

async function buildThumbnails(params: {
  decorId: string;
  sourceBuffer: Buffer;
}): Promise<DecorThumbnails> {
  const [card, thumb] = await Promise.all([
    buildThumbVariant({
      decorId: params.decorId,
      variant: "card",
      sourceBuffer: params.sourceBuffer,
      width: 512,
      height: 512,
      quality: 86,
    }),
    buildThumbVariant({
      decorId: params.decorId,
      variant: "thumb",
      sourceBuffer: params.sourceBuffer,
      width: 160,
      height: 160,
      quality: 82,
    }),
  ]);

  return {
    card: {
      storagePath: card.storagePath,
      url: card.url,
      width: card.width,
      height: card.height,
      bytes: card.bytes,
      format: "webp",
    },
    thumb: {
      storagePath: thumb.storagePath,
      url: thumb.url,
      width: thumb.width,
      height: thumb.height,
      bytes: thumb.bytes,
      format: "webp",
    },
  };
}

export async function processDecorDocumentV1(
  params: ProcessDecorDocParams
): Promise<ProcessDecorDocResult> {
  if (!DECOR_V1_ENABLED) {
    return {
      skip: true,
      patch: {},
      shouldArchive: false,
      archiveReason: null,
    };
  }

  const decorId = normalizeString(params.decorId);
  if (!decorId) {
    return {
      skip: true,
      patch: {},
      shouldArchive: false,
      archiveReason: null,
    };
  }

  const raw = asObject(params.rawData);
  const audit = asObject(raw.audit);
  const currentFingerprint = deriveProcessorFingerprint(raw);
  const previousFingerprint = normalizeString(audit.processorFingerprint);
  const previousProcessorVersion = normalizeString(audit.processorVersion);

  if (
    !params.force &&
    previousFingerprint &&
    previousFingerprint === currentFingerprint &&
    previousProcessorVersion === DECOR_CATALOG_PROCESSOR_VERSION
  ) {
    return {
      skip: true,
      patch: {},
      shouldArchive: false,
      archiveReason: null,
    };
  }

  const storagePath = resolveStoragePathFromDecorData(raw);
  if (!storagePath) {
    return {
      skip: false,
      patch: {
        schemaVersion: DECOR_CATALOG_SCHEMA_VERSION,
        status: "rejected",
        validation: {
          status: "rejected",
          errors: [
            makeIssue(
              "error",
              "DECOR_ASSET_STORAGE_PATH_MISSING",
              "No se pudo resolver storagePath para la decoracion."
            ),
          ],
          warnings: [],
          checks: {
            fileName: normalizeString(raw.nombre || decorId) || null,
            mimeType: null,
            bytes: 0,
            format: null,
            width: null,
            height: null,
            hasAlpha: null,
            isVector: false,
            normalizationApplied: [],
          },
        },
        audit: {
          ...audit,
          revalidatedByUid: params.triggeredByUid || null,
          lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
          processorVersion: DECOR_CATALOG_PROCESSOR_VERSION,
          processorFingerprint: currentFingerprint,
          updatedByUid: params.triggeredByUid || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
      },
      shouldArchive: true,
      archiveReason: "validation-rejected",
    };
  }

  const storageFile = await readStorageFile(storagePath);
  const fileName = normalizeString(raw.nombre || storagePath.split("/").pop() || decorId);

  if (!storageFile.exists || !storageFile.buffer) {
    return {
      skip: false,
      patch: {
        schemaVersion: DECOR_CATALOG_SCHEMA_VERSION,
        storagePath,
        status: "rejected",
        validation: {
          status: "rejected",
          errors: [
            makeIssue(
              "error",
              "DECOR_ASSET_NOT_FOUND",
              "No se encontro el archivo en Storage para la decoracion."
            ),
          ],
          warnings: [],
          checks: {
            fileName: fileName || null,
            mimeType: null,
            bytes: 0,
            format: null,
            width: null,
            height: null,
            hasAlpha: null,
            isVector: false,
            normalizationApplied: [],
          },
        },
        audit: {
          ...audit,
          revalidatedByUid: params.triggeredByUid || null,
          lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
          processorVersion: DECOR_CATALOG_PROCESSOR_VERSION,
          processorFingerprint: currentFingerprint,
          updatedByUid: params.triggeredByUid || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
      },
      shouldArchive: true,
      archiveReason: "asset-not-found",
    };
  }

  const metadataNormalized = normalizeDecorMetadata({
    ...raw,
    contentType: storageFile.contentType,
    format: raw.format || raw.formato,
  });

  const inspected = await inspectDecorAsset({
    buffer: storageFile.buffer,
    fileName,
    contentType: storageFile.contentType,
    formatHint: metadataNormalized.format,
  });

  const statusFromValidation = toStatusForMode(inspected.validation.status);
  const shouldArchive = statusFromValidation === "rejected";

  const mergedLegacy = mergeLegacyMetadata(raw, {
    ...metadataNormalized,
    format: inspected.format || metadataNormalized.format,
  });

  let thumbnails: DecorThumbnails | null = null;
  if (!shouldArchive) {
    try {
      thumbnails = await buildThumbnails({
        decorId,
        sourceBuffer: inspected.normalizedBuffer,
      });
    } catch {
      inspected.validation.warnings.push(
        makeIssue(
          "warning",
          "DECOR_THUMBNAIL_FAILED",
          "No se pudieron generar thumbnails automaticos."
        )
      );
      inspected.validation.status = inspected.validation.errors.length
        ? "rejected"
        : "warning";
    }
  }

  const ratio =
    inspected.width && inspected.height && inspected.height > 0
      ? Number(inspected.width) / Number(inspected.height)
      : null;

  const megapixels =
    inspected.width && inspected.height
      ? Number(((inspected.width * inspected.height) / 1000000).toFixed(3))
      : null;

  const patch: Record<string, unknown> = {
    ...mergedLegacy,
    schemaVersion: DECOR_CATALOG_SCHEMA_VERSION,
    status: statusFromValidation,
    storagePath,
    url: normalizeString(raw.url),
    contentType: inspected.normalizedContentType || storageFile.contentType || null,
    bytes: storageFile.size || inspected.normalizedBuffer.byteLength,
    hashSha256: sha256Hex(inspected.normalizedBuffer),
    format: inspected.format || metadataNormalized.format,
    width: inspected.width,
    height: inspected.height,
    hasAlpha: inspected.hasAlpha,
    thumbnails,
    validation: {
      status: inspected.validation.status,
      errors: inspected.validation.errors,
      warnings: inspected.validation.warnings,
      checks: inspected.validation.checks,
    },
    quality: {
      ratio,
      megapixels,
      isVector: inspected.isVector,
    },
    stats: {
      usesCount: Number(asObject(raw.stats).usesCount || 0),
      lastUsedAt: asObject(raw.stats).lastUsedAt || null,
      lastUsedSlug: normalizeString(asObject(raw.stats).lastUsedSlug) || null,
    },
    audit: {
      ...audit,
      revalidatedByUid: params.triggeredByUid || null,
      lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
      processorVersion: DECOR_CATALOG_PROCESSOR_VERSION,
      processorFingerprint: currentFingerprint,
      updatedByUid: params.triggeredByUid || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: normalizeString(audit.createdByUid) || params.triggeredByUid || null,
      createdAt: audit.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    },
    actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!raw.creado && !raw.creadoEn) {
    patch.creado = admin.firestore.FieldValue.serverTimestamp();
    patch.creadoEn = admin.firestore.FieldValue.serverTimestamp();
  }

  return {
    skip: false,
    patch,
    shouldArchive,
    archiveReason: shouldArchive ? "validation-rejected" : null,
  };
}
