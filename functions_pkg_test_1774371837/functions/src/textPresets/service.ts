import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { requireAdmin, requireAuth } from "../auth/adminAuth";
import { normalizeInvitationType } from "../utils/invitationType";

const OPTIONS = {
  region: "us-central1" as const,
  cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
};

const COLLECTION = "text_presets";
const SCHEMA_VERSION = 1;

const PRESET_TYPES = new Set(["simple", "compuesto"]);
const TEXT_ALIGNMENTS = new Set(["left", "center", "right"]);

function db() {
  return admin.firestore();
}

function fail(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function normalizeLower(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function text(value: unknown, max = 180): string {
  return normalizeString(value).slice(0, max);
}

function optionalText(value: unknown, max = 180): string | null {
  const safe = text(value, max);
  return safe ? safe : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeSlug(value: unknown): string {
  const safe = normalizeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return safe;
}

function toSafeId(value: unknown): string {
  const safe = sanitizeSlug(value);
  if (!safe) fail("presetId invalido.");
  return safe;
}

function parseBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "si") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  return fallback;
}

function parseFinite(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalFinite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTags(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : normalizeString(value)
        .split(",")
        .map((entry) => entry.trim());

  const set = new Set<string>();
  for (const entry of source) {
    const normalized = normalizeLower(entry)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
    if (!normalized) continue;
    set.add(normalized);
  }

  return [...set].slice(0, 30);
}

type NormalizedPresetItem = {
  id: string;
  texto: string;
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  fontWeight: string;
  lineHeight?: number;
  letterSpacing?: number;
  italic?: boolean;
  uppercase?: boolean;
};

type NormalizedPreset = {
  id: string;
  slug: string;
  nombre: string;
  tipo: "simple" | "compuesto";
  categoria: "boda" | "quince" | "cumple" | "empresarial" | "general";
  tags: string[];
  activo: boolean;
  mostrarEnEditor: boolean;
  orden: number;
  items: NormalizedPresetItem[];
  preview: {
    lineas: string[];
    hasMultiple: boolean;
  };
};

function normalizeItem(raw: unknown, index: number): NormalizedPresetItem {
  if (!isObject(raw)) fail(`items[${index}] invalido.`);

  const rawAlign = normalizeLower(raw.align || raw.textAlign || raw.alineacion || "left");
  const align = TEXT_ALIGNMENTS.has(rawAlign)
    ? (rawAlign as "left" | "center" | "right")
    : "left";

  const fontSize = Math.max(8, Math.min(240, Math.round(parseFinite(raw.fontSize, 24))));
  const lineHeight = parseOptionalFinite(raw.lineHeight);
  const letterSpacing = parseOptionalFinite(raw.letterSpacing);

  const normalized: NormalizedPresetItem = {
    id: sanitizeSlug(raw.id) || `item-${index + 1}`,
    texto: text(raw.texto, 2000),
    x: parseFinite(raw.x, 0),
    y: parseFinite(raw.y, index === 0 ? 0 : index * (fontSize + 8)),
    fontFamily: text(raw.fontFamily || raw.font || "sans-serif", 160) || "sans-serif",
    fontSize,
    color: text(raw.color || raw.fill || raw.colorTexto || "#000000", 120) || "#000000",
    align,
    fontWeight: text(raw.fontWeight || raw.weight || "normal", 40) || "normal",
    ...(Number.isFinite(lineHeight as number) && (lineHeight as number) > 0
      ? { lineHeight: Number(lineHeight) }
      : {}),
    ...(Number.isFinite(letterSpacing as number)
      ? { letterSpacing: Number(letterSpacing) }
      : {}),
    ...(parseBool(raw.italic, false)
      ? { italic: true }
      : normalizeLower(raw.fontStyle).includes("italic") || normalizeLower(raw.fontStyle).includes("oblique")
        ? { italic: true }
        : {}),
    ...(parseBool(raw.uppercase, false) ? { uppercase: true } : {}),
  };

  return normalized;
}

function normalizeItems(raw: unknown, tipo: "simple" | "compuesto"): NormalizedPresetItem[] {
  const asArray = Array.isArray(raw) ? raw : [];
  if (asArray.length === 0) fail("Debes definir al menos un item de texto.");

  const normalized = asArray.map((entry, index) => normalizeItem(entry, index));
  if (tipo === "simple") {
    return [normalized[0]];
  }
  return normalized;
}

function normalizePresetType(value: unknown, itemCountHint = 1): "simple" | "compuesto" {
  const normalized = normalizeLower(value);
  if (PRESET_TYPES.has(normalized)) return normalized as "simple" | "compuesto";
  return itemCountHint > 1 ? "compuesto" : "simple";
}

function buildPreview(items: NormalizedPresetItem[]) {
  const lines = items
    .slice(0, 3)
    .map((item) => text(item.texto, 64))
    .filter(Boolean);

  return {
    lineas: lines,
    hasMultiple: items.length > 1,
  };
}

function serialize(value: unknown): unknown {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map((entry) => serialize(entry));
  if (isObject(value)) {
    const out: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, nested]) => {
      out[key] = serialize(nested);
    });
    return out;
  }
  return value;
}

