import { createHash, randomUUID } from "node:crypto";
import type { Bucket } from "@google-cloud/storage";
import { HttpsError } from "firebase-functions/v2/https";
import { createRenderAssetAuthorizer } from "../render/renderAssetAuthorization";
import { parseRenderAssetReference } from "../render/renderAssetReference";
import { localBackendEnvironment } from "../firebaseAdmin";

type AssetCopy = { path: string; url: string; generation: string; token: string };
type Context = { actorUid: string; ownerUid: string; slug: string; persistedDraft?: Record<string, unknown> };
const VISUAL_ROOTS = new Set(["objetos", "secciones", "gifts", "portada"]);
const ASSET_KEYS = new Set([
  "src", "url", "mediaUrl", "fondoImagen", "frameSvgUrl", "imageUrl", "giftListUrl", "portada",
  "storagePath", "fondoImagenStoragePath", "frameSvgStoragePath", "originalSrc",
]);

/** Only the server's revision-checked visual content can establish antecedents.
 * Keep the exact value and asset role, including when objects/cells are reordered. */
function persistedVisualReferences(draft: Record<string, unknown> = {}): Map<string, Set<string>> {
  const references = new Map<string, Set<string>>();
  function visit(node: unknown, key = ""): void {
    if (typeof node === "string" && ASSET_KEYS.has(key)) {
      if (!references.has(key)) references.set(key, new Set());
      references.get(key)!.add(node);
    } else if (Array.isArray(node)) node.forEach(child => visit(child));
    else if (node && typeof node === "object") {
      for (const [childKey, child] of Object.entries(node)) visit(child, childKey);
    }
  }
  for (const key of VISUAL_ROOTS) visit(draft[key], key);
  return references;
}

/** The existing uploader authenticates as the actor. Persist independent owner
 * copies, never a private reference whose later publication needs the actor. */
