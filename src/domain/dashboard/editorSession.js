import {
  resolveOwnedDraftSlugForEditorRead,
  sanitizeDraftSlug,
} from "../invitations/readResolution.js";
import { isDraftTrashed as defaultIsDraftTrashed } from "../drafts/state.js";
import { normalizeDraftRenderState } from "../drafts/sourceOfTruth.js";
import {
  decodeURIComponentSafe,
  isTruthyQueryFlag,
  sanitizeUidValue,
} from "./helpers.js";

const INITIAL_ADMIN_DRAFT_VIEW = Object.freeze({
  enabled: false,
  status: "idle",
  ownerUid: "",
  slug: "",
  draftData: null,
  draftName: "",
});

const INITIAL_TEMPLATE_WORKSPACE_VIEW = Object.freeze({
  enabled: false,
  status: "idle",
  templateId: "",
  readOnly: false,
  draftName: "",
  templateName: "",
  estadoEditorial: "",
  permissions: {},
  initialData: null,
});

const INITIAL_EDITOR_SESSION = Object.freeze({
  kind: null,
  id: "",
});

function normalizeText(value) {
  return String(value || "").trim();
}

function hasModernDraftRenderState(rawDraft) {
  const renderState = normalizeDraftRenderState(rawDraft);
  return renderState.secciones.length > 0 || renderState.objetos.length > 0;
}

export function createAdminDraftViewState(overrides = {}) {
  return {
    ...INITIAL_ADMIN_DRAFT_VIEW,
    ...overrides,
  };
}

export function createTemplateWorkspaceViewState(overrides = {}) {
  return {
    ...INITIAL_TEMPLATE_WORKSPACE_VIEW,
    ...overrides,
  };
}

export function createDashboardEditorSession(overrides = {}) {
  return {
    ...INITIAL_EDITOR_SESSION,
    ...overrides,
  };
}

export function normalizeDashboardAsPath(value) {
  if (typeof value !== "string") return "";
  const withoutHash = value.split("#")[0] || "";
  const [pathnameRaw, searchRaw = ""] = withoutHash.split("?");
  let pathname = pathnameRaw.trim() || "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  return searchRaw ? `${pathname}?${searchRaw}` : pathname;
}

export function buildDashboardAsPathFromQuery(queryObj = {}) {
  const params = new URLSearchParams();
  Object.keys(queryObj || {})
    .sort()
    .forEach((key) => {
      const value = queryObj[key];
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item === null || typeof item === "undefined") return;
          const text = String(item).trim();
          if (!text) return;
          params.append(key, text);
        });
        return;
      }
      if (value === null || typeof value === "undefined") return;
      const text = String(value).trim();
      if (!text) return;
      params.set(key, text);
    });

  const serialized = params.toString();
  return serialized ? `/dashboard?${serialized}` : "/dashboard";
}

export function isPermissionDeniedFirestoreError(error) {
  const code = normalizeText(error?.code).toLowerCase();
  return code === "permission-denied" || code.includes("permission-denied");
}

export function normalizeTemplateWorkspaceFromDraft(rawDraft) {
  const draftData = rawDraft && typeof rawDraft === "object" ? rawDraft : {};
  const workspace =
    draftData?.templateWorkspace && typeof draftData.templateWorkspace === "object"
      ? draftData.templateWorkspace
      : {};
  const permissions =
    workspace?.permissions && typeof workspace.permissions === "object"
      ? workspace.permissions
      : {};
  const templateId =
    typeof workspace?.templateId === "string" ? workspace.templateId.trim() : "";
  const mode = typeof workspace?.mode === "string" ? workspace.mode.trim() : "";
  const draftName =
    typeof draftData?.nombre === "string"
      ? draftData.nombre.trim()
      : typeof workspace?.templateName === "string"
        ? workspace.templateName.trim()
        : "";

  return {
    enabled: Boolean(templateId && mode === "template_edit"),
    templateId,
    readOnly: workspace?.readOnly === true || permissions?.readOnly === true,
    draftName,
    templateName:
      typeof workspace?.templateName === "string"
        ? workspace.templateName.trim()
        : "",
    estadoEditorial:
      typeof workspace?.estadoEditorial === "string"
        ? workspace.estadoEditorial.trim()
        : "",
    permissions,
  };
}

export function buildLegacyDraftNotice(slug, draftData = null) {
  const legacyName = String(draftData?.nombre || draftData?.slug || slug || "").trim();
  return {
    slug,
    title: "Este borrador usa un formato antiguo",
    body: `El borrador "${legacyName}" no se puede abrir en el dashboard actual porque no tiene estructura moderna de secciones y objetos.`,
  };
}

export function recoverQueryFromCorruptedSlug(rawSlug) {
  if (typeof rawSlug !== "string") return {};
  const decoded = decodeURIComponentSafe(rawSlug);
  const queryStart = decoded.indexOf("?");
  if (queryStart < 0) return {};
  const suffix = decoded.slice(queryStart + 1).trim();
  if (!suffix) return {};

  const recovered = {};
  try {
    const params = new URLSearchParams(suffix);
    params.forEach((value, key) => {
      const cleanKey = String(key || "").trim();
      if (!cleanKey || cleanKey === "slug") return;
      recovered[cleanKey] = value;
    });
  } catch {}

  return recovered;
}

export async function resolveCompatibleDraftForDashboardEditor({
  slug,
  uid,
  readDraftBySlug,
  readPublicationBySlug,
  isDraftTrashed = defaultIsDraftTrashed,
  isPermissionDeniedError = isPermissionDeniedFirestoreError,
} = {}) {
  const resolvedSlug = await resolveOwnedDraftSlugForEditorRead({
    slug,
    uid,
    readDraftBySlug,
    readPublicationBySlug,
    isPermissionDeniedError,
    isDraftTrashed,
  });

  if (!resolvedSlug) {
    return { status: "unavailable", slug: null, draftData: null };
  }

  try {
    const draftSnap = await readDraftBySlug(resolvedSlug);
    const exists =
      draftSnap && typeof draftSnap.exists === "function"
        ? draftSnap.exists()
        : draftSnap?.exists !== false;

    if (!exists) {
      return { status: "missing", slug: resolvedSlug, draftData: null };
    }

    const draftData =
      draftSnap && typeof draftSnap.data === "function"
        ? draftSnap.data() || {}
        : draftSnap?.data || {};

    if (isDraftTrashed(draftData)) {
      return { status: "unavailable", slug: resolvedSlug, draftData };
    }

    if (!hasModernDraftRenderState(draftData)) {
      return { status: "legacy", slug: resolvedSlug, draftData };
    }

    return { status: "ok", slug: resolvedSlug, draftData };
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return { status: "unavailable", slug: resolvedSlug, draftData: null };
    }

    return { status: "ok", slug: resolvedSlug, draftData: null };
  }
}

export {
  isTruthyQueryFlag,
  sanitizeDraftSlug,
  sanitizeUidValue,
};
