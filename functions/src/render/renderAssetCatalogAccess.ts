import { getFirestore } from "firebase-admin/firestore";
import { ensureAdminApp } from "../firebaseAdmin";
import type { RenderAssetAccessContext } from "./renderAssetAuthorization";
import { hasRenderReferenceControlCharacter, parseRenderAssetReference } from "./renderAssetReference";

type DocumentData = Record<string, unknown>;
export type SharedRenderAssetDocument = { id: string; data: DocumentData };

/** Read-only adapter. Query fields/collections are selected by this policy, not by a client. */
export interface SharedRenderAssetRepository {
  getDocument(path: string): Promise<SharedRenderAssetDocument | null>;
  findDocuments(
    collection: string,
    field: string,
    value: string,
    match: "equal" | "prefix"
  ): Promise<SharedRenderAssetDocument[]>;
}

const LOOKUP_LIMIT = 20;

const firestoreRepository: SharedRenderAssetRepository = {
  async getDocument(path) {
    const snapshot = await getFirestore(ensureAdminApp()).doc(path).get();
    return snapshot.exists ? { id: snapshot.id, data: snapshot.data() || {} } : null;
  },
  async findDocuments(collection, field, value, match) {
    const ref = getFirestore(ensureAdminApp()).collection(collection);
    const query = match === "prefix"
      ? ref.where(field, ">=", value).where(field, "<", `${value}\uf8ff`)
      : ref.where(field, "==", value);
    const snapshot = await query.limit(LOOKUP_LIMIT).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  },
};

function asObject(value: unknown): DocumentData {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as DocumentData : {};
}

function validSegment(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim() &&
    !/[\\/%?#]/.test(value) && !hasRenderReferenceControlCharacter(value) && value !== "." && value !== "..";
}

function validContext(context: RenderAssetAccessContext): boolean {
  return Boolean(context && (
    (context.kind === "draft" && validSegment(context.ownerUid) && validSegment(context.draftId)) ||
    (context.kind === "template" && validSegment(context.actorUid) && validSegment(context.templateId))
  ));
}

function pathFromReference(value: unknown, bucketName: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const reference = parseRenderAssetReference(value, bucketName);
    return reference.kind === "storage" ? reference.path : null;
  } catch { return null; }
}

function hasValue(value: unknown): boolean {
  return value !== null && typeof value !== "undefined" && value !== "";
}

// Match the same authoritative field precedence as catalog repositories. A bad
// explicit path/URL must not fall through to a more permissive legacy filename.
function catalogOriginalPath(data: DocumentData, bucketName: string, prefix: string): string | null {
  if (hasValue(data.storagePath)) return pathFromReference(data.storagePath, bucketName);
  if (hasValue(data.url)) return pathFromReference(data.url, bucketName);
  if (typeof data.nombre !== "string" || !data.nombre.trim()) return null;
  const name = data.nombre.trim();
  return pathFromReference(name.startsWith(prefix.split("/")[0] + "/") ? name : prefix + name, bucketName);
}

function assetRefPath(data: DocumentData, pathField: string, urlField: string, bucketName: string): string | null {
  return hasValue(data[pathField])
    ? pathFromReference(data[pathField], bucketName)
    : pathFromReference(data[urlField], bucketName);
}

function equivalentBucketNames(bucketName: string): string[] {
  const names = [bucketName];
  if (bucketName.endsWith(".appspot.com")) names.push(bucketName.replace(/\.appspot\.com$/, ".firebasestorage.app"));
  if (bucketName.endsWith(".firebasestorage.app")) names.push(bucketName.replace(/\.firebasestorage\.app$/, ".appspot.com"));
  return names;
}

function urlPrefixes(path: string, bucketName: string): string[] {
  // These are lookup hints only. Every result is parsed again and must resolve
  // to this exact path and bucket; tokens and signed query strings grant nothing.
  return equivalentBucketNames(bucketName).flatMap((bucket) => [
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}`,
    `https://storage.googleapis.com/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`,
    `gs://${bucket}/${path}`,
  ]);
}

async function findExactReference(
  repository: SharedRenderAssetRepository,
  collection: string,
  pathField: string,
  urlField: string,
  path: string,
  bucketName: string,
  accepts: (document: SharedRenderAssetDocument) => boolean,
  legacyNames: string[] = []
): Promise<boolean> {
  const pathHints = [path, `/${path}`, ...equivalentBucketNames(bucketName).map((bucket) => `gs://${bucket}/${path}`)];
  for (const hint of pathHints) {
    const direct = await repository.findDocuments(collection, pathField, hint, "equal");
    if (direct.some(accepts)) return true;
  }
  for (const name of legacyNames) {
    const documents = await repository.findDocuments(collection, "nombre", name, "equal");
    if (documents.some(accepts)) return true;
  }
  for (const prefix of urlPrefixes(path, bucketName)) {
    const documents = await repository.findDocuments(collection, urlField, prefix, "prefix");
    if (documents.some(accepts)) return true;
  }
  return false;
}

