import type { DocumentData, DocumentReference } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { DRAFT_STATES, resolveDraftStateFromData } from "./draftState";

export type TemplateDraftIdentity = {
  uid: string;
  plantillaId: string;
  mode: "konva" | "html";
};

// These identifiers are both Firestore document IDs and Storage path segments.
// Do not normalize two different inputs into the same destination.
export function requireDraftPathSegment(value: unknown, name: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() ||
      Buffer.byteLength(value, "utf8") > 1500 || /[/\\]/.test(value) ||
      Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
      value === "." || value === ".." || /^__.*__$/.test(value)) {
    throw new HttpsError("invalid-argument", `${name} invalido`);
  }
  return value;
}

export function assertSameDraftCreation(data: DocumentData, identity: TemplateDraftIdentity): void {
  if (data.userId !== identity.uid) {
    throw new HttpsError("permission-denied", "No tenes permisos sobre este borrador");
  }
  const mode = data.editor === "konva" ? "konva" :
    data.editor === "html" || (!data.editor && data.contenido && !data.objetos && !data.secciones) ? "html" : null;
  if (data.plantillaId !== identity.plantillaId || mode !== identity.mode) {
    throw new HttpsError("already-exists", "El identificador ya pertenece a otro borrador");
  }
  if (resolveDraftStateFromData(data) === DRAFT_STATES.TRASH) {
    throw new HttpsError("failed-precondition", "El borrador esta en papelera");
  }
}

export async function readDraftCreationRetry(
  ref: DocumentReference, identity: TemplateDraftIdentity
): Promise<DocumentData | null> {
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  const data = snapshot.data()!;
  assertSameDraftCreation(data, identity);
  return data;
}

// create() supplies the server-side exists:false precondition. The preliminary
// read is only a cheap retry path; concurrent contenders still meet this guard.
export async function createTemplateDraft(
  ref: DocumentReference, identity: TemplateDraftIdentity, data: DocumentData
): Promise<{ created: boolean; data: DocumentData }> {
  try {
    await ref.create(data);
    return { created: true, data };
  } catch (error) {
    if ((error as { code?: number | string }).code !== 6 &&
        (error as { code?: number | string }).code !== "already-exists") throw error;
    const existing = await readDraftCreationRetry(ref, identity);
    if (!existing) {
      throw new HttpsError("aborted", "El destino cambio durante la creacion; reintenta");
    }
    return { created: false, data: existing };
  }
}
