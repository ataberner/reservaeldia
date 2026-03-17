export type TemplateType =
  | "boda"
  | "bautismo"
  | "cumple"
  | "quince"
  | "empresarial"
  | "general";

export type TemplateFieldType =
  | "text"
  | "textarea"
  | "date"
  | "time"
  | "datetime"
  | "location"
  | "url"
  | "images";

export interface TemplateFieldValidation {
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
}

export type TemplateFieldUpdateMode = "input" | "blur" | "confirm";

export type TemplateFieldApplyTargetTransformKind =
  | "identity"
  | "date_to_countdown_iso"
  | "date_to_text";

export interface TemplateFieldApplyTargetTransform {
  kind: TemplateFieldApplyTargetTransformKind;
  preset?: string;
}

export interface TemplateFieldApplyTarget {
  scope: "objeto" | "seccion" | "rsvp";
  id?: string;
  path: string;
  mode?: "set" | "replace";
  transform?: TemplateFieldApplyTargetTransform;
}

export interface TemplateField {
  key: string;
  label: string;
  type: TemplateFieldType;
  group: string;
  placeholder?: string;
  helperText?: string;
  optional: boolean;
  validation?: TemplateFieldValidation;
  updateMode?: TemplateFieldUpdateMode;
  applyTargets?: TemplateFieldApplyTarget[];
}

export interface TemplateRating {
  value: number;
  count: number;
}

export interface TemplatePopularity {
  label: string;
  score?: number;
}

export interface TemplatePreview {
  previewUrl: string | null;
  viewportHints?: "mobileFirst" | "desktop" | "responsive";
  aspectRatio?: string;
  suggestedHeightPx?: number;
}

export interface TemplateGalleryRules {
  maxImages: number;
  recommendedRatio: string;
  recommendedSizeText: string;
  maxFileSizeMB?: number;
}

export type TemplateDefaults = Record<string, unknown>;

export interface TemplateAuthoringDraftStatus {
  isReady: boolean;
  issues: string[];
}

export interface TemplateAuthoringDraft {
  version: number;
  sourceTemplateId: string | null;
  fieldsSchema: TemplateField[];
  defaults: TemplateDefaults;
  status: TemplateAuthoringDraftStatus;
  updatedAt?: unknown;
  updatedByUid?: string | null;
}

export interface TemplateTrashMetadata {
  entityType: "template";
  active: boolean;
  deletedAt?: unknown;
  deletedByUid?: string | null;
  deletedByRole?: "admin" | "superadmin" | null;
  previousEditorialStatus: "en_proceso" | "en_revision" | "publicada";
  restoredAt?: unknown;
  restoredByUid?: string | null;
  restoredByRole?: "admin" | "superadmin" | null;
  retentionPolicy: "manual";
}

export interface TemplateDocument {
  id: string;
  slug: string;
  nombre: string;
  tipo: TemplateType;
  tags: string[];
  badges: string[];
  features: string[];
  rating?: TemplateRating | null;
  popularidad?: TemplatePopularity | null;
  preview: TemplatePreview;
  fieldsSchema: TemplateField[];
  defaults: TemplateDefaults;
  galleryRules?: TemplateGalleryRules | null;
  portada?: string | null;
  editor?: string | null;
  objetos?: unknown[];
  secciones?: unknown[];
  estado?: "active" | "archived";
  estadoEditorial?: "en_proceso" | "en_revision" | "publicada";
  updatedAt?: unknown;
  trash?: TemplateTrashMetadata | null;
  templateAuthoringDraft?: TemplateAuthoringDraft | null;
  rsvp?: Record<string, unknown> | null;
  gifts?: Record<string, unknown> | null;
}

export interface TemplateCatalogDocument {
  id: string;
  slug: string;
  nombre: string;
  tipo: TemplateType;
  tags: string[];
  badges: string[];
  features: string[];
  rating?: TemplateRating | null;
  popularidad?: TemplatePopularity | null;
  preview: TemplatePreview;
  portada?: string | null;
  estado?: "active" | "archived";
  estadoEditorial?: "en_proceso" | "en_revision" | "publicada";
  updatedAt?: unknown;
  trash?: TemplateTrashMetadata | null;
}

export interface TemplatePreviewSource {
  mode: "url" | "generated";
  previewUrl: string | null;
}

export declare function normalizeTemplateDocument(
  raw: unknown,
  idOverride?: string
): TemplateDocument;

export declare const TEMPLATE_EDITORIAL_STATES: readonly [
  "en_proceso",
  "en_revision",
  "publicada",
];

export declare function normalizeTemplateEditorialState(
  value: unknown
): "en_proceso" | "en_revision" | "publicada";

export declare function normalizeTemplateCatalogDocument(
  raw: unknown,
  idOverride?: string
): TemplateCatalogDocument;

export declare function isTemplateTrashed(template: unknown): boolean;

export declare function buildCatalogFromTemplate(
  fullTemplate: unknown
): TemplateCatalogDocument;

export declare function ensureDefaultsForSchema(
  fieldsSchema: unknown,
  defaults: unknown
): TemplateDefaults;

export declare function resolveTemplatePreviewSource(
  template: unknown
): TemplatePreviewSource;
