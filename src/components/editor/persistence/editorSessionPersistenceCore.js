import {
  EDITOR_SESSION_KINDS,
  normalizeEditorSession,
} from "../../../domain/drafts/session.js";
import { buildDraftContentMeta } from "../../../domain/drafts/sourceOfTruth.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stripUndefinedDeep(value) {
  if (value === undefined) return undefined;

  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, stripUndefinedDeep(nested)])
      .filter(([, nested]) => nested !== undefined)
  );
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function createEditorSessionError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function assertSupportedSession(session) {
  if (!session?.isSupported) {
    throw createEditorSessionError(
      "unsupported-session-kind",
      `Tipo de sesion de editor no soportado: ${normalizeText(session?.kind) || "sin-kind"}.`
    );
  }
}

function normalizeSnapshotResult(result) {
  if (!result) {
    return {
      exists: false,
      data: {},
      snapshot: null,
    };
  }

  if (typeof result.exists === "function") {
    const exists = result.exists();
    return {
      exists,
      data: exists && typeof result.data === "function" ? result.data() || {} : {},
      snapshot: result,
    };
  }

  if (result.exists === false) {
    return {
      exists: false,
      data: {},
      snapshot: null,
    };
  }

  const data =
    typeof result.data === "function"
      ? result.data() || {}
      : result.data && typeof result.data === "object"
        ? result.data
        : result && typeof result === "object"
          ? result
          : {};

  return {
    exists: Object.keys(data).length > 0 || result.exists === true,
    data,
    snapshot: result,
  };
}

function buildDraftPatchWithMetadata({
  patch,
  reason,
  createTimestamp,
  includeDraftMetadata,
} = {}) {
  const payload = {
    ...(stripUndefinedDeep(asObject(patch)) || {}),
  };

  if (!includeDraftMetadata) {
    return payload;
  }

  const timestamp = typeof createTimestamp === "function" ? createTimestamp() : null;
  const existingMeta = asObject(payload.draftContentMeta);
  payload.draftContentMeta = {
    ...buildDraftContentMeta({
      lastWriter: normalizeText(existingMeta.lastWriter) || "canvas",
      reason: normalizeText(reason) || normalizeText(existingMeta.lastReason),
    }),
    ...existingMeta,
    updatedAt: hasOwn(existingMeta, "updatedAt") && existingMeta.updatedAt != null
      ? existingMeta.updatedAt
      : timestamp,
  };

  if (!hasOwn(payload, "ultimaEdicion") || payload.ultimaEdicion == null) {
    payload.ultimaEdicion = timestamp;
  }

  return payload;
}

function buildTemplatePatch(patch) {
  const source = stripUndefinedDeep(asObject(patch)) || {};
  const {
    draftContentMeta: _draftContentMeta,
    ultimaEdicion: _ultimaEdicion,
    ...templatePatch
  } = source;
  return templatePatch;
}

export function createFirestoreLikeSnapshot({
  id = "",
  exists = false,
  data = {},
} = {}) {
  const safeData = asObject(data);
  return {
    id,
    exists: () => Boolean(exists),
    data: () => safeData,
  };
}

