import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { requireAdmin, requireAuth } from "../auth/adminAuth";
import { buildDraftContentMeta } from "../drafts/sourceOfTruth";
import { normalizeMusicConfig, resolveMusicResource } from "./config";
const { MUSIC_FEATURE_AVAILABILITY } = require("../../shared/musicConfig.cjs");
const { isMusicPilotUser } = require("../../shared/musicAccess.cjs");

type UnknownRecord = Record<string, unknown>;
const EDITOR_PATCH_KEYS = new Set([
  "nombre", "objetos", "secciones", "rsvp", "gifts", "music", "eventDetails",
  "templateAuthoringDraft", "templateInput", "draftContentMeta",
]);

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "El documento del editor no es v\u00e1lido.");
  }
  return value as UnknownRecord;
}

export function buildDraftMusicPatch(
  rawPatch: unknown, timestamp: unknown, existingMusic?: unknown
): UnknownRecord {
  const patch = asRecord(rawPatch);
  if (!Object.prototype.hasOwnProperty.call(patch, "music") ||
      Object.keys(patch).some((key) => !EDITOR_PATCH_KEYS.has(key))) {
    throw new HttpsError("invalid-argument", "La operaci\u00f3n s\u00f3lo admite campos del editor y debe incluir M\u00fasica.");
  }
  for (const key of ["objetos", "secciones"]) {
    if (key in patch && !Array.isArray(patch[key])) {
      throw new HttpsError("invalid-argument", "Los objetos y secciones deben ser listas.");
    }
  }
  if ("nombre" in patch && typeof patch.nombre !== "string") {
    throw new HttpsError("invalid-argument", "El nombre del borrador no es v\u00e1lido.");
  }
  const rawMusic = asRecord(patch.music);
  if (Object.keys(rawMusic).some((key) => !["version", "enabled", "track", "volume", "loop"].includes(key)) ||
      typeof rawMusic.enabled !== "boolean" ||
      ("version" in rawMusic && rawMusic.version !== 1) ||
      ("volume" in rawMusic && (typeof rawMusic.volume !== "number" || !Number.isFinite(rawMusic.volume) || rawMusic.volume < 0 || rawMusic.volume > 1)) ||
      ("loop" in rawMusic && typeof rawMusic.loop !== "boolean")) {
    throw new HttpsError("invalid-argument", "La configuraci\u00f3n de M\u00fasica no es v\u00e1lida.");
  }
  const music = normalizeMusicConfig(rawMusic);
  const preservesExistingMusic = JSON.stringify(music) === JSON.stringify(normalizeMusicConfig(existingMusic));
  if (rawMusic.track != null) {
    const track = asRecord(rawMusic.track);
    if (Object.keys(track).some((key) => !["source", "id"].includes(key)) ||
        (!preservesExistingMusic && track.source !== "catalog") ||
        music.track?.source !== track.source || music.track?.id !== track.id) {
      throw new HttpsError("invalid-argument", "Eleg\u00ed una canci\u00f3n del cat\u00e1logo.");
    }
  }
  if (!preservesExistingMusic && music.enabled && music.track && !resolveMusicResource(music)) {
    throw new HttpsError("failed-precondition", "La canci\u00f3n elegida no est\u00e1 disponible.");
  }
  const meta = patch.draftContentMeta == null ? {} : asRecord(patch.draftContentMeta);
  return {
    ...patch,
    music,
    draftContentMeta: {
      ...buildDraftContentMeta({ lastWriter: "canvas", reason: meta.lastReason }),
      updatedAt: timestamp,
    },
    ultimaEdicion: timestamp,
  };
}

// This is the existing editor-session writer's atomic transport for music
// patches, not a second editor state owner. Server auth preserves configured
// superadmins without changing the unresolved global Rules/claims policy.
export async function saveDraftWithMusicHandler(
  request: CallableRequest<unknown>,
  db: Firestore
): Promise<{ ok: true; draftId: string }> {
  const uid = requireAuth(request);
  const data = asRecord(request.data);
  const draftId = typeof data.draftId === "string" ? data.draftId.trim() : "";
  if (!draftId || draftId.length > 200 || draftId.includes("/") || [".", ".."].includes(draftId)) {
    throw new HttpsError("invalid-argument", "El borrador no es v\u00e1lido.");
  }
  const ref = db.collection("borradores").doc(draftId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "El borrador no existe.");
    if (snapshot.data()?.userId !== uid) {
      throw new HttpsError("permission-denied", "No pod\u00e9s modificar este borrador.");
    }
    const current = snapshot.data() || {};
    const incomingPatch = asRecord(data.patch);
    const musicChanged = JSON.stringify(normalizeMusicConfig(incomingPatch.music)) !==
      JSON.stringify(normalizeMusicConfig(current.music));
    if (musicChanged) {
      const pilotAccess = isMusicPilotUser({
        uid,
        email: request.auth?.token.email,
        emailVerified: request.auth?.token.email_verified,
      });
      if (!pilotAccess) requireAdmin(request);
      if (MUSIC_FEATURE_AVAILABILITY.editor !== true) {
        throw new HttpsError("failed-precondition", "M\u00fasica no est\u00e1 disponible.");
      }
    }
    const timestamp = FieldValue.serverTimestamp();
    const patch = buildDraftMusicPatch(incomingPatch, timestamp, current.music);
    if (!musicChanged) {
      if (Object.prototype.hasOwnProperty.call(current, "music")) patch.music = current.music;
      else delete patch.music;
    }
    for (const key of ["templateInput", "templateAuthoringDraft"]) {
      if (!(key in patch)) continue;
      const incoming = asRecord(patch[key]);
      const stored = current[key] && typeof current[key] === "object"
        ? current[key] as UnknownRecord : {};
      const content = { ...incoming };
      delete content.appliedAt;
      delete content.updatedAt;
      patch[key] = {
        ...content,
        ...(key === "templateInput" && stored.appliedAt != null ? { appliedAt: stored.appliedAt } : {}),
        updatedAt: timestamp,
      };
    }
    // Merge exact root fields, matching updateDoc replacement semantics for maps.
    transaction.set(ref, patch, { mergeFields: Object.keys(patch) });
  });
  return { ok: true, draftId };
}
