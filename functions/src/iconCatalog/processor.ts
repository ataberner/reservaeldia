import { createHash } from "crypto";
import * as admin from "firebase-admin";
import {
  ICON_CATALOG_PROCESSOR_VERSION,
  ICON_CATALOG_SCHEMA_VERSION,
  ICONOS_V2_AUTO_NORMALIZE_CURRENTCOLOR,
  ICONOS_V2_AUTO_NORMALIZE_SAFE,
  ICONOS_V2_ENFORCEMENT,
  ICONOS_V2_ENABLED,
} from "./config";
import { mergeLegacyMetadata, normalizeIconMetadata, normalizeStatus } from "./metadata";
import {
  activeIconCollection,
  readStorageFile,
  resolveStoragePathFromIconData,
  sha256Hex,
  uploadNormalizedSvg,
} from "./repository";
import { inspectAndNormalizeSvg } from "./svgValidation";
import type {
  IconCatalogStatus,
  IconValidationIssue,
  IconValidationReport,
} from "./types";

type ProcessIconDocParams = {
  iconId: string;
  rawData: Record<string, unknown>;
  force: boolean;
  triggeredByUid: string | null;
};

type ProcessIconDocResult = {
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
): IconValidationIssue {
  return { severity, code, message };
}

function nonSvgValidation(params: {
  fileName: string;
  contentType: string | null;
  bytes: number;
}): IconValidationReport {
  const warnings: IconValidationIssue[] = [];
  const errors: IconValidationIssue[] = [];
  if (params.bytes <= 0) {
    errors.push(
      makeIssue(
        "error",
        "ICON_ASSET_EMPTY_FILE",
        "El archivo esta vacio."
      )
    );
  }

  const mimeType = normalizeString(params.contentType || "application/octet-stream");
  const format = mimeType.startsWith("image/") ? mimeType.replace(/^image\//, "") : "";
  if (mimeType && !mimeType.startsWith("image/")) {
    warnings.push(
      makeIssue(
        "warning",
        "ICON_ASSET_UNEXPECTED_MIME",
        "El archivo no reporta un MIME de imagen."
      )
    );
  }

  const status = errors.length
    ? "rejected"
    : warnings.length
      ? "warning"
      : "passed";

  return {
    status,
    errors,
    warnings,
    checks: {
      fileName: params.fileName || null,
      mimeType: mimeType || null,
      bytes: params.bytes,
      hasViewBox: false,
      viewBox: null,
      viewBoxWidth: null,
      viewBoxHeight: null,
      isSquare: null,
      hasFixedDimensions: false,
      hasPath: false,
      shapeNodeCount: 0,
      colorMode: format === "gif" ? "fixed" : "fixed",
      normalizationApplied: [],
    },
    normalizedSvgText: null,
    normalizedBytes: null,
  };
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
    assetType: normalizeString(raw.assetType || "icon"),
    format: normalizeString(raw.format || raw.formato || ""),
  };
  return createHash("sha256")
    .update(JSON.stringify(fingerprintPayload))
    .digest("hex");
}

function toValidationStatusForMode(report: IconValidationReport): IconCatalogStatus {
  if (ICONOS_V2_ENFORCEMENT === "observe") return "active";
  if (report.status === "rejected") return "rejected";
  if (ICONOS_V2_ENFORCEMENT === "strict" && report.warnings.length > 0) {
    return "rejected";
  }
  return "active";
}

async function findDuplicateIconId(iconId: string, hashSha256: string): Promise<string | null> {
  if (!hashSha256) return null;
  const duplicateSnap = await activeIconCollection()
    .where("hashSha256", "==", hashSha256)
    .limit(4)
    .get();

  for (const docItem of duplicateSnap.docs) {
    if (docItem.id === iconId) continue;
    return docItem.id;
  }
  return null;
}

function countPathNodes(svgText: string | null): number {
  if (!svgText) return 0;
  const matches = svgText.match(/<path[\s>]/gi);
  return matches ? matches.length : 0;
}

