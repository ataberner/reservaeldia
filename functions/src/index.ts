import { onRequest, onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";
import { JSDOM } from "jsdom";
import express, { Request, Response } from "express";
import { generarHTMLDesdeSecciones } from "./utils/generarHTMLDesdeSecciones";
import { type RSVPConfig as ModalConfig } from "./utils/generarModalRSVP";
import { requireAdmin, requireSuperAdmin } from "./auth/adminAuth";

import * as logger from "firebase-functions/logger";

// Inicialización de Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: "reservaeldia-7a440.firebasestorage.app",
  });
}

const db = admin.firestore();
const bucket = getStorage().bucket();

const app = express();


app.get("/i/:slug", async (req: Request, res: Response) => {
  const slug = req.params.slug;
  if (!slug) return res.status(400).send("Falta el slug");

  const file = bucket.file(`publicadas/${slug}/index.html`);
  const [exists] = await file.exists();

  if (!exists) return res.status(404).send("Invitación publicada no encontrada");

  const [contenido] = await file.download();
  res.set("Content-Type", "text/html").send(contenido.toString());
});

export const verInvitacionPublicada = onRequest(
  { region: "us-central1" },
  app
);







// ✅ Función para ver la invitación en el iframe

export const verInvitacion = onRequest(
  { region: "us-central1" },
  async (req, res): Promise<void> => {
    const slug = req.query.slug as string;
    if (!slug) {
      res.status(400).send("Falta el slug");
      return;
    }

    try {
      const snap = await db.collection("borradores").doc(slug).get();
      if (!snap.exists) {
        res.status(404).send("Invitación no encontrada");
        return;
      }

      const datos = snap.data();
      const contenido = datos?.contenido || {};

      const file = bucket.file(`borradores/${slug}/index.html`);
      const [htmlBuffer] = await file.download();
      const html = htmlBuffer.toString("utf-8");

      const dom = new JSDOM(html);
      const { document } = dom.window;

      Object.entries(contenido).forEach(([id, valores]: any) => {
        const el = document.querySelector(`[data-id="${id}"]`);
        if (!el) return;
        if (valores.texto) el.textContent = valores.texto;
        if (valores.top || valores.left) {
          el.setAttribute(
            "style",
            `position: absolute; top: ${valores.top}; left: ${valores.left};`
          );
        }
      });

      document.querySelectorAll("style").forEach((style) => {
        if (style.textContent?.includes(".editable")) style.remove();
      });

      res.set("X-Frame-Options", "").set("Content-Type", "text/html");
      res.status(200).send(dom.serialize());
    } catch (error) {
      logger.error("❌ Error al servir invitación:", error);
      res.status(500).send("Error interno del servidor");
    }
  }
);




type CopiarPlantillaData = {
  plantillaId: string;
  slug: string;
};



// ✅Copia index.html de una plantilla a una nueva carpeta de borrador y guarda el contenido inicial en Firestore.

