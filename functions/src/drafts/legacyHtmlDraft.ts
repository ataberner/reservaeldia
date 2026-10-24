import { createHash } from "node:crypto";
import type { Bucket } from "@google-cloud/storage";
import { FieldValue, type Firestore, type DocumentData } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { createTemplateDraft, readDraftCreationRetry } from "./templateDraftCreation";

type HtmlCreation = {
  mode: "html";
  htmlSha256: string;
  sourcePath: string;
  sourceGeneration: string;
};

function readCreation(data: DocumentData, plantillaId: string): HtmlCreation {
  const value = data.draftCreation;
  if (!value || value.mode !== "html" || !/^[a-f0-9]{64}$/.test(value.htmlSha256) ||
      typeof value.sourcePath !== "string" || !value.sourcePath.startsWith(`plantillas/${plantillaId}/`) ||
      !value.sourcePath.endsWith("/index.html") || !/^\d+$/.test(value.sourceGeneration)) {
    throw new HttpsError("failed-precondition", "No se puede recuperar el archivo de este borrador");
  }
  return value as HtmlCreation;
}

function matchesArtifact(metadata: Record<string, unknown> | undefined, creation: HtmlCreation, uid: string, slug: string) {
  return metadata?.htmlSha256 === creation.htmlSha256 && metadata?.ownerUid === uid && metadata?.draftSlug === slug;
}

export async function readLegacyDraftHtml(params: {
  bucket: Bucket; slug: string; uid: string; data: DocumentData;
}): Promise<Buffer> {
  const { bucket, slug, uid, data } = params;
  const legacy = data.editor === "html" || (!data.editor && data.contenido && !data.objetos && !data.secciones);
  const unavailable = () => new HttpsError("not-found", "Vista previa no disponible");
  if (!legacy) throw unavailable();
  const file = bucket.file(`borradores/${slug}/index.html`);
  if (!(await file.exists())[0]) throw unavailable();
  const [metadata] = await file.getMetadata();
  // A client-created document must never adopt an orphaned HTML object. This
  // backend-only marker and the object's owner/hash binding are both required.
  // Old unbound artifacts need an explicit reconciliation before previewing.
  let creation: HtmlCreation;
  try { creation = readCreation(data, data.plantillaId); } catch { throw unavailable(); }
  if (!matchesArtifact(metadata.metadata, creation, uid, slug)) throw unavailable();
  const [bytes] = await bucket.file(file.name, { generation: metadata.generation }).download();
  if (createHash("sha256").update(bytes).digest("hex") !== creation.htmlSha256) throw unavailable();
  return bytes;
}

/** Reserve ownership before touching the destination. Firestore and Storage
 * cannot commit together: an interrupted reservation is retained for its owner
 * to resume, and neither retries nor cleanup ever replace/delete other bytes. */
export async function copyLegacyTemplateDraft(params: {
  db: Firestore;
  bucket: Bucket;
  uid: string;
  plantillaId: string;
  slug: string;
  assertTemplateAvailable(): Promise<void>;
}): Promise<void> {
  const { db, bucket, uid, plantillaId, slug } = params;
  const ref = db.collection("borradores").doc(slug);
  const identity = { uid, plantillaId, mode: "html" as const };
  const existing = await readDraftCreationRetry(ref, identity);
  const destination = bucket.file(`borradores/${slug}/index.html`);
  if ((await destination.exists())[0]) {
    // Another request may have completed after the first document read. Resolve
    // its reservation before treating the object as an orphan or a collision.
    const current = existing || await readDraftCreationRetry(ref, identity);
    if (!current) throw new HttpsError("already-exists", "El archivo de destino ya existe");
    // Pre-fix unbound artifacts cannot safely be adopted automatically.
    // Leave their document and bytes intact for explicit reconciliation.
    if (!current.draftCreation) {
      throw new HttpsError("failed-precondition", "Este borrador HTML requiere revision antes de recuperar su vista previa");
    }
    const [metadata] = await destination.getMetadata();
    if (!matchesArtifact(metadata.metadata, readCreation(current, plantillaId), uid, slug)) {
      throw new HttpsError("already-exists", "El archivo de destino no corresponde a esta creacion");
    }
    return;
  }

  await params.assertTemplateAvailable();
  let creation: HtmlCreation;
  let htmlBuffer: Buffer;
  if (existing) {
    creation = readCreation(existing, plantillaId);
    [htmlBuffer] = await bucket.file(creation.sourcePath, { generation: creation.sourceGeneration }).download();
  } else {
    const [files] = await bucket.getFiles({ prefix: `plantillas/${plantillaId}/` });
    const source = files.find(file => file.name.endsWith("/index.html"));
    if (!source) throw new HttpsError("not-found", "No se encontro index.html");
    const [metadata] = await source.getMetadata();
    const generation = String(metadata.generation);
    [htmlBuffer] = await bucket.file(source.name, { generation }).download();
    creation = {
      mode: "html", sourcePath: source.name, sourceGeneration: generation,
      htmlSha256: createHash("sha256").update(htmlBuffer).digest("hex"),
    };
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM(htmlBuffer.toString("utf8"));
    const contenido: Record<string, { texto: string; top?: string; left?: string }> = {};
    dom.window.document.querySelectorAll("[data-id]").forEach(el => {
      const id = el.getAttribute("data-id");
      if (!id) return;
      const style = el.getAttribute("style") || "";
      const top = style.match(/top:\s*([^;]+)/)?.[1]?.trim();
      const left = style.match(/left:\s*([^;]+)/)?.[1]?.trim();
      contenido[id] = { texto: el.textContent?.trim() || "", ...(top && { top }), ...(left && { left }) };
    });
    dom.window.close();
    const result = await createTemplateDraft(ref, identity, {
      userId: uid, slug, plantillaId, editor: "html", contenido,
      estadoBorrador: "borrador_activo", enPapeleraAt: null, eliminacionDefinitivaAt: null,
      createdAt: FieldValue.serverTimestamp(), draftCreation: creation,
    });
    // A concurrent request may have reserved a different source generation.
    const reserved = readCreation(result.data, plantillaId);
    if (reserved.htmlSha256 !== creation.htmlSha256) {
      [htmlBuffer] = await bucket.file(reserved.sourcePath, { generation: reserved.sourceGeneration }).download();
    }
    creation = reserved;
  }
  if (createHash("sha256").update(htmlBuffer).digest("hex") !== creation.htmlSha256) {
    throw new HttpsError("failed-precondition", "La plantilla original cambio; no se reemplazo el borrador");
  }
  // Recheck the current owner before the external effect; create-only Storage
  // remains the atomic guard even when two authorized retries race here.
  if (!await readDraftCreationRetry(ref, identity)) {
    throw new HttpsError("aborted", "El borrador dejo de existir durante la creacion");
  }
  try {
    await destination.save(htmlBuffer, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: "text/html; charset=utf-8", cacheControl: "private,no-store",
        // Do not inherit public ACLs or download tokens from a template.
        metadata: { htmlSha256: creation.htmlSha256, ownerUid: uid, draftSlug: slug },
      },
    });
  } catch (error) {
    if (Number((error as { code?: unknown }).code) !== 412) throw error;
    const [metadata] = await destination.getMetadata();
    if (!matchesArtifact(metadata.metadata, creation, uid, slug)) {
      throw new HttpsError("already-exists", "El archivo de destino ya existe; no se reemplazo");
    }
  }
}