export async function normalizeAdministrativeDraftAssets(
  value: Record<string, unknown>, context: Context, bucket: Bucket
): Promise<Record<string, unknown>> {
  const { actorUid, ownerUid, slug } = context;
  const owner = createRenderAssetAuthorizer({ kind: "draft", ownerUid, draftId: slug }, bucket.name);
  const copies = new Map<string, Promise<AssetCopy>>();
  const persistedReferences = persistedVisualReferences(context.persistedDraft);

  async function copy(path: string): Promise<AssetCopy> {
    if (copies.has(path)) return copies.get(path)!;
    const pending = (async () => {
      const source = bucket.file(path);
      const [metadata] = await source.getMetadata();
      const generation = String(metadata.generation || "");
      if (!/^\d+$/.test(generation) || !String(metadata.contentType || "").startsWith("image/")) {
        throw new HttpsError("failed-precondition", "La imagen seleccionada no esta disponible.");
      }
      const fingerprint = createHash("sha256").update(`${path}:${generation}:${slug}`).digest("hex");
      const extension = path.match(/\.[a-z0-9]{1,6}$/i)?.[0] || "";
      const isDraftThumbnail = path.startsWith("thumbnails_borradores/");
      const destinationPath = isDraftThumbnail
        ? `thumbnails_borradores/${ownerUid}/${slug}-admin${extension}`
        : `usuarios/${ownerUid}/imagenes/admin-${fingerprint}${extension}`;
      const destination = bucket.file(destinationPath);
      let destinationGeneration: string | number = 0;
      let priorFingerprint: unknown = null;
      let token: string = randomUUID();
      if (isDraftThumbnail) {
        try {
          const [prior] = await destination.getMetadata();
          destinationGeneration = String(prior.generation);
          priorFingerprint = prior.metadata?.adminSourceHash;
          token = String(prior.metadata?.firebaseStorageDownloadTokens || "").split(",")[0] || token;
        } catch (error) {
          if (Number((error as { code?: unknown }).code) !== 404) throw error;
        }
      }
      try {
        if (priorFingerprint !== fingerprint) await bucket.file(path, { generation }).copy(destination, {
          preconditionOpts: { ifGenerationMatch: destinationGeneration },
          contentType: metadata.contentType,
          cacheControl: "private,max-age=3600",
          metadata: {
            firebaseStorageDownloadTokens: token, adminSourceHash: fingerprint,
            ...(metadata.metadata?.sourceWidth ? { sourceWidth: metadata.metadata.sourceWidth } : {}),
            ...(metadata.metadata?.sourceHeight ? { sourceHeight: metadata.metadata.sourceHeight } : {}),
          },
        });
      } catch (error) {
        if (Number((error as { code?: unknown }).code) !== 412) throw error;
      }
      const [saved] = await destination.getMetadata();
      const savedToken = String(saved.metadata?.firebaseStorageDownloadTokens || "").split(",")[0];
      if (saved.metadata?.adminSourceHash !== fingerprint || !savedToken || !saved.generation) {
        throw new HttpsError("aborted", "La imagen cambio durante la copia. Volve a intentar guardar.");
      }
      const storageOrigin = localBackendEnvironment()
        ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}` : "https://firebasestorage.googleapis.com";
      return { path: destinationPath, generation: String(saved.generation), token: savedToken,
        url: `${storageOrigin}/v0/b/${bucket.name}/o/${encodeURIComponent(destinationPath)}?alt=media&token=${encodeURIComponent(savedToken)}` };
    })();
    copies.set(path, pending);
    return pending;
  }

  async function asset(raw: string, key = "", visual = false): Promise<AssetCopy | null> {
    // Ordinary texts, IDs and dates are not Storage references.
    let candidate = raw.trim();
    try { for (let pass = 0; pass < 4 && /%[0-9a-f]{2}/i.test(candidate); pass++) candidate = decodeURIComponent(candidate); }
    catch { /* The strict parser below rejects malformed Storage references. */ }
    if (!/^(?:(?:https?:)?\/\/|gs:\/\/|\/?(?:usuarios|thumbnails_borradores|user_uploads|borradores|plantillas|iconos|decoraciones|assets)\/)/i.test(candidate)) return null;
    const parsed = parseRenderAssetReference(raw, bucket.name);
    if (parsed.kind !== "storage") return null;
    const segments = parsed.path.split("/");
    // A removed/archived template must not prevent saving its already embedded
    // references. This retains strings only: no Storage access or render grant.
    // New values, other namespaces and nonvisual fields retain strict validation.
    if (visual && segments[0] === "plantillas" && segments[2] === "assets" && segments.length >= 4 &&
        persistedReferences.get(key)?.has(raw)) return null;
    const actorImage = segments[0] === "usuarios" && segments[1] === actorUid &&
      ["imagenes", "thumbnails"].includes(segments[2]) && segments.length >= 4;
    const actorThumbnail = segments[0] === "thumbnails_borradores" && segments[1] === actorUid &&
      segments.length === 3 && (segments[2] === `${slug}.webp` || segments[2] === `${slug}.png`);
    if (actorUid !== ownerUid && (actorImage || actorThumbnail)) return copy(parsed.path);
    await owner.authorize(raw);
    return null;
  }

  async function visit(node: unknown, key = "", visual = false): Promise<unknown> {
    if (typeof node === "string") {
      const copied = await asset(node, key, visual);
      return copied ? (key === "storagePath" ? copied.path : copied.url) : node;
    }
    if (Array.isArray(node)) return Promise.all(node.map(child => visit(child, "", visual)));
    if (!node || typeof node !== "object") return node;
    const record = node as Record<string, unknown>;
    const out = Object.fromEntries(await Promise.all(Object.entries(record).map(async ([childKey, child]) =>
      [childKey, await visit(child, childKey, visual || (node === value && VISUAL_ROOTS.has(childKey)))])));
    // Storage descriptors must bind their generation/token to the copied bytes.
    if (typeof record.storagePath === "string") {
      const copied = await asset(record.storagePath, "storagePath", visual);
      if (copied) {
        out.storagePath = copied.path;
        out.storageGeneration = copied.generation;
        out.storageDownloadToken = copied.token;
      }
    }
    return out;
  }
  try {
    return await visit(value) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    // Storage SDK failures can contain private paths or URLs; expose no payload.
    throw new HttpsError("unavailable", "No se pudo preparar una de las imagenes del borrador. Volve a intentar guardar.");
  }
}
