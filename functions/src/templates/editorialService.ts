import { randomUUID } from "crypto";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { requireAdmin, isSuperAdmin } from "../auth/adminAuth";
import { normalizeDraftRenderState } from "../drafts/sourceOfTruth";
import { normalizeInvitationType } from "../utils/invitationType";
import {
  buildTemplateCatalogFromContract,
  normalizeTemplateContractDocument,
} from "./contractLoader";
import {
  normalizeTemplateAssetValue,
  normalizeTemplateAssetsDeep,
  type TemplateAssetCopyCache,
} from "./storageAssets";

const OPTIONS = {
  region: "us-central1" as const,
  cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
};

const TEMPLATE_COLLECTION = "plantillas";
const TEMPLATE_CATALOG_COLLECTION = "plantillas_catalog";
const TEMPLATE_TAGS_COLLECTION = "plantillas_tags";
const DRAFTS_COLLECTION = "borradores";
const EDITORIAL_STATES = new Set(["en_proceso", "en_revision", "publicada"]);

type EditorialState = "en_proceso" | "en_revision" | "publicada";
type AdminRole = "admin" | "superadmin";
type ActiveState = "active" | "archived";
type TemplateTrashMeta = {
  entityType: "template";
  active: boolean;
  deletedAt: unknown;
  deletedByUid: string;
  deletedByRole: AdminRole | "";
  previousEditorialStatus: EditorialState;
  restoredAt: unknown;
  restoredByUid: string;
  restoredByRole: AdminRole | "";
  retentionPolicy: "manual";
};

type TemplatePermissions = {
  canEdit: boolean;
  canEditTags: boolean;
  canChangeState: boolean;
  canPublish: boolean;
  readOnly: boolean;
  allowedTransitions: EditorialState[];
  isTrashed: boolean;
  canMoveToTrash: boolean;
  canRestoreFromTrash: boolean;
  canHardDeleteFromTrash: boolean;
};

type SerializedTemplateResponse = Record<string, unknown> & {
  permissions: TemplatePermissions;
};

function ensureApp() {
  if (admin.apps.length > 0) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "reservaeldia-7a440.firebasestorage.app",
  });
}

function db() {
  ensureApp();
  return admin.firestore();
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeLower(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function normalizeEditorialState(value: unknown): EditorialState {
  const normalized = normalizeLower(value);
  if (EDITORIAL_STATES.has(normalized)) {
    return normalized as EditorialState;
  }
  return "publicada";
}

function normalizeActiveState(value: unknown): ActiveState {
  return normalizeLower(value) === "archived" ? "archived" : "active";
}

function normalizeAdminRoleValue(value: unknown): AdminRole | "" {
  const normalized = normalizeLower(value);
  if (normalized === "admin" || normalized === "superadmin") {
    return normalized;
  }
  return "";
}

function normalizeTagLabel(value: unknown): string {
  return normalizeText(value)
    .replace(/\s+/g, " ")
    .slice(0, 48);
}

function sanitizeSlug(value: unknown): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toDateMs(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && typeof (value as any).toDate === "function") {
    try {
      const parsed = (value as any).toDate();
      return parsed instanceof Date ? parsed.getTime() : 0;
    } catch {
      return 0;
    }
  }
  if (typeof value === "object" && typeof (value as any).seconds === "number") {
    return Number((value as any).seconds || 0) * 1000;
  }
  return 0;
}

function serialize(value: unknown): unknown {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => serialize(entry));
  }
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    Object.entries(objectValue).forEach(([key, nested]) => {
      out[key] = serialize(nested);
    });
    return out;
  }
  return value;
}

function resolveRole(request: CallableRequest<unknown>): { uid: string; role: AdminRole } {
  const uid = requireAdmin(request);
  return {
    uid,
    role: isSuperAdmin(uid) ? "superadmin" : "admin",
  };
}

function normalizeTemplateTrashMeta(
  value: unknown,
  fallbackTemplate: Record<string, unknown> = {}
): TemplateTrashMeta {
  const source = asObject(value);
  const fallback = asObject(fallbackTemplate);
  const active =
    source.active === true ||
    (typeof source.active === "undefined" &&
      normalizeActiveState(fallback.estado) === "archived");

  return {
    entityType: "template",
    active,
    deletedAt: source.deletedAt || null,
    deletedByUid: normalizeText(source.deletedByUid),
    deletedByRole: normalizeAdminRoleValue(source.deletedByRole),
    previousEditorialStatus: normalizeEditorialState(
      source.previousEditorialStatus || fallback.estadoEditorial
    ),
    restoredAt: source.restoredAt || null,
    restoredByUid: normalizeText(source.restoredByUid),
    restoredByRole: normalizeAdminRoleValue(source.restoredByRole),
    retentionPolicy: "manual",
  };
}

function isTemplateTrashed(template: Record<string, unknown>): boolean {
  if (normalizeActiveState(template.estado) === "archived") return true;
  return normalizeTemplateTrashMeta(template.trash, template).active === true;
}

function isPublishedTemplate(template: Record<string, unknown>): boolean {
  return normalizeEditorialState(template.estadoEditorial) === "publicada";
}

function canMoveTemplateToTrash(
  role: AdminRole,
  template: Record<string, unknown>
): boolean {
  if (isTemplateTrashed(template)) return false;
  if (role === "superadmin") return true;
  const state = normalizeEditorialState(template.estadoEditorial);
  return state === "en_proceso" || state === "en_revision";
}

function canRestoreTemplateFromTrash(
  role: AdminRole,
  uid: string,
  template: Record<string, unknown>
): boolean {
  if (!isTemplateTrashed(template)) return false;
  if (role === "superadmin") return true;
  const trash = normalizeTemplateTrashMeta(template.trash, template);
  return Boolean(uid) && trash.deletedByUid === uid;
}

function getAllowedTransitions(role: AdminRole, current: EditorialState): EditorialState[] {
  if (role === "superadmin") {
    return ["en_proceso", "en_revision", "publicada"].filter(
      (state) => state !== current
    ) as EditorialState[];
  }

  if (current === "en_proceso") return ["en_revision"];
  if (current === "en_revision") return ["en_proceso"];
  return [];
}