function normalizePreset(input: Record<string, unknown>, fallbackId: string | null): NormalizedPreset {
  const rawItems = Array.isArray(input.items)
    ? input.items
    : Array.isArray(input.objetos)
      ? input.objetos
      : Array.isArray(input.elements)
        ? input.elements
        : Array.isArray(input.itemsLegacy)
          ? input.itemsLegacy
          : [];

  const inferredType = normalizePresetType(input.tipo, rawItems.length);
  const items = normalizeItems(rawItems, inferredType);
  const tipo = normalizePresetType(input.tipo, items.length);

  const nombre = text(input.nombre || input.name, 120);
  if (!nombre) fail("El nombre es obligatorio.");

  const slug = sanitizeSlug(input.slug || fallbackId || nombre);
  if (!slug) fail("No se pudo resolver el slug del preset.");

  const id = sanitizeSlug(input.id || fallbackId || slug) || slug;
  const categoria = normalizeInvitationType(input.categoria || input.tipoInvitacion);
  const orden = Math.max(-9999, Math.min(9999, Math.round(parseFinite(input.orden, 0))));

  return {
    id,
    slug,
    nombre,
    tipo,
    categoria,
    tags: normalizeTags(input.tags),
    activo: parseBool(input.activo, true),
    mostrarEnEditor: parseBool(input.mostrarEnEditor, true),
    orden,
    items,
    preview: buildPreview(items),
  };
}

async function findDocBySlug(slug: string) {
  const snap = await db()
    .collection(COLLECTION)
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0];
}

function sortByOrderAndDate(items: Record<string, unknown>[]) {
  return items.sort((left, right) => {
    const orderDiff = Number(left.orden || 0) - Number(right.orden || 0);
    if (orderDiff !== 0) return orderDiff;

    const leftUpdatedRaw = left.audit && isObject(left.audit) ? left.audit.updatedAt : null;
    const rightUpdatedRaw = right.audit && isObject(right.audit) ? right.audit.updatedAt : null;
    const leftUpdatedMs =
      leftUpdatedRaw instanceof admin.firestore.Timestamp
        ? leftUpdatedRaw.toDate().getTime()
        : 0;
    const rightUpdatedMs =
      rightUpdatedRaw instanceof admin.firestore.Timestamp
        ? rightUpdatedRaw.toDate().getTime()
        : 0;
    if (rightUpdatedMs !== leftUpdatedMs) return rightUpdatedMs - leftUpdatedMs;

    return String(left.nombre || "").localeCompare(String(right.nombre || ""));
  });
}

async function createUniqueSlug(base: string): Promise<string> {
  const normalizedBase = sanitizeSlug(base) || "preset-texto";

  const firstTry = await findDocBySlug(normalizedBase);
  if (!firstTry) return normalizedBase;

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const candidate = sanitizeSlug(`${normalizedBase}-${attempt}`);
    if (!candidate) continue;
    const found = await findDocBySlug(candidate);
    if (!found) return candidate;
  }

  const fallback = sanitizeSlug(`${normalizedBase}-${Date.now().toString(36)}`);
  if (!fallback) fail("No se pudo generar slug unico.");
  return fallback;
}

function normalizeLegacyPreset(raw: unknown, index: number): NormalizedPreset {
  if (!isObject(raw)) fail(`legacy presets[${index}] invalido.`);

  const itemsRaw = Array.isArray(raw.objetos)
    ? raw.objetos
    : Array.isArray(raw.elements)
      ? raw.elements
      : Array.isArray(raw.items)
        ? raw.items
        : [];

  const tipo = normalizePresetType(raw.tipo, itemsRaw.length || 1);
  const items = normalizeItems(itemsRaw, tipo);
  const nombre = text(raw.nombre || raw.name || raw.id || `Preset ${index + 1}`, 120);
  const slug = sanitizeSlug(raw.slug || raw.id || nombre || `preset-${index + 1}`);

  if (!slug) fail(`legacy presets[${index}] no tiene slug valido.`);

  return {
    id: slug,
    slug,
    nombre,
    tipo,
    categoria: normalizeInvitationType(raw.categoria || raw.tipoInvitacion),
    tags: normalizeTags(raw.tags),
    activo: true,
    mostrarEnEditor: true,
    orden: Math.max(-9999, Math.min(9999, Math.round(parseFinite(raw.orden, index)))),
    items,
    preview: buildPreview(items),
  };
}