function templateAllowsSharedAssets(data: DocumentData, templateId: string, context: RenderAssetAccessContext): boolean {
  const state = typeof data.estado === "string" ? data.estado.trim().toLowerCase() : "";
  if (state === "archived" || asObject(data.trash).active === true) return false;
  // Match the published/legacy distinction in Rules. The general template
  // normalizer defaults unknown editorial values to published; permissions do not.
  const editorial = data.estadoEditorial;
  const legacy = !Object.prototype.hasOwnProperty.call(data, "estadoEditorial");
  if (!legacy && !["publicada", "en_proceso", "en_revision"].includes(editorial as string)) return false;
  if (context.kind === "template" && context.templateId === templateId) return true;
  return legacy || editorial === "publicada";
}

/** No Storage reads, signed URLs, writes, or process-global permission cache. */
export function createSharedRenderAssetAccessReader(repository: SharedRenderAssetRepository) {
  return async function readSharedAccess(path: string, bucketName: string, context: RenderAssetAccessContext): Promise<boolean> {
    if (!validContext(context) || !bucketName || typeof path !== "string") return false;
    // The public entry point receives a canonical path from the authorizer.
    // Keep this adapter safe when called independently as well.
    if (pathFromReference(path, bucketName) !== path) return false;
    const segments = path.split("/");

    if (segments[0] === "plantillas" && segments[2] === "assets" && segments.length >= 4) {
      const templateId = segments[1];
      const document = await repository.getDocument(`plantillas/${templateId}`);
      // cloneTemplateAssetToSharedPath explicitly creates shared assets here.
      // On-demand clones are stored in a draft without updating the template,
      // so membership in template.objetos would incorrectly reject those clones.
      return Boolean(document && templateAllowsSharedAssets(document.data, templateId, context));
    }

    if (segments[0] === "iconos" && segments.length >= 2) {
      return findExactReference(repository, "iconos", "storagePath", "url", path, bucketName,
        ({ data }) => data.status === "active" && catalogOriginalPath(data, bucketName, "iconos/") === path,
        [path, segments.slice(1).join("/")]);
    }

    if (segments[0] === "decoraciones" && segments[1] === "originals" && segments.length >= 3) {
      return findExactReference(repository, "decoraciones", "storagePath", "url", path, bucketName,
        ({ data }) => data.status === "active" && catalogOriginalPath(data, bucketName, "decoraciones/originals/") === path,
        [path, segments.slice(2).join("/")]);
    }

    if (segments[0] === "decoraciones" && segments[1] === "thumbnails" && segments.length >= 4) {
      const accepts = ({ data }: SharedRenderAssetDocument) => data.status === "active" &&
        ["card", "thumb"].some((variant) => assetRefPath(asObject(asObject(data.thumbnails)[variant]), "storagePath", "url", bucketName) === path);
      const direct = await repository.getDocument(`decoraciones/${segments[2]}`);
      if (direct && accepts(direct)) return true;
      for (const variant of ["card", "thumb"]) {
        if (await findExactReference(repository, "decoraciones", `thumbnails.${variant}.storagePath`,
          `thumbnails.${variant}.url`, path, bucketName, accepts)) return true;
      }
      return false;
    }

    if (segments[0] === "assets" && segments[1] === "countdown" &&
        ["frames", "thumbnails"].includes(segments[2]) && segments.length >= 5 &&
        !segments.includes("draft") && !segments.includes("staging")) {
      const presetId = segments[3];
      const pathField = segments[2] === "frames" ? "storagePath" : "thumbnailPath";
      const urlField = segments[2] === "frames" ? "downloadUrl" : "thumbnailUrl";
      // Only immutable protected version documents confer access. Do not consult
      // root.estado/activeVersion: archived historical versions remain usable.
      return findExactReference(repository, `countdownPresets/${presetId}/versions`, `svgRef.${pathField}`,
        `svgRef.${urlField}`, path, bucketName, ({ id, data }) =>
          /^[1-9]\d*$/.test(id) && data.id === presetId && data.version === Number(id) &&
          assetRefPath(asObject(data.svgRef), pathField, urlField, bucketName) === path);
    }

    return false;
  };
}

const readSharedAccess = createSharedRenderAssetAccessReader(firestoreRepository);

export async function hasSharedRenderAssetAccess(
  path: string,
  bucketName: string,
  context: RenderAssetAccessContext
): Promise<boolean> {
  return readSharedAccess(path, bucketName, context);
}