function resolveTemplatePermissions(
  role: AdminRole,
  uid: string,
  template: Record<string, unknown>
): TemplatePermissions {
  const trashed = isTemplateTrashed(template);
  if (trashed) {
    return {
      canEdit: false,
      canEditTags: false,
      canChangeState: false,
      canPublish: false,
      readOnly: true,
      allowedTransitions: [],
      isTrashed: true,
      canMoveToTrash: false,
      canRestoreFromTrash: canRestoreTemplateFromTrash(role, uid, template),
      canHardDeleteFromTrash: role === "superadmin",
    };
  }

  const state = normalizeEditorialState(template.estadoEditorial);
  const canEdit = role === "superadmin" || state !== "publicada";
  const allowedTransitions = getAllowedTransitions(role, state);

  return {
    canEdit,
    canEditTags: canEdit,
    canChangeState: allowedTransitions.length > 0,
    canPublish: role === "superadmin",
    readOnly: !canEdit,
    allowedTransitions,
    isTrashed: false,
    canMoveToTrash: canMoveTemplateToTrash(role, template),
    canRestoreFromTrash: false,
    canHardDeleteFromTrash: false,
  };
}

function assertCanEditTemplate(role: AdminRole, template: Record<string, unknown>) {
  if (isTemplateTrashed(template)) {
    throw new HttpsError(
      "failed-precondition",
      "La plantilla esta en papelera. Restaurala para volver a editarla."
    );
  }
  if (role === "superadmin") return;
  if (isPublishedTemplate(template)) {
    throw new HttpsError(
      "permission-denied",
      "Los admins no pueden modificar plantillas publicadas."
    );
  }
}

function assertAllowedTransition(
  role: AdminRole,
  current: EditorialState,
  next: EditorialState
) {
  if (current === next) return;
  if (role === "superadmin") return;

  const allowedTransitions = getAllowedTransitions(role, current);
  if (!allowedTransitions.includes(next)) {
    throw new HttpsError(
      "permission-denied",
      "No tenes permisos para realizar esa transicion editorial."
    );
  }
}

function assertCanMoveTemplateToTrash(
  role: AdminRole,
  template: Record<string, unknown>
) {
  if (isTemplateTrashed(template)) {
    throw new HttpsError(
      "failed-precondition",
      "La plantilla ya esta en papelera."
    );
  }
  if (canMoveTemplateToTrash(role, template)) return;
  throw new HttpsError(
    "permission-denied",
    "No tenes permisos para mover esta plantilla a papelera."
  );
}

function assertCanRestoreTemplateFromTrash(
  role: AdminRole,
  uid: string,
  template: Record<string, unknown>
) {
  if (!isTemplateTrashed(template)) {
    throw new HttpsError(
      "failed-precondition",
      "La plantilla no esta en papelera."
    );
  }
  if (canRestoreTemplateFromTrash(role, uid, template)) return;
  throw new HttpsError(
    "permission-denied",
    "No tenes permisos para restaurar esta plantilla."
  );
}

async function loadTemplateById(templateId: string) {
  const safeTemplateId = normalizeText(templateId);
  if (!safeTemplateId) {
    throw new HttpsError("invalid-argument", "templateId invalido.");
  }

  const templateSnap = await db().collection(TEMPLATE_COLLECTION).doc(safeTemplateId).get();
  if (!templateSnap.exists) {
    throw new HttpsError("not-found", "Plantilla no encontrada.");
  }

  const raw = templateSnap.data() || {};
  const normalized = asObject(
    await normalizeTemplateContractDocument(
      {
        id: templateSnap.id,
        ...raw,
      },
      templateSnap.id
    )
  );

  return {
    id: templateSnap.id,
    raw,
    normalized,
  };
}