export const adminListTextPresetsV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    requireAdmin(request);

    const snap = await db().collection(COLLECTION).get();
    const mapped = sortByOrderAndDate(
      snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Record<string, unknown>),
      }))
    ).map((item) => serialize(item) as Record<string, unknown>);

    return {
      schemaVersion: SCHEMA_VERSION,
      items: mapped,
    };
  }
);

export const adminUpsertTextPresetV1 = onCall(
  OPTIONS,
  async (
    request: CallableRequest<{
      presetId?: unknown;
      preset?: unknown;
    }>
  ) => {
    const uid = requireAdmin(request);

    const presetPayload = isObject(request.data?.preset) ? request.data.preset : null;
    if (!presetPayload) fail("preset es obligatorio.");

    const requestedId = optionalText(request.data?.presetId, 120);
    const normalized = normalizePreset(presetPayload, requestedId);

    const incomingId = requestedId ? toSafeId(requestedId) : normalized.id;
    const docRef = db().collection(COLLECTION).doc(incomingId);
    const existingSnap = await docRef.get();

    const slugOwner = await findDocBySlug(normalized.slug);
    if (slugOwner && slugOwner.id !== docRef.id) {
      throw new HttpsError("already-exists", "Ya existe un preset con ese slug.");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const existingData = existingSnap.exists
      ? (existingSnap.data() as Record<string, unknown>)
      : null;

    await docRef.set(
      {
        schemaVersion: SCHEMA_VERSION,
        slug: normalized.slug,
        nombre: normalized.nombre,
        tipo: normalized.tipo,
        categoria: normalized.categoria,
        tags: normalized.tags,
        activo: normalized.activo,
        mostrarEnEditor: normalized.mostrarEnEditor,
        orden: normalized.orden,
        items: normalized.items,
        preview: normalized.preview,
        audit: {
          createdByUid:
            existingData && isObject(existingData.audit) && existingData.audit.createdByUid
              ? existingData.audit.createdByUid
              : uid,
          createdAt:
            existingData && isObject(existingData.audit) && existingData.audit.createdAt
              ? existingData.audit.createdAt
              : now,
          updatedByUid: uid,
          updatedAt: now,
        },
      },
      { merge: true }
    );

    const fresh = await docRef.get();
    return {
      ok: true,
      item: serialize({
        id: fresh.id,
        ...(fresh.data() || {}),
      }),
    };
  }
);

export const adminDuplicateTextPresetV1 = onCall(
  OPTIONS,
  async (
    request: CallableRequest<{
      presetId?: unknown;
    }>
  ) => {
    const uid = requireAdmin(request);

    const presetId = toSafeId(request.data?.presetId);
    const sourceRef = db().collection(COLLECTION).doc(presetId);
    const sourceSnap = await sourceRef.get();
    if (!sourceSnap.exists) throw new HttpsError("not-found", "No existe el preset solicitado.");

    const sourceData = sourceSnap.data() as Record<string, unknown>;
    const sourceSlug = sanitizeSlug(sourceData.slug || sourceSnap.id || "preset-texto");
    const nextSlug = await createUniqueSlug(`${sourceSlug}-copia`);
    const nextId = nextSlug;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const targetRef = db().collection(COLLECTION).doc(nextId);

    await targetRef.set({
      ...sourceData,
      slug: nextSlug,
      nombre: `${text(sourceData.nombre, 110) || "Preset"} (copia)`,
      activo: false,
      mostrarEnEditor: false,
      audit: {
        createdByUid: uid,
        createdAt: now,
        updatedByUid: uid,
        updatedAt: now,
        duplicateOf: sourceSnap.id,
      },
    });

    const fresh = await targetRef.get();
    return {
      ok: true,
      item: serialize({
        id: fresh.id,
        ...(fresh.data() || {}),
      }),
    };
  }
);

export const adminSetTextPresetActivationV1 = onCall(
  OPTIONS,
  async (
    request: CallableRequest<{
      presetId?: unknown;
      activo?: unknown;
    }>
  ) => {
    const uid = requireAdmin(request);
    const presetId = toSafeId(request.data?.presetId);
    const activo = parseBool(request.data?.activo, false);

    const docRef = db().collection(COLLECTION).doc(presetId);
    const snap = await docRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "No existe el preset solicitado.");

    await docRef.set(
      {
        activo,
        audit: {
          ...(isObject(snap.data()?.audit) ? snap.data()?.audit : {}),
          updatedByUid: uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );

    return { ok: true, presetId, activo };
  }
);

export const adminSetTextPresetVisibilityV1 = onCall(
  OPTIONS,
  async (
    request: CallableRequest<{
      presetId?: unknown;
      mostrarEnEditor?: unknown;
    }>
  ) => {
    const uid = requireAdmin(request);
    const presetId = toSafeId(request.data?.presetId);
    const mostrarEnEditor = parseBool(request.data?.mostrarEnEditor, false);

    const docRef = db().collection(COLLECTION).doc(presetId);
    const snap = await docRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "No existe el preset solicitado.");

    await docRef.set(
      {
        mostrarEnEditor,
        audit: {
          ...(isObject(snap.data()?.audit) ? snap.data()?.audit : {}),
          updatedByUid: uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );

    return { ok: true, presetId, mostrarEnEditor };
  }
);

export const adminDeleteTextPresetV1 = onCall(
  OPTIONS,
  async (
    request: CallableRequest<{
      presetId?: unknown;
    }>
  ) => {
    requireAdmin(request);
    const presetId = toSafeId(request.data?.presetId);

    const docRef = db().collection(COLLECTION).doc(presetId);
    const snap = await docRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "No existe el preset solicitado.");

    await docRef.delete();
    return { ok: true, presetId, deleted: true };
  }
);

export const adminSyncLegacyTextPresetsV1 = onCall(
  OPTIONS,
  async (
    request: CallableRequest<{
      presets?: unknown;
    }>
  ) => {
    const uid = requireAdmin(request);

    const presetsRaw = Array.isArray(request.data?.presets) ? request.data?.presets : [];
    if (!presetsRaw.length) {
      return {
        ok: true,
        created: 0,
        skipped: 0,
        createdIds: [],
        skippedIds: [],
      };
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    let created = 0;
    let skipped = 0;
    const createdIds: string[] = [];
    const skippedIds: string[] = [];

    for (let index = 0; index < presetsRaw.length; index += 1) {
      const normalized = normalizeLegacyPreset(presetsRaw[index], index);
      const existing = await findDocBySlug(normalized.slug);
      if (existing) {
        skipped += 1;
        skippedIds.push(existing.id);
        continue;
      }

      const ref = db().collection(COLLECTION).doc(normalized.slug);
      await ref.set({
        schemaVersion: SCHEMA_VERSION,
        slug: normalized.slug,
        nombre: normalized.nombre,
        tipo: normalized.tipo,
        categoria: normalized.categoria,
        tags: normalized.tags,
        activo: true,
        mostrarEnEditor: true,
        orden: normalized.orden,
        items: normalized.items,
        preview: normalized.preview,
        audit: {
          createdByUid: uid,
          createdAt: now,
          updatedByUid: uid,
          updatedAt: now,
          migrationSource: "legacy-config-v1",
        },
      });

      created += 1;
      createdIds.push(ref.id);
    }

    return {
      ok: true,
      created,
      skipped,
      createdIds,
      skippedIds,
    };
  }
);

export const listTextPresetsPublicV1 = onCall(
  OPTIONS,
  async (
    request: CallableRequest<{
      categoria?: unknown;
    }>
  ) => {
    requireAuth(request);

    const categoria = normalizeInvitationType(request.data?.categoria);
    const categoriasFiltro = categoria === "general" ? ["general"] : [categoria, "general"];

    const snap = await db()
      .collection(COLLECTION)
      .where("activo", "==", true)
      .where("mostrarEnEditor", "==", true)
      .where("categoria", "in", categoriasFiltro)
      .orderBy("orden", "asc")
      .get();

    const mapped = snap.docs.map(
      (docSnap) =>
        ({
          id: docSnap.id,
          ...(docSnap.data() as Record<string, unknown>),
        } as Record<string, unknown>)
    );

    const items = mapped
      .filter((item) => categoriasFiltro.includes(normalizeInvitationType(item.categoria)))
      .sort((left, right) => {
        const orderDiff = Number(left.orden || 0) - Number(right.orden || 0);
        if (orderDiff !== 0) return orderDiff;
        return String(left.nombre || "").localeCompare(String(right.nombre || ""));
      })
      .map((item) => serialize(item));

    return {
      schemaVersion: SCHEMA_VERSION,
      categoria,
      items,
    };
  }
);