export function createEditorSessionPersistence({
  readDraftDocument,
  writeDraftPatch,
  readTemplateEditorDocument,
  writeTemplateDocument,
  createTimestamp = () => null,
} = {}) {
  async function readEditorSessionDocument({
    session,
    slug = "",
    initialData = null,
  } = {}) {
    const resolvedSession = normalizeEditorSession(session, slug);
    assertSupportedSession(resolvedSession);

    if (!resolvedSession.id) {
      throw createEditorSessionError(
        "missing-session-id",
        "No se pudo leer la sesion del editor: id invalido."
      );
    }

    if (initialData && typeof initialData === "object") {
      return {
        exists: true,
        data: initialData,
        session: resolvedSession,
        source: "injected",
        snapshot: createFirestoreLikeSnapshot({
          id: resolvedSession.id,
          exists: true,
          data: initialData,
        }),
      };
    }

    if (resolvedSession.kind === EDITOR_SESSION_KINDS.TEMPLATE) {
      if (typeof readTemplateEditorDocument !== "function") {
        throw createEditorSessionError(
          "template-read-unavailable",
          "No hay lector de plantilla configurado para el editor."
        );
      }

      const result = await readTemplateEditorDocument({
        templateId: resolvedSession.id,
      });
      const data =
        result?.editorDocument && typeof result.editorDocument === "object"
          ? result.editorDocument
          : {};

      return {
        exists: Object.keys(data).length > 0,
        data,
        session: resolvedSession,
        source: "callable",
        raw: result,
        snapshot: createFirestoreLikeSnapshot({
          id: resolvedSession.id,
          exists: Object.keys(data).length > 0,
          data,
        }),
      };
    }

    if (resolvedSession.kind === EDITOR_SESSION_KINDS.DRAFT) {
      if (typeof readDraftDocument !== "function") {
        throw createEditorSessionError(
          "draft-read-unavailable",
          "No hay lector de borrador configurado para el editor."
        );
      }

      const result = normalizeSnapshotResult(
        await readDraftDocument({
          draftId: resolvedSession.id,
        })
      );

      return {
        exists: result.exists,
        data: result.data,
        session: resolvedSession,
        source: "firestore",
        snapshot: result.snapshot || createFirestoreLikeSnapshot({
          id: resolvedSession.id,
          exists: result.exists,
          data: result.data,
        }),
      };
    }

    throw createEditorSessionError("unsupported-session-kind", resolvedSession.kind);
  }

  async function persistEditorSessionPatch({
    session,
    slug = "",
    patch,
    reason = "editor-persist",
    readOnly = false,
    includeDraftMetadata = true,
  } = {}) {
    const resolvedSession = normalizeEditorSession(session, slug);
    assertSupportedSession(resolvedSession);

    if (readOnly) {
      throw createEditorSessionError(
        "read-only-session",
        "La sesion del editor esta en modo solo lectura."
      );
    }

    if (!resolvedSession.id) {
      throw createEditorSessionError(
        "missing-session-id",
        "No se pudo guardar la sesion del editor: id invalido."
      );
    }

    if (resolvedSession.kind === EDITOR_SESSION_KINDS.TEMPLATE) {
      if (typeof writeTemplateDocument !== "function") {
        throw createEditorSessionError(
          "template-write-unavailable",
          "No hay persistencia de plantilla configurada para el editor."
        );
      }

      const document = buildTemplatePatch(patch);
      await writeTemplateDocument({
        templateId: resolvedSession.id,
        document,
      });

      return {
        ok: true,
        session: resolvedSession,
        transport: "callable",
        reason,
        patch: document,
      };
    }

    if (resolvedSession.kind === EDITOR_SESSION_KINDS.DRAFT) {
      if (typeof writeDraftPatch !== "function") {
        throw createEditorSessionError(
          "draft-write-unavailable",
          "No hay persistencia de borrador configurada para el editor."
        );
      }

      const payload = buildDraftPatchWithMetadata({
        patch,
        reason,
        createTimestamp,
        includeDraftMetadata,
      });

      await writeDraftPatch({
        draftId: resolvedSession.id,
        patch: payload,
      });

      return {
        ok: true,
        session: resolvedSession,
        transport: "firestore",
        reason,
        patch: payload,
      };
    }

    throw createEditorSessionError("unsupported-session-kind", resolvedSession.kind);
  }

  async function persistEditorSessionSnapshot({
    state,
    patch,
    reason = "autosave",
    readOnly = false,
    includeDraftMetadata = true,
  } = {}) {
    const safeState = state && typeof state === "object" ? state : {};
    return persistEditorSessionPatch({
      session: safeState.editorSession,
      slug: safeState.slug,
      patch,
      reason,
      readOnly,
      includeDraftMetadata,
    });
  }

  return {
    readEditorSessionDocument,
    persistEditorSessionPatch,
    persistEditorSessionSnapshot,
  };
}