export const copiarPlantillaHTML = onCall(async (request) => {
  const { plantillaId, slug } = request.data;
  const uid = request.auth?.uid;

  if (!plantillaId || !slug)
    throw new HttpsError("invalid-argument", "Faltan datos");
  if (!uid) throw new HttpsError("unauthenticated", "Usuario no autenticado");

  const [archivos] = await bucket.getFiles({ prefix: `plantillas/${plantillaId}/` });
  const archivoHtml = archivos.find((f) => f.name.endsWith("index.html"));
  if (!archivoHtml)
    throw new HttpsError("not-found", "No se encontró index.html");

  const destino = archivoHtml.name.replace(
    `plantillas/${plantillaId}/`,
    `borradores/${slug}/`
  );
  await archivoHtml.copy(bucket.file(destino));

  const [htmlBuffer] = await archivoHtml.download();
  const html = htmlBuffer.toString("utf-8");
  const dom = new JSDOM(html);
  const { document } = dom.window;

  const contenido: Record<string, any> = {};
  document.querySelectorAll("[data-id]").forEach((el) => {
    const id = el.getAttribute("data-id");
    const texto = el.textContent?.trim() || "";
    const style = el.getAttribute("style") || "";
    const top = style.match(/top:\s*([^;]+)/)?.[1]?.trim();
    const left = style.match(/left:\s*([^;]+)/)?.[1]?.trim();

    contenido[id!] = { texto, ...(top && { top }), ...(left && { left }) };
  });

  await db.collection("borradores").doc(slug).set({
    userId: uid,
    slug,
    plantillaId,
    contenido,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    slug,
    url: `https://us-central1-reservaeldia-7a440.cloudfunctions.net/verInvitacion?slug=${slug}`,
  };
});





export const borrarBorrador = onCall(async (request) => {
  const { slug } = request.data;
  const uid = request.auth?.uid;

  if (!slug) throw new HttpsError("invalid-argument", "Falta el slug");
  if (!uid) throw new HttpsError("unauthenticated", "Usuario no autenticado");

  const docRef = db.collection("borradores").doc(slug);
  const snap = await docRef.get();

  if (!snap.exists) throw new HttpsError("not-found", "No existe el borrador");
  if (snap.data()?.userId !== uid)
    throw new HttpsError("permission-denied", "No podés borrar este borrador");

  await docRef.delete();
  const [files] = await bucket.getFiles({ prefix: `borradores/${slug}/` });
  await Promise.all(files.map((f) => f.delete()));

  return { success: true, archivosEliminados: files.length };
});




// 👇 Acá definís el tipo de datos esperados
interface PublicarInvitacionData {
  slug: string;
}

// 🗑️ ELIMINADA: función aplicarOverrides
// Esta función era específica del editor HTML contenteditable


async function resolverURLsDeObjetos(objetos: any[]): Promise<any[]> {
  const bucket = getStorage().bucket();

  const procesados = await Promise.all(
    objetos.map(async (obj) => {
      if (
        (obj.tipo === "imagen" || obj.tipo === "icono") &&
        obj.src &&
        !obj.src.startsWith("http")
      ) {
        try {
          const [url] = await bucket.file(obj.src).getSignedUrl({
            action: "read",
            expires: Date.now() + 1000 * 60 * 60 * 24 * 365, // 1 año
          });
          return { ...obj, src: url };
        } catch (error) {
          console.warn("❌ Error resolviendo URL de", obj.src, error);
          return obj;
        }
      }
      return obj;
    })
  );

  return procesados;
}


export const publicarInvitacion = onCall(
  { region: "us-central1", memory: "512MiB" },
  async (request) => {
    const { slug, slugPublico } = request.data;
    if (!slug) throw new HttpsError("invalid-argument", "Falta el slug del borrador");

    const slugDestino = slugPublico || slug;

    // 🔹 1. Leer el borrador original
    const docSnap = await db.collection("borradores").doc(slug).get();
    if (!docSnap.exists) throw new HttpsError("not-found", "No se encontró el borrador");

    const data = docSnap.data();
    if (!data) throw new HttpsError("not-found", "El documento está vacío");

    // 🔹 2. Resolver datos del borrador
    const objetos = data?.objetos || [];
    const secciones = data?.secciones || [];
    const objetosFinales = await resolverURLsDeObjetos(objetos);

    const rsvp: ModalConfig = {
      enabled: data?.rsvp?.enabled !== false,
      title: data?.rsvp?.title,
      subtitle: data?.rsvp?.subtitle,
      buttonText: data?.rsvp?.buttonText,
      primaryColor: data?.rsvp?.primaryColor,
      sheetUrl: data?.rsvp?.sheetUrl,
    };

    // 🔹 3. Generar HTML
    const htmlFinal = generarHTMLDesdeSecciones(secciones, objetosFinales, rsvp, {
      slug: slugDestino,
    });

    // 🔹 4. Subir HTML a Storage con el slug destino
    const filePath = `publicadas/${slugDestino}/index.html`;
    await bucket.file(filePath).save(htmlFinal, {
      contentType: "text/html",
      public: true,
      metadata: { cacheControl: "public,max-age=3600" },
    });

    // 🔹 5. Guardar metadatos en Firestore
    const url = `https://reservaeldia.com.ar/i/${slugDestino}`;
    await db.collection("publicadas").doc(slugDestino).set(
      {
        slug: slugDestino,
        slugOriginal: slug !== slugDestino ? slug : undefined,
        userId: data.userId,
        plantillaId: data.plantillaId || null,
        urlPublica: url,
        nombre: data.nombre || slugDestino,
        tipo: data.tipo || data.plantillaTipo || "desconocido",
        portada: data.thumbnailUrl || null,
        invitadosCount: data.invitadosCount || 0,
        publicadaEn: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 🔁 6. Guardar también el slugPublico dentro del borrador original
    if (slugPublico && slugPublico !== slug) {
      await db.collection("borradores").doc(slug).set(
        { slugPublico },
        { merge: true }
      );
    }

    return { success: true, url };
  }
);







export const borrarTodosLosBorradores = onCall(
  async (request: CallableRequest<unknown>) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new Error("No estás autenticado.");
    }

    const db = admin.firestore();
    const storage = admin.storage();

    const snapshot = await db.collection("borradores").where("userId", "==", userId).get();

    const deletePromises = snapshot.docs.map(async (doc) => {
      const slug = doc.id;
      await doc.ref.delete();
      await storage.bucket().deleteFiles({ prefix: `borradores/${slug}/` });
    });

    await Promise.all(deletePromises);

    return { success: true };
  }
);


export const copiarPlantilla = onCall(
  async (request: CallableRequest<{ plantillaId: string; slug: string }>): Promise<{ slug: string }> => {
    const { plantillaId, slug } = request.data;
    const uid = request.auth?.uid;

    if (!uid) throw new Error("Usuario no autenticado");
    if (!plantillaId || !slug) throw new Error("Faltan datos requeridos");

    const docPlantilla = await db.collection("plantillas").doc(plantillaId).get();
    const datos = docPlantilla.data();

    if (!datos) throw new Error("Plantilla no encontrada");

    await db.collection("borradores").doc(slug).set({
      slug,
      userId: uid,
      plantillaId,
      editor: datos.editor || "konva",
      objetos: datos.objetos || [],
      secciones: datos.secciones || [],
      portada: datos.portada || null,
      nombre: datos.nombre || "Plantilla sin nombre",
      ultimaEdicion: admin.firestore.FieldValue.serverTimestamp(),
      creado: admin.firestore.FieldValue.serverTimestamp(),
    });


    logger.info(`✅ Borrador creado desde plantilla '${plantillaId}' con slug '${slug}'`);
    return { slug };
  }
);

export const crearPlantilla = onCall(
  {
    region: "us-central1",
    cors: [
      "https://reservaeldia.com.ar",
      "http://localhost:3000"
    ],
  },
  async (request: CallableRequest<{ id: string; datos: any }>) => {
    // 🔒 Seguridad real: solo admins pueden crear plantillas base
    // La UI puede ocultar el botón, pero acá se valida de verdad.
    requireAdmin(request);

    const { id, datos } = request.data;
    if (!id || !datos) throw new Error("Faltan datos");

    const bucket = getStorage().bucket();

    let portada = datos.portada || null;

    // 📸 Si se recibe una imagen en base64, subirla como portada
    if (datos.previewBase64) {
      try {
        const base64 = datos.previewBase64.split(",")[1]; // Elimina encabezado data:image/png;base64,
        const buffer = Buffer.from(base64, "base64");
        const filePath = `plantillas/${id}/preview.png`;
        const file = bucket.file(filePath);

        await file.save(buffer, {
          contentType: "image/png",
          public: true,
          metadata: {
            cacheControl: "public,max-age=31536000",
          },
        });

        portada = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        logger.info(`✅ Portada subida correctamente: ${portada}`);
      } catch (error) {
        logger.error("❌ Error al subir portada:", error);
        throw new Error("Error al subir la imagen de portada");
      }
    }

    // 📝 Guardar plantilla en Firestore
    await db.collection("plantillas").doc(id).set({
      ...datos,
      portada, // 🔥 Ya sea subida ahora o provista por el frontend
    });

    logger.info(`✅ Plantilla '${id}' creada con éxito`);
    return { success: true, portada };
  }
);


/**
 * ================================
 * Admin: borrar plantilla
 * ================================
 *
 * Solo ADMIN (claim) puede borrar una plantilla base.
 * La seguridad real se aplica acá (no solo en la UI).
 */
export const borrarPlantilla = onCall(
  {
    region: "us-central1",
    cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
  },
  async (request: CallableRequest<{ plantillaId: string }>) => {
    // 🔒 Seguridad real: solo admins pueden borrar plantillas base
    requireAdmin(request);

    const { plantillaId } = request.data || ({} as any);

    if (!plantillaId || typeof plantillaId !== "string") {
      throw new HttpsError("invalid-argument", "Falta plantillaId");
    }

    // Borrar doc principal
    await db.collection("plantillas").doc(plantillaId).delete();

    // (Opcional a futuro) limpiar assets en Storage / subdocs relacionados
    // Por ahora: minimalista y seguro.

    logger.info(`🗑️ Plantilla '${plantillaId}' borrada por admin`);
    return { success: true, plantillaId };
  }
);



function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/**
 * ================================
 * Claims: asignar/quitar admin
 * ================================
 *
 * Solo SUPERADMIN (env var) puede ejecutarla.
 * Setea custom claims { admin: true/false } al usuario objetivo.
 */
export const setAdminClaim = onCall(
  {
    region: "us-central1",
    cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
  },
  async (request: CallableRequest<{ uidTarget: string; admin: boolean }>) => {
    // 🔒 Solo superadmin puede asignar claims
    requireSuperAdmin(request);

    const { uidTarget, admin: adminFlag } = request.data || ({} as any);

    if (!uidTarget || typeof uidTarget !== "string") {
      throw new HttpsError("invalid-argument", "Falta uidTarget");
    }
    if (typeof adminFlag !== "boolean") {
      throw new HttpsError("invalid-argument", "Falta admin (boolean)");
    }

    await admin.auth().setCustomUserClaims(uidTarget, { admin: adminFlag });
    return { success: true, uidTarget, admin: adminFlag };
  }
);



