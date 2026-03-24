import * as admin from "firebase-admin";

export type DecorCatalogStatus =
  | "active"
  | "archived"
  | "rejected"
  | "processing";

export type DecorValidationStatus = "passed" | "warning" | "rejected";

export type DecorValidationSeverity = "error" | "warning";

export type TimestampLike =
  | admin.firestore.Timestamp
  | admin.firestore.FieldValue
  | Date
  | null;

export type DecorValidationIssue = {
  code: string;
  message: string;
  severity: DecorValidationSeverity;
};

export type DecorValidationChecks = {
  fileName: string | null;
  mimeType: string | null;
  bytes: number;
  format: string | null;
  width: number | null;
  height: number | null;
  hasAlpha: boolean | null;
  isVector: boolean;
  normalizationApplied: string[];
};

export type DecorValidationReport = {
  status: DecorValidationStatus;
  errors: DecorValidationIssue[];
  warnings: DecorValidationIssue[];
  checks: DecorValidationChecks;
};

export type DecorThumbVariant = {
  storagePath: string;
  url: string;
  width: number | null;
  height: number | null;
  bytes: number;
  format: string;
};

export type DecorThumbnails = {
  card: DecorThumbVariant | null;
  thumb: DecorThumbVariant | null;
};

export type DecorSectionDecorationSlot = "superior" | "inferior";

export type DecorSectionDecorationHints = {
  enabled: boolean;
  slots: DecorSectionDecorationSlot[];
  defaultWidth: number | null;
  defaultHeight: number | null;
};

export type DecorQualityData = {
  ratio: number | null;
  megapixels: number | null;
  isVector: boolean;
};

export type DecorStatsData = {
  usesCount: number;
  lastUsedAt: TimestampLike;
  lastUsedSlug: string | null;
};

export type DecorAuditData = {
  createdByUid: string | null;
  updatedByUid: string | null;
  archivedByUid: string | null;
  revalidatedByUid: string | null;
  lastValidatedAt: TimestampLike;
  processorVersion: string | null;
  processorFingerprint: string | null;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
  archivedAt: TimestampLike;
};

export type DecorCatalogDoc = {
  nombre: string;
  url: string;
  categoria: string;
  categorias: string[];
  keywords: string[];
  tags: string[];
  popular: boolean;
  priority: number;
  schemaVersion: number;
  assetType: "decoracion";
  status: DecorCatalogStatus;
  storagePath: string | null;
  contentType: string | null;
  bytes: number | null;
  hashSha256: string | null;
  format: string | null;
  width: number | null;
  height: number | null;
  hasAlpha: boolean | null;
  thumbnails: DecorThumbnails | null;
  sectionDecorationHints: DecorSectionDecorationHints | null;
  searchText: string;
  searchTokens: string[];
  validation: DecorValidationReport | null;
  quality: DecorQualityData | null;
  stats: DecorStatsData;
  audit: DecorAuditData;
  creado: TimestampLike;
  creadoEn: TimestampLike;
  actualizadoEn: TimestampLike;
};

export type DecorCatalogDocWithId = DecorCatalogDoc & {
  id: string;
};