async function ensureTagCatalogEntries(labels: unknown, uid: string) {
  const requested = Array.isArray(labels) ? labels : [];
  const orderedEntries: Array<{ tagId: string; label: string }> = [];
  const seen = new Set<string>();

  requested.forEach((entry) => {
    const label = normalizeTagLabel(entry);
    const tagId = sanitizeSlug(label);
    if (!label || !tagId || seen.has(tagId)) return;
    seen.add(tagId);
    orderedEntries.push({ tagId, label });
  });

  if (!orderedEntries.length) {
    return {
      labels: [] as string[],
      tagIds: [] as string[],
    };
  }

  const refs = orderedEntries.map(({ tagId }) =>
    db().collection(TEMPLATE_TAGS_COLLECTION).doc(tagId)
  );
  const snaps = await db().getAll(...refs);
  const batch = db().batch();
  const labelsById = new Map<string, string>();
  let hasWrites = false;

  snaps.forEach((snap, index) => {
    const { tagId, label } = orderedEntries[index];
    const existing = snap.exists ? asObject(snap.data()) : null;
    const canonicalLabel = normalizeTagLabel(existing?.label) || label;
    labelsById.set(tagId, canonicalLabel);

    if (!snap.exists) {
      batch.set(
        snap.ref,
        {
          slug: tagId,
          label: canonicalLabel,
          usageCount: 0,
          createdByUid: uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      hasWrites = true;
    }
  });

  if (hasWrites) {
    await batch.commit();
  }

  return {
    labels: orderedEntries
      .map(({ tagId }) => labelsById.get(tagId) || "")
      .filter(Boolean),
    tagIds: orderedEntries.map(({ tagId }) => tagId),
  };
}

async function recalculateTagUsageCounts(tagIds: string[]) {
  const uniqueTagIds = Array.from(
    new Set(tagIds.map((value) => sanitizeSlug(value)).filter(Boolean))
  );
  if (!uniqueTagIds.length) return;

  const counts = new Map<string, number>();
  uniqueTagIds.forEach((tagId) => counts.set(tagId, 0));

  const catalogSnap = await db().collection(TEMPLATE_CATALOG_COLLECTION).get();
  catalogSnap.docs.forEach((docSnap) => {
    const data = asObject(docSnap.data());
    if (normalizeActiveState(data.estado) === "archived") return;
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const seenInTemplate = new Set<string>();
    tags.forEach((entry: unknown) => {
      const tagId = sanitizeSlug(entry);
      if (!tagId || seenInTemplate.has(tagId) || !counts.has(tagId)) return;
      seenInTemplate.add(tagId);
      counts.set(tagId, Number(counts.get(tagId) || 0) + 1);
    });
  });

  const batch = db().batch();
  uniqueTagIds.forEach((tagId) => {
    const ref = db().collection(TEMPLATE_TAGS_COLLECTION).doc(tagId);
    batch.set(
      ref,
      {
        slug: tagId,
        usageCount: Number(counts.get(tagId) || 0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  await batch.commit();
}

async function writeTemplateAndCatalog(params: {
  templateId: string;
  baseRaw?: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  freshBaseInTransaction?: boolean;
}): Promise<{
  templateDoc: Record<string, unknown>;
  catalogDoc: Record<string, unknown>;
}> {
  const {
    templateId,
    baseRaw = null,
    payload,
    freshBaseInTransaction = false,
  } = params;
  const safeTemplateId = normalizeText(templateId);
  const sourcePayload = asObject(payload);
  const assetCache: TemplateAssetCopyCache = new Map();
  const [objetosNormalizados, seccionesNormalizadas, portadaNormalizada] =
    await Promise.all([
      normalizeTemplateAssetsDeep(sourcePayload.objetos || [], safeTemplateId, assetCache),
      normalizeTemplateAssetsDeep(sourcePayload.secciones || [], safeTemplateId, assetCache),
      typeof sourcePayload.portada === "string"
        ? normalizeTemplateAssetValue(sourcePayload.portada, safeTemplateId, assetCache)
        : Promise.resolve(null),
    ]);

  const preparedPayload: Record<string, unknown> = {
    ...sourcePayload,
    portada: portadaNormalizada,
    objetos: Array.isArray(objetosNormalizados) ? objetosNormalizados : [],
    secciones: Array.isArray(seccionesNormalizadas) ? seccionesNormalizadas : [],
  };

  const buildDocs = async (
    currentBaseRaw: Record<string, unknown> | null | undefined,
    updatedAtValue: unknown,
    createdAtFallback: unknown
  ) => {
    const safeBaseRaw = currentBaseRaw || {};
    const normalizedTemplate = asObject(
      await normalizeTemplateContractDocument(
        {
          ...safeBaseRaw,
          ...preparedPayload,
          id: safeTemplateId,
          updatedAt: updatedAtValue,
        },
        safeTemplateId
      )
    );

    const templateAuthoringDraft =
      preparedPayload.templateAuthoringDraft &&
      typeof preparedPayload.templateAuthoringDraft === "object"
        ? preparedPayload.templateAuthoringDraft
        : safeBaseRaw.templateAuthoringDraft &&
            typeof safeBaseRaw.templateAuthoringDraft === "object"
          ? safeBaseRaw.templateAuthoringDraft
          : null;

    const templateDoc = {
      ...safeBaseRaw,
      ...normalizedTemplate,
      ...(templateAuthoringDraft ? { templateAuthoringDraft } : {}),
      updatedAt: updatedAtValue,
      createdAt: safeBaseRaw.createdAt || createdAtFallback,
    };

    const catalogTemplate = asObject(await buildTemplateCatalogFromContract(templateDoc));
    const catalogDoc = {
      ...catalogTemplate,
      updatedAt: updatedAtValue,
    };

    return {
      templateDoc,
      catalogDoc,
    };
  };

  if (freshBaseInTransaction) {
    const templateRef = db().collection(TEMPLATE_COLLECTION).doc(safeTemplateId);
    const catalogRef = db().collection(TEMPLATE_CATALOG_COLLECTION).doc(safeTemplateId);
    const createdAtFallback =
      baseRaw?.createdAt || admin.firestore.FieldValue.serverTimestamp();
    let transactionResult:
      | {
          templateDoc: Record<string, unknown>;
          catalogDoc: Record<string, unknown>;
        }
      | null = null;

    await db().runTransaction(async (transaction) => {
      const currentSnap = await transaction.get(templateRef);
      const currentBaseRaw = currentSnap.exists ? asObject(currentSnap.data()) : baseRaw || {};
      const updatedAtValue = admin.firestore.FieldValue.serverTimestamp();
      const nextDocs = await buildDocs(
        currentBaseRaw,
        updatedAtValue,
        createdAtFallback
      );
      transaction.set(templateRef, nextDocs.templateDoc, { merge: true });
      transaction.set(catalogRef, nextDocs.catalogDoc, { merge: true });
      transactionResult = nextDocs;
    });

    if (!transactionResult) {
      throw new HttpsError(
        "internal",
        "No se pudo persistir la plantilla con la base mas reciente."
      );
    }

    return transactionResult;
  }

  const updatedAt = admin.firestore.FieldValue.serverTimestamp();
  const docs = await buildDocs(
    baseRaw,
    updatedAt,
    baseRaw?.createdAt || admin.firestore.FieldValue.serverTimestamp()
  );

  await Promise.all([
    db().collection(TEMPLATE_COLLECTION).doc(safeTemplateId).set(docs.templateDoc, { merge: true }),
    db()
      .collection(TEMPLATE_CATALOG_COLLECTION)
      .doc(safeTemplateId)
      .set(docs.catalogDoc, { merge: true }),
  ]);

  return docs;
}

function buildWorkspaceSlug(templateId: string, uid: string) {
  const base = sanitizeSlug(`template-workspace-${templateId}-${uid}`);
  return `${base || "template-workspace"}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function buildWorkspaceTemplateAuthoringDraft(
  template: Record<string, unknown>,
  templateId: string,
  uid: string
) {
  return {
    version: 1,
    sourceTemplateId: templateId,
    fieldsSchema: Array.isArray(template.fieldsSchema) ? template.fieldsSchema : [],
    defaults:
      template.defaults && typeof template.defaults === "object"
        ? template.defaults
        : {},
    status: {
      isReady: true,
      issues: [],
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByUid: uid,
  };
}

function normalizeIssues(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: string[] = [];

  source.forEach((entry) => {
    const issue = normalizeText(entry);
    const key = issue.toLowerCase();
    if (!issue || seen.has(key)) return;
    seen.add(key);
    out.push(issue);
  });

  return out;
}

function buildTemplateAuthoringDraft(
  sourceValue: unknown,
  template: Record<string, unknown>,
  templateId: string,
  uid: string,
  { persist = true }: { persist?: boolean } = {}
) {
  const source = asObject(sourceValue);
  const fallback = asObject(template.templateAuthoringDraft);
  const fieldsSchema = Array.isArray(source.fieldsSchema)
    ? source.fieldsSchema
    : Array.isArray(fallback.fieldsSchema)
      ? fallback.fieldsSchema
      : Array.isArray(template.fieldsSchema)
        ? template.fieldsSchema
        : [];
  const defaults =
    source.defaults && typeof source.defaults === "object"
      ? source.defaults
      : fallback.defaults && typeof fallback.defaults === "object"
        ? fallback.defaults
        : template.defaults && typeof template.defaults === "object"
          ? template.defaults
          : {};
  const rawStatus = asObject(source.status);
  const fallbackStatus = asObject(fallback.status);
  const issues = normalizeIssues(rawStatus.issues || fallbackStatus.issues);

  return {
    version: Number.isFinite(Number(source.version || fallback.version))
      ? Math.max(1, Math.round(Number(source.version || fallback.version)))
      : 1,
    sourceTemplateId:
      normalizeText(source.sourceTemplateId) ||
      normalizeText(fallback.sourceTemplateId) ||
      templateId ||
      null,
    fieldsSchema,
    defaults,
    status: {
      isReady:
        rawStatus.isReady !== false &&
        fallbackStatus.isReady !== false &&
        issues.length === 0,
      issues,
    },
    updatedAt: persist
      ? admin.firestore.FieldValue.serverTimestamp()
      : source.updatedAt || fallback.updatedAt || null,
    updatedByUid:
      (persist ? uid : "") ||
      normalizeText(source.updatedByUid) ||
      normalizeText(fallback.updatedByUid) ||
      null,
  };
}

function buildTemplateWorkspaceMeta(
  role: AdminRole,
  uid: string,
  templateId: string,
  template: Record<string, unknown>
) {
  const permissions = resolveTemplatePermissions(role, uid, template);
  return {
    templateId,
    mode: "template_edit",
    readOnly: permissions.readOnly,
    estadoEditorial: normalizeEditorialState(template.estadoEditorial),
    tags: Array.isArray(template.tags) ? template.tags : [],
    templateName: normalizeText(template.nombre) || "Plantilla",
    permissions,
  };
}

function buildTemplateEditorDocument(
  role: AdminRole,
  uid: string,
  templateId: string,
  template: Record<string, unknown>
) {
  const permissions = resolveTemplatePermissions(role, uid, template);
  return serialize({
    slug: templateId,
    plantillaId: templateId,
    editor: normalizeText(template.editor) || "konva",
    objetos: Array.isArray(template.objetos) ? template.objetos : [],
    secciones: Array.isArray(template.secciones) ? template.secciones : [],
    portada: normalizeText(template.portada) || null,
    tipoInvitacion: normalizeInvitationType(template.tipo),
    nombre: normalizeText(template.nombre) || "Plantilla",
    estadoBorrador: "active",
    rsvp: template.rsvp && typeof template.rsvp === "object" ? template.rsvp : null,
    gifts: template.gifts && typeof template.gifts === "object" ? template.gifts : null,
    templateAuthoringDraft: buildTemplateAuthoringDraft(
      template.templateAuthoringDraft,
      template,
      templateId,
      "",
      { persist: false }
    ),
    templateWorkspace: buildTemplateWorkspaceMeta(role, uid, templateId, template),
  }) as Record<string, unknown>;
}

function buildTemplateResponse(
  role: AdminRole,
  uid: string,
  templateId: string,
  template: Record<string, unknown>
): SerializedTemplateResponse {
  return {
    ...(serialize({
      id: templateId,
      ...template,
    }) as Record<string, unknown>),
    permissions: resolveTemplatePermissions(role, uid, template),
  };
}

function buildTemplatePayloadFromDraft(
  draftData: Record<string, unknown>,
  currentTemplate: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const renderState = normalizeDraftRenderState(draftData);
  const authoringDraft = asObject(draftData.templateAuthoringDraft);
  const fieldsSchema = Array.isArray(authoringDraft.fieldsSchema)
    ? authoringDraft.fieldsSchema
    : Array.isArray(currentTemplate.fieldsSchema)
      ? currentTemplate.fieldsSchema
      : [];
  const defaults =
    authoringDraft.defaults && typeof authoringDraft.defaults === "object"
      ? authoringDraft.defaults
      : currentTemplate.defaults && typeof currentTemplate.defaults === "object"
        ? currentTemplate.defaults
        : {};

  return {
    ...currentTemplate,
    ...overrides,
    nombre: normalizeText(overrides.nombre) || normalizeText(currentTemplate.nombre) || "Plantilla",
    tipo: normalizeInvitationType(
      overrides.tipo || draftData.tipoInvitacion || currentTemplate.tipo
    ),
    editor: normalizeText(currentTemplate.editor) || "konva",
    portada:
      normalizeText(overrides.portada) ||
      normalizeText(currentTemplate.portada) ||
      normalizeText(draftData.portada) ||
      null,
    objetos: renderState.objetos,
    secciones: renderState.secciones,
    fieldsSchema,
    defaults,
    rsvp: renderState.rsvp,
    gifts: renderState.gifts,
  };
}

function buildTemplatePayloadFromEditorDocument(
  editorDocument: Record<string, unknown>,
  currentTemplate: Record<string, unknown>,
  uid: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const source = asObject(editorDocument);
  const fallbackAuthoring = asObject(currentTemplate.templateAuthoringDraft);
  const incomingAuthoring = asObject(source.templateAuthoringDraft);
  const templateAuthoringDraft = buildTemplateAuthoringDraft(
    Object.keys(incomingAuthoring).length ? incomingAuthoring : fallbackAuthoring,
    currentTemplate,
    normalizeText(currentTemplate.id) || normalizeText(source.plantillaId),
    uid
  );

  return {
    ...currentTemplate,
    ...overrides,
    nombre:
      normalizeText(overrides.nombre) ||
      normalizeText(source.nombre) ||
      normalizeText(currentTemplate.nombre) ||
      "Plantilla",
    tipo: normalizeInvitationType(
      overrides.tipo || source.tipoInvitacion || source.tipo || currentTemplate.tipo
    ),
    editor:
      normalizeText(currentTemplate.editor) ||
      normalizeText(source.editor) ||
      "konva",
    portada:
      normalizeText(overrides.portada) ||
      normalizeText(source.portada) ||
      normalizeText(currentTemplate.portada) ||
      null,
    objetos: Array.isArray(source.objetos)
      ? source.objetos
      : Array.isArray(currentTemplate.objetos)
        ? currentTemplate.objetos
        : [],
    secciones: Array.isArray(source.secciones)
      ? source.secciones
      : Array.isArray(currentTemplate.secciones)
        ? currentTemplate.secciones
        : [],
    fieldsSchema: Array.isArray(templateAuthoringDraft.fieldsSchema)
      ? templateAuthoringDraft.fieldsSchema
      : Array.isArray(currentTemplate.fieldsSchema)
        ? currentTemplate.fieldsSchema
        : [],
    defaults:
      templateAuthoringDraft.defaults &&
      typeof templateAuthoringDraft.defaults === "object"
        ? templateAuthoringDraft.defaults
        : currentTemplate.defaults && typeof currentTemplate.defaults === "object"
          ? currentTemplate.defaults
          : {},
    templateAuthoringDraft,
    rsvp:
      "rsvp" in source
        ? source.rsvp && typeof source.rsvp === "object"
          ? source.rsvp
          : null
        : currentTemplate.rsvp && typeof currentTemplate.rsvp === "object"
          ? currentTemplate.rsvp
          : null,
    gifts:
      "gifts" in source
        ? source.gifts && typeof source.gifts === "object"
          ? source.gifts
          : null
        : currentTemplate.gifts && typeof currentTemplate.gifts === "object"
          ? currentTemplate.gifts
          : null,
  };
}

export const adminListTemplatesV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    const { uid, role } = resolveRole(request);
    const filters = asObject(request.data);
    const rawTipo = normalizeText(filters.tipo);
    const tipo = rawTipo ? normalizeInvitationType(rawTipo) : "";
    const search = normalizeLower(filters.search);

    const snapshot = await db().collection(TEMPLATE_CATALOG_COLLECTION).get();
    const items: Record<string, unknown>[] = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const normalized = asObject(
          await normalizeTemplateContractDocument(
            {
              id: docSnap.id,
              ...docSnap.data(),
            },
            docSnap.id
          )
        );
        return {
          id: docSnap.id,
          ...normalized,
        } as Record<string, unknown>;
      })
    );

    const filtered = items
      .filter((item) => normalizeLower(item.estado) !== "archived")
      .filter((item) => !tipo || normalizeInvitationType(item.tipo) === tipo)
      .filter((item) => {
        if (!search) return true;
        const haystack = [
          item.nombre,
          item.tipo,
          ...(Array.isArray(item.tags) ? item.tags : []),
        ]
          .map((entry) => normalizeLower(entry))
          .join(" ");
        return haystack.includes(search);
      })
      .sort((left, right) => {
        const dateDelta = toDateMs(right.updatedAt) - toDateMs(left.updatedAt);
        if (dateDelta !== 0) return dateDelta;
        return normalizeLower(left.nombre).localeCompare(normalizeLower(right.nombre));
      });

    const responseItems: SerializedTemplateResponse[] = filtered.map((item) =>
      buildTemplateResponse(role, uid, String(item.id || ""), item)
    );

    const counts = {
      en_proceso: responseItems.filter((item) => item.estadoEditorial === "en_proceso").length,
      en_revision: responseItems.filter((item) => item.estadoEditorial === "en_revision").length,
      publicada: responseItems.filter((item) => item.estadoEditorial === "publicada").length,
    };

    return {
      items: responseItems,
      counts,
    };
  }
);

export const adminListTemplateTrashV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    const { uid, role } = resolveRole(request);

    const snapshot = await db().collection(TEMPLATE_CATALOG_COLLECTION).get();
    const items: Record<string, unknown>[] = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const normalized = asObject(
          await normalizeTemplateContractDocument(
            {
              id: docSnap.id,
              ...docSnap.data(),
            },
            docSnap.id
          )
        );
        return {
          id: docSnap.id,
          ...normalized,
        } as Record<string, unknown>;
      })
    );

    const filtered = items
      .filter((item) => isTemplateTrashed(item))
      .filter((item) => {
        if (role === "superadmin") return true;
        const trash = normalizeTemplateTrashMeta(item.trash, item);
        return trash.deletedByUid === uid;
      })
      .sort((left, right) => {
        const leftTrash = normalizeTemplateTrashMeta(left.trash, left);
        const rightTrash = normalizeTemplateTrashMeta(right.trash, right);
        const trashDateDelta = toDateMs(rightTrash.deletedAt) - toDateMs(leftTrash.deletedAt);
        if (trashDateDelta !== 0) return trashDateDelta;
        const dateDelta = toDateMs(right.updatedAt) - toDateMs(left.updatedAt);
        if (dateDelta !== 0) return dateDelta;
        return normalizeLower(left.nombre).localeCompare(normalizeLower(right.nombre));
      });

    const responseItems: SerializedTemplateResponse[] = filtered.map((item) =>
      buildTemplateResponse(role, uid, String(item.id || ""), item)
    );

    return {
      items: responseItems,
      count: responseItems.length,
    };
  }
);

export const adminListTemplateTagsV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    resolveRole(request);

    const snapshot = await db().collection(TEMPLATE_TAGS_COLLECTION).get();
    const items = snapshot.docs
      .map((docSnap) => {
        const data = asObject(docSnap.data());
        return {
          id: docSnap.id,
          slug: normalizeText(data.slug) || docSnap.id,
          label: normalizeTagLabel(data.label) || docSnap.id,
          usageCount: Number(data.usageCount || 0),
          updatedAt: data.updatedAt || null,
          createdAt: data.createdAt || null,
        };
      })
      .sort((left, right) => {
        const usageDelta = Number(right.usageCount || 0) - Number(left.usageCount || 0);
        if (usageDelta !== 0) return usageDelta;
        return normalizeLower(left.label).localeCompare(normalizeLower(right.label));
      });

    return {
      items: serialize(items),
    };
  }
);

export const adminUpsertTemplateTagV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    const { uid } = resolveRole(request);
    const data = asObject(request.data);
    const label = normalizeTagLabel(data.label);
    if (!label) {
      throw new HttpsError("invalid-argument", "La etiqueta es obligatoria.");
    }

    const { labels, tagIds } = await ensureTagCatalogEntries([label], uid);
    const tagId = tagIds[0];
    const canonicalLabel = labels[0];
    if (!tagId || !canonicalLabel) {
      throw new HttpsError("internal", "No se pudo crear la etiqueta.");
    }

    const snap = await db().collection(TEMPLATE_TAGS_COLLECTION).doc(tagId).get();
    return {
      item: serialize({
        id: tagId,
        ...(snap.data() || {}),
        label: canonicalLabel,
      }),
    };
  }
);

export const adminUpsertTemplateEditorialV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    const { uid, role } = resolveRole(request);
    const data = asObject(request.data);
    const templateId = normalizeText(data.templateId);
    const requestedState = data.estadoEditorial;
    const hasRequestedTags = Array.isArray(data.tags);

    const loaded = await loadTemplateById(templateId);
    assertCanEditTemplate(role, loaded.normalized);

    const currentState = normalizeEditorialState(loaded.normalized.estadoEditorial);
    const nextState =
      typeof requestedState === "undefined"
        ? currentState
        : normalizeEditorialState(requestedState);

    assertAllowedTransition(role, currentState, nextState);

    const previousTags = Array.isArray(loaded.normalized.tags) ? loaded.normalized.tags : [];
    const { labels: canonicalTags } = await ensureTagCatalogEntries(
      hasRequestedTags ? data.tags : previousTags,
      uid
    );

    const payload = {
      ...loaded.normalized,
      estadoEditorial: nextState,
      tags: canonicalTags,
    };

    const { templateDoc } = await writeTemplateAndCatalog({
      templateId: loaded.id,
      baseRaw: loaded.raw,
      payload,
    });

    const touchedTagIds = [
      ...previousTags.map((entry) => sanitizeSlug(entry)),
      ...canonicalTags.map((entry) => sanitizeSlug(entry)),
    ].filter(Boolean);
    await recalculateTagUsageCounts(touchedTagIds);

    return {
      item: buildTemplateResponse(role, uid, loaded.id, templateDoc),
    };
  }
);

export const adminMoveTemplateToTrashV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    const { uid, role } = resolveRole(request);
    const data = asObject(request.data);
    const templateId = normalizeText(data.templateId || data.id);
    const loaded = await loadTemplateById(templateId);

    if (isTemplateTrashed(loaded.normalized)) {
      return {
        item: buildTemplateResponse(role, uid, loaded.id, loaded.normalized),
        alreadyInTrash: true,
      };
    }

    assertCanMoveTemplateToTrash(role, loaded.normalized);

    const currentState = normalizeEditorialState(loaded.normalized.estadoEditorial);
    const currentTags = Array.isArray(loaded.normalized.tags) ? loaded.normalized.tags : [];
    const { templateDoc } = await writeTemplateAndCatalog({
      templateId: loaded.id,
      baseRaw: loaded.raw,
      payload: {
        ...loaded.normalized,
        estado: "archived",
        trash: {
          ...normalizeTemplateTrashMeta(loaded.normalized.trash, loaded.normalized),
          entityType: "template",
          active: true,
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
          deletedByUid: uid,
          deletedByRole: role,
          previousEditorialStatus: currentState,
          restoredAt: null,
          restoredByUid: null,
          restoredByRole: null,
          retentionPolicy: "manual",
        },
      },
    });

    await recalculateTagUsageCounts(currentTags.map((entry) => sanitizeSlug(entry)));

    return {
      item: buildTemplateResponse(role, uid, loaded.id, templateDoc),
    };
  }
);

export const adminRestoreTemplateFromTrashV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    const { uid, role } = resolveRole(request);
    const data = asObject(request.data);
    const templateId = normalizeText(data.templateId || data.id);
    const loaded = await loadTemplateById(templateId);

    if (!isTemplateTrashed(loaded.normalized)) {
      return {
        item: buildTemplateResponse(role, uid, loaded.id, loaded.normalized),
        alreadyRestored: true,
      };
    }

    assertCanRestoreTemplateFromTrash(role, uid, loaded.normalized);

    const trash = normalizeTemplateTrashMeta(loaded.normalized.trash, loaded.normalized);
    const restoredEditorialState = normalizeEditorialState(
      trash.previousEditorialStatus || loaded.normalized.estadoEditorial
    );
    const currentTags = Array.isArray(loaded.normalized.tags) ? loaded.normalized.tags : [];

    const { templateDoc } = await writeTemplateAndCatalog({
      templateId: loaded.id,
      baseRaw: loaded.raw,
      payload: {
        ...loaded.normalized,
        estado: "active",
        estadoEditorial: restoredEditorialState,
        trash: {
          ...trash,
          entityType: "template",
          active: false,
          previousEditorialStatus: restoredEditorialState,
          restoredAt: admin.firestore.FieldValue.serverTimestamp(),
          restoredByUid: uid,
          restoredByRole: role,
          retentionPolicy: "manual",
        },
      },
    });

    await recalculateTagUsageCounts(currentTags.map((entry) => sanitizeSlug(entry)));

    return {
      item: buildTemplateResponse(role, uid, loaded.id, templateDoc),
    };
  }
);

export const adminHardDeleteTemplateFromTrashV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    const { role } = resolveRole(request);
    if (role !== "superadmin") {
      throw new HttpsError(
        "permission-denied",
        "Solo superadmin puede borrar definitivamente una plantilla."
      );
    }

    const data = asObject(request.data);
    const templateId = normalizeText(data.templateId || data.id);
    const loaded = await loadTemplateById(templateId);

    if (!isTemplateTrashed(loaded.normalized)) {
      throw new HttpsError(
        "failed-precondition",
        "La plantilla debe estar en papelera antes del borrado definitivo."
      );
    }

    const currentTags = Array.isArray(loaded.normalized.tags) ? loaded.normalized.tags : [];
    const batch = db().batch();
    batch.delete(db().collection(TEMPLATE_COLLECTION).doc(loaded.id));
    batch.delete(db().collection(TEMPLATE_CATALOG_COLLECTION).doc(loaded.id));
    await batch.commit();

    await recalculateTagUsageCounts(currentTags.map((entry) => sanitizeSlug(entry)));

    const storage = admin.storage();
    const bucket = storage.bucket();
    const cleanupResults = await Promise.allSettled([
      bucket.deleteFiles({ prefix: `plantillas/${loaded.id}/` }),
      bucket.file(`previews/plantillas/${loaded.id}.png`).delete(),
    ]);

    cleanupResults.forEach((result, index) => {
      if (result.status === "fulfilled") return;
      logger.warn("No se pudo limpiar storage de plantilla tras hard delete", {
        templateId: loaded.id,
        target: index === 0 ? `plantillas/${loaded.id}/` : `previews/plantillas/${loaded.id}.png`,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason || ""),
      });
    });

    return {
      success: true,
      templateId: loaded.id,
      deleted: true,
    };
  }
);

export const adminGetTemplateEditorDocumentV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    const { uid, role } = resolveRole(request);
    const data = asObject(request.data);
    const templateId = normalizeText(data.templateId || data.id);
    const loaded = await loadTemplateById(templateId);
    if (isTemplateTrashed(loaded.normalized)) {
      throw new HttpsError(
        "failed-precondition",
        "La plantilla esta en papelera. Restaurala para volver a abrirla."
      );
    }
    const permissions = resolveTemplatePermissions(role, uid, loaded.normalized);

    return {
      item: buildTemplateResponse(role, uid, loaded.id, loaded.normalized),
      editorDocument: buildTemplateEditorDocument(role, uid, loaded.id, loaded.normalized),
      readOnly: permissions.readOnly,
      permissions,
    };
  }
);

export const adminSaveTemplateEditorDocumentV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    const { uid, role } = resolveRole(request);
    const data = asObject(request.data);
    const templateId = normalizeText(data.templateId || data.id);
    const loaded = await loadTemplateById(templateId);
    assertCanEditTemplate(role, loaded.normalized);

    const editorDocument = asObject(data.document || data.datos || data.payload);
    const payload = buildTemplatePayloadFromEditorDocument(
      editorDocument,
      loaded.normalized,
      uid,
      {
        portada: normalizeText(data.portada) || normalizeText(editorDocument.portada) || undefined,
        nombre: normalizeText(data.nombre) || normalizeText(editorDocument.nombre) || undefined,
      }
    );
    const safeEditorPayload = {
      ...payload,
    };
    delete safeEditorPayload.estado;
    delete safeEditorPayload.estadoEditorial;
    delete safeEditorPayload.tags;
    delete safeEditorPayload.trash;

    const { templateDoc } = await writeTemplateAndCatalog({
      templateId: loaded.id,
      baseRaw: loaded.raw,
      payload: safeEditorPayload,
      freshBaseInTransaction: true,
    });

    return {
      item: buildTemplateResponse(role, uid, loaded.id, templateDoc),
      editorDocument: buildTemplateEditorDocument(role, uid, loaded.id, templateDoc),
    };
  }
);

export const adminConvertDraftToTemplateV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    const { uid, role } = resolveRole(request);
    const data = asObject(request.data);
    const draftSlug = normalizeText(data.draftSlug || data.slug || data.id);
    const incomingPayload = asObject(data.datos || data.payload);

    if (!draftSlug) {
      throw new HttpsError("invalid-argument", "draftSlug invalido.");
    }

    const draftRef = db().collection(DRAFTS_COLLECTION).doc(draftSlug);
    const [draftSnap, existingTemplateSnap] = await Promise.all([
      draftRef.get(),
      db().collection(TEMPLATE_COLLECTION).doc(draftSlug).get(),
    ]);

    if (!draftSnap.exists) {
      throw new HttpsError("not-found", "Borrador no encontrado.");
    }
    if (existingTemplateSnap.exists) {
      throw new HttpsError(
        "already-exists",
        "Ya existe una plantilla con el mismo id del borrador."
      );
    }

    const draftData = asObject(draftSnap.data());
    const draftOwnerUid = normalizeText(draftData.userId);
    if (draftOwnerUid && draftOwnerUid !== uid && role !== "superadmin") {
      throw new HttpsError(
        "permission-denied",
        "No tenes permisos para convertir este borrador en plantilla."
      );
    }

    const requestAuthoringStatus = asObject(data.authoringStatus);
    const authoringStatus =
      typeof requestAuthoringStatus.isReady === "boolean"
        ? requestAuthoringStatus
        : asObject(asObject(draftData.templateAuthoringDraft).status);
    if (authoringStatus.isReady === false) {
      throw new HttpsError(
        "failed-precondition",
        "El schema dinamico del borrador no esta listo para guardarse como plantilla."
      );
    }

    const templateName =
      normalizeText(incomingPayload.nombre) ||
      normalizeText(draftData.nombre) ||
      "Plantilla";
    const currentPayload: Record<string, unknown> =
      Object.keys(incomingPayload).length > 0
        ? incomingPayload
        : buildTemplatePayloadFromDraft(draftData, {}, {
            nombre: templateName,
            tipo: normalizeInvitationType(draftData.tipoInvitacion),
            portada: normalizeText(draftData.portada) || null,
            editor: "konva",
          });

    const { labels: canonicalTags } = await ensureTagCatalogEntries(
      currentPayload.tags,
      uid
    );

    const templateAuthoringDraft = buildTemplateAuthoringDraft(
      draftData.templateAuthoringDraft,
      currentPayload,
      draftSlug,
      uid
    );

    const { templateDoc } = await writeTemplateAndCatalog({
      templateId: draftSlug,
      payload: {
        ...currentPayload,
        nombre: templateName,
        tipo: normalizeInvitationType(currentPayload.tipo || draftData.tipoInvitacion),
        editor: normalizeText(currentPayload.editor) || "konva",
        tags: canonicalTags,
        estado: normalizeText(currentPayload.estado) || "active",
        estadoEditorial: "en_proceso",
        templateAuthoringDraft,
      },
    });

    await Promise.all([
      recalculateTagUsageCounts(canonicalTags.map((entry) => sanitizeSlug(entry))),
      draftRef.delete(),
    ]);

    return {
      templateId: draftSlug,
      item: buildTemplateResponse(role, uid, draftSlug, templateDoc),
      editorDocument: buildTemplateEditorDocument(role, uid, draftSlug, templateDoc),
    };
  }
);

export const adminOpenTemplateWorkspaceV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    const { uid, role } = resolveRole(request);
    const data = asObject(request.data);
    const templateId = normalizeText(data.templateId);
    const loaded = await loadTemplateById(templateId);
    if (isTemplateTrashed(loaded.normalized)) {
      throw new HttpsError(
        "failed-precondition",
        "La plantilla esta en papelera. Restaurala para volver a abrirla."
      );
    }
    const permissions = resolveTemplatePermissions(role, uid, loaded.normalized);
    const slug = buildWorkspaceSlug(templateId, uid);

    await db().collection(DRAFTS_COLLECTION).doc(slug).set({
      slug,
      userId: uid,
      plantillaId: templateId,
      editor: normalizeText(loaded.normalized.editor) || "konva",
      objetos: Array.isArray(loaded.normalized.objetos) ? loaded.normalized.objetos : [],
      secciones: Array.isArray(loaded.normalized.secciones) ? loaded.normalized.secciones : [],
      portada: normalizeText(loaded.normalized.portada) || null,
      tipoInvitacion: normalizeInvitationType(loaded.normalized.tipo),
      nombre: normalizeText(loaded.normalized.nombre) || "Plantilla",
      estadoBorrador: "active",
      enPapeleraAt: null,
      eliminacionDefinitivaAt: null,
      rsvp:
        loaded.normalized.rsvp && typeof loaded.normalized.rsvp === "object"
          ? loaded.normalized.rsvp
          : null,
      gifts:
        loaded.normalized.gifts && typeof loaded.normalized.gifts === "object"
          ? loaded.normalized.gifts
          : null,
      templateAuthoringDraft: buildWorkspaceTemplateAuthoringDraft(
        loaded.normalized,
        templateId,
        uid
      ),
      templateWorkspace: {
        templateId,
        mode: "template_edit",
        readOnly: permissions.readOnly,
        openedByUid: uid,
        openedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastCommittedAt: null,
        estadoEditorial: normalizeEditorialState(loaded.normalized.estadoEditorial),
        tags: Array.isArray(loaded.normalized.tags) ? loaded.normalized.tags : [],
        templateName: normalizeText(loaded.normalized.nombre) || "Plantilla",
        permissions,
      },
      ultimaEdicion: admin.firestore.FieldValue.serverTimestamp(),
      creado: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info("Template workspace opened", {
      templateId,
      slug,
      uid,
      readOnly: permissions.readOnly,
    });

    return {
      slug,
      readOnly: permissions.readOnly,
      template: buildTemplateResponse(role, uid, loaded.id, loaded.normalized),
    };
  }
);

export const adminCommitTemplateWorkspaceV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    const { uid, role } = resolveRole(request);
    const data = asObject(request.data);
    const draftSlug = normalizeText(data.draftSlug || data.slug);
    const portadaOverride = normalizeText(data.portada) || null;
    if (!draftSlug) {
      throw new HttpsError("invalid-argument", "draftSlug invalido.");
    }

    const draftRef = db().collection(DRAFTS_COLLECTION).doc(draftSlug);
    const draftSnap = await draftRef.get();
    if (!draftSnap.exists) {
      throw new HttpsError("not-found", "Workspace no encontrado.");
    }

    const draftData = asObject(draftSnap.data());
    const workspace = asObject(draftData.templateWorkspace);
    const templateId = normalizeText(workspace.templateId || draftData.plantillaId);
    if (!templateId) {
      throw new HttpsError("failed-precondition", "El borrador no pertenece a una plantilla.");
    }

    const workspaceOwnerUid = normalizeText(workspace.openedByUid || draftData.userId);
    if (workspaceOwnerUid && workspaceOwnerUid !== uid && role !== "superadmin") {
      throw new HttpsError(
        "permission-denied",
        "No tenes permisos para cerrar este workspace."
      );
    }

    const loaded = await loadTemplateById(templateId);
    assertCanEditTemplate(role, loaded.normalized);

    const payload = buildTemplatePayloadFromDraft(draftData, loaded.normalized, {
      portada: portadaOverride || loaded.normalized.portada,
      estadoEditorial: normalizeEditorialState(loaded.normalized.estadoEditorial),
      tags: Array.isArray(loaded.normalized.tags) ? loaded.normalized.tags : [],
    });

    const { templateDoc } = await writeTemplateAndCatalog({
      templateId: loaded.id,
      baseRaw: loaded.raw,
      payload,
    });

    await draftRef.set(
      {
        templateWorkspace: {
          ...workspace,
          templateId,
          mode: "template_edit",
          readOnly: resolveTemplatePermissions(role, uid, templateDoc).readOnly,
          openedByUid: workspaceOwnerUid || uid,
          lastCommittedAt: admin.firestore.FieldValue.serverTimestamp(),
          estadoEditorial: normalizeEditorialState(templateDoc.estadoEditorial),
          tags: Array.isArray(templateDoc.tags) ? templateDoc.tags : [],
          templateName: normalizeText(templateDoc.nombre) || "Plantilla",
          permissions: resolveTemplatePermissions(role, uid, templateDoc),
        },
        ultimaEdicion: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      item: buildTemplateResponse(role, uid, loaded.id, templateDoc),
    };
  }
);

export const adminCreateTemplateFromDraftV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    const { uid, role } = resolveRole(request);
    const data = asObject(request.data);
    const draftSlug = normalizeText(data.draftSlug || data.slug);
    const templateIdInput = normalizeText(data.templateId || data.id);
    const incomingPayload = asObject(data.datos || data.payload);

    if (!draftSlug) {
      throw new HttpsError("invalid-argument", "draftSlug invalido.");
    }

    const draftSnap = await db().collection(DRAFTS_COLLECTION).doc(draftSlug).get();
    if (!draftSnap.exists) {
      throw new HttpsError("not-found", "Borrador no encontrado.");
    }

    const draftData = asObject(draftSnap.data());
    const draftOwnerUid = normalizeText(draftData.userId);
    if (draftOwnerUid && draftOwnerUid !== uid && role !== "superadmin") {
      throw new HttpsError(
        "permission-denied",
        "No tenes permisos para crear una plantilla desde este borrador."
      );
    }

    const requestAuthoringStatus = asObject(data.authoringStatus);
    const authoringStatus =
      typeof requestAuthoringStatus.isReady === "boolean"
        ? requestAuthoringStatus
        : asObject(asObject(draftData.templateAuthoringDraft).status);
    if (authoringStatus.isReady === false) {
      throw new HttpsError(
        "failed-precondition",
        "El schema dinamico del borrador no esta listo para guardarse como plantilla."
      );
    }

    const templateName =
      normalizeText(incomingPayload.nombre) ||
      normalizeText(draftData.nombre) ||
      "Plantilla";
    const templateId =
      templateIdInput || `${sanitizeSlug(templateName) || "plantilla"}-${Date.now()}`;

    const currentPayload: Record<string, unknown> =
      Object.keys(incomingPayload).length > 0
        ? incomingPayload
        : buildTemplatePayloadFromDraft(draftData, {}, {
            nombre: templateName,
            tipo: normalizeInvitationType(draftData.tipoInvitacion),
            portada: normalizeText(draftData.portada) || null,
            editor: "konva",
          });

    const { labels: canonicalTags } = await ensureTagCatalogEntries(
      currentPayload.tags,
      uid
    );

    const { templateDoc } = await writeTemplateAndCatalog({
      templateId,
      payload: {
        ...currentPayload,
        nombre: templateName,
        tipo: normalizeInvitationType(currentPayload.tipo || draftData.tipoInvitacion),
        editor: normalizeText(currentPayload.editor) || "konva",
        tags: canonicalTags,
        estado: normalizeText(currentPayload.estado) || "active",
        estadoEditorial: "en_proceso",
        templateAuthoringDraft: buildTemplateAuthoringDraft(
          draftData.templateAuthoringDraft,
          currentPayload,
          templateId,
          uid
        ),
      },
    });

    await recalculateTagUsageCounts(canonicalTags.map((entry) => sanitizeSlug(entry)));

    return {
      item: buildTemplateResponse(role, uid, templateId, templateDoc),
    };
  }
);
