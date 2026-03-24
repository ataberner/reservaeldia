import * as admin from "firebase-admin";

export type IconCatalogStatus =
  | "active"
  | "archived"
  | "rejected"
  | "duplicate"
  | "processing";

export type IconAssetType = "icon" | "decoracion";

export type IconValidationStatus = "passed" | "warning" | "rejected";

export type IconValidationSeverity = "error" | "warning";

export type IconUsageMap = Record<string, number>;

export type TimestampLike =
  | admin.firestore.Timestamp
  | admin.firestore.FieldValue
  | Date
  | null;

export type IconValidationIssue = {
  code: string;
  message: string;
  severity: IconValidationSeverity;
};

export type IconValidationChecks = {
  fileName: string | null;
  mimeType: string | null;
  bytes: number;
  hasViewBox: boolean;
  viewBox: string | null;
  viewBoxWidth: number | null;
  viewBoxHeight: number | null;
  isSquare: boolean | null;
  hasFixedDimensions: boolean;
  hasPath: boolean;
  shapeNodeCount: number;
  colorMode: "currentColor" | "fixed";
  normalizationApplied: string[];
};

export type IconValidationReport = {
  status: IconValidationStatus;
  errors: IconValidationIssue[];
  warnings: IconValidationIssue[];
  checks: IconValidationChecks;
  normalizedSvgText: string | null;
  normalizedBytes: number | null;
};

export type IconQualityData = {
  isColorizable: boolean;
  pathCount: number;
  viewBox: string | null;
  ratio: number | null;
  complexityScore: number;
};

export type IconStatsData = {
  usesCount: number;
  lastUsedAt: TimestampLike;
  lastUsedSlug: string | null;
};

export type IconAuditData = {
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

export type IconCatalogDoc = {
  nombre: string;
  url: string;
  categoria: string;
  categorias: string[];
  keywords: string[];
  tags: string[];
  popular: boolean;
  prioridadLegacy: number | null;
  schemaVersion: number;
  assetType: IconAssetType;
  status: IconCatalogStatus;
  priority: number;
  storagePath: string | null;
  contentType: string | null;
  bytes: number | null;
  hashSha256: string | null;
  format: string | null;
  searchText: string;
  searchTokens: string[];
  validation: IconValidationReport | null;
  quality: IconQualityData | null;
  stats: IconStatsData;
  audit: IconAuditData;
  creado: TimestampLike;
  creadoEn: TimestampLike;
  actualizadoEn: TimestampLike;
};

export type IconCatalogDocWithId = IconCatalogDoc & {
  id: string;
};

export type IconListResponse = {
  items: IconCatalogDocWithId[];
  archivedItems?: IconCatalogDocWithId[];
};

export type ApplyIconUsageDeltaResult = {
  newUsage: IconUsageMap;
  oldUsage: IconUsageMap;
  appliedDelta: IconUsageMap;
  unresolvedRefs: string[];
  resolvedRefs: number;
};

export type IconUsageSnapshotDoc = {
  dateKey: string;
  generatedAt: TimestampLike;
  totals: IconUsageMap;
  unresolvedRefs: number;
  scannedDrafts: number;
  scannedPublications: number;
  source: "daily-scan" | "reconcile";
};