export async function processIconDocumentV2(
  params: ProcessIconDocParams
): Promise<ProcessIconDocResult> {
  if (!ICONOS_V2_ENABLED) {
    return {
      skip: true,
      patch: {},
      shouldArchive: false,
      archiveReason: null,
    };
  }

  const iconId = normalizeString(params.iconId);
  if (!iconId) {
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
    previousProcessorVersion === ICON_CATALOG_PROCESSOR_VERSION
  ) {
    return {
      skip: true,
      patch: {},
      shouldArchive: false,
      archiveReason: null,
    };
  }

  const storagePath = resolveStoragePathFromIconData(raw);
  if (!storagePath) {
    const report: IconValidationReport = {
      status: "rejected",
      errors: [
        makeIssue(
          "error",
          "ICON_ASSET_STORAGE_PATH_MISSING",
          "No se pudo resolver storagePath para el icono."
        ),
      ],
      warnings: [],
      checks: {
        fileName: normalizeString(raw.nombre || iconId) || null,
        mimeType: null,
        bytes: 0,
        hasViewBox: false,
        viewBox: null,
        viewBoxWidth: null,
        viewBoxHeight: null,
        isSquare: null,
        hasFixedDimensions: false,
        hasPath: false,
        shapeNodeCount: 0,
        colorMode: "fixed",
        normalizationApplied: [],
      },
      normalizedSvgText: null,
      normalizedBytes: null,
    };

    return {
      skip: false,
      patch: {
        schemaVersion: ICON_CATALOG_SCHEMA_VERSION,
        status: "rejected",
        validation: {
          status: report.status,
          errors: report.errors,
          warnings: report.warnings,
          checks: report.checks,
        },
        audit: {
          ...audit,
          revalidatedByUid: params.triggeredByUid || null,
          lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
          processorVersion: ICON_CATALOG_PROCESSOR_VERSION,
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
  const fileName = normalizeString(raw.nombre || storagePath.split("/").pop() || iconId);

  if (!storageFile.exists || !storageFile.buffer) {
    const report: IconValidationReport = {
      status: "rejected",
      errors: [
        makeIssue(
          "error",
          "ICON_ASSET_NOT_FOUND",
          "No se encontro el archivo en Storage para el icono."
        ),
      ],
      warnings: [],
      checks: {
        fileName: fileName || null,
        mimeType: null,
        bytes: 0,
        hasViewBox: false,
        viewBox: null,
        viewBoxWidth: null,
        viewBoxHeight: null,
        isSquare: null,
        hasFixedDimensions: false,
        hasPath: false,
        shapeNodeCount: 0,
        colorMode: "fixed",
        normalizationApplied: [],
      },
      normalizedSvgText: null,
      normalizedBytes: null,
    };

    return {
      skip: false,
      patch: {
        schemaVersion: ICON_CATALOG_SCHEMA_VERSION,
        storagePath,
        status: "rejected",
        validation: {
          status: report.status,
          errors: report.errors,
          warnings: report.warnings,
          checks: report.checks,
        },
        audit: {
          ...audit,
          revalidatedByUid: params.triggeredByUid || null,
          lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
          processorVersion: ICON_CATALOG_PROCESSOR_VERSION,
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

  const metadataNormalized = normalizeIconMetadata({
    ...raw,
    contentType: storageFile.contentType,
    format: raw.format || raw.formato,
  });

  const format = metadataNormalized.format || "";
  let validation: IconValidationReport;
  let hashSha256 = sha256Hex(storageFile.buffer);
  let bytes = storageFile.size || storageFile.buffer.byteLength;
  let canonicalUrl = normalizeString(raw.url);
  let pathCount = 0;

  if (format === "svg" || storageFile.contentType === "image/svg+xml") {
    const svgText = storageFile.buffer.toString("utf8");
    validation = inspectAndNormalizeSvg({
      svgText,
      fileName,
      bytes,
      normalizeSafe: ICONOS_V2_AUTO_NORMALIZE_SAFE,
      normalizeCurrentColor: ICONOS_V2_AUTO_NORMALIZE_CURRENTCOLOR,
    });

    if (validation.normalizedSvgText && validation.normalizedSvgText !== svgText) {
      const uploaded = await uploadNormalizedSvg({
        storagePath,
        svgText: validation.normalizedSvgText,
        previousMetadata: storageFile.metadata,
      });
      canonicalUrl = uploaded.url;
      bytes = uploaded.bytes;
      hashSha256 = sha256Hex(validation.normalizedSvgText);
    } else if (validation.normalizedSvgText) {
      hashSha256 = sha256Hex(validation.normalizedSvgText);
    }
    pathCount = countPathNodes(validation.normalizedSvgText || svgText);
  } else {
    validation = nonSvgValidation({
      fileName,
      contentType: storageFile.contentType,
      bytes,
    });
    pathCount = 0;
  }

  const statusFromValidation = toValidationStatusForMode(validation);
  const duplicateOf =
    statusFromValidation === "active"
      ? await findDuplicateIconId(iconId, hashSha256)
      : null;

  const finalStatus: IconCatalogStatus = duplicateOf ? "duplicate" : statusFromValidation;
  const shouldArchive =
    finalStatus === "rejected" || finalStatus === "duplicate";

  const mergedLegacy = mergeLegacyMetadata(raw, metadataNormalized);
  const qualityRatio =
    validation.checks.viewBoxWidth &&
    validation.checks.viewBoxHeight &&
    validation.checks.viewBoxHeight > 0
      ? Number(validation.checks.viewBoxWidth) / Number(validation.checks.viewBoxHeight)
      : null;
  const complexityScore =
    pathCount * 3 + (validation.checks.shapeNodeCount || 0);

  const patch: Record<string, unknown> = {
    ...mergedLegacy,
    schemaVersion: ICON_CATALOG_SCHEMA_VERSION,
    status: finalStatus,
    storagePath,
    url: canonicalUrl || normalizeString(raw.url),
    contentType: storageFile.contentType || null,
    bytes,
    hashSha256,
    format: metadataNormalized.format,
    validation: {
      status: validation.status,
      errors: validation.errors,
      warnings: validation.warnings,
      checks: validation.checks,
    },
    quality: {
      isColorizable: validation.checks.colorMode === "currentColor",
      pathCount,
      viewBox: validation.checks.viewBox,
      ratio: qualityRatio,
      complexityScore,
    },
    stats: {
      usesCount: Number(
        asObject(raw.stats).usesCount || 0
      ),
      lastUsedAt: asObject(raw.stats).lastUsedAt || null,
      lastUsedSlug: normalizeString(asObject(raw.stats).lastUsedSlug) || null,
    },
    duplicateOf: duplicateOf || admin.firestore.FieldValue.delete(),
    audit: {
      ...audit,
      revalidatedByUid: params.triggeredByUid || null,
      lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
      processorVersion: ICON_CATALOG_PROCESSOR_VERSION,
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
    archiveReason: shouldArchive
      ? finalStatus === "duplicate"
        ? "duplicate-content"
        : "validation-rejected"
      : null,
  };
}

