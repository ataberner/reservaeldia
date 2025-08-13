import * as functions from "firebase-functions";
import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";
import { JSDOM } from "jsdom";
import { onCall, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFunctions, httpsCallable } from "firebase/functions";
import express, { Request, Response } from "express";
import { generarHTMLDesdeObjetos } from "./utils/generarHTMLDesdeObjetos";
import { generarHTMLDesdeSecciones } from "./utils/generarHTMLDesdeSecciones";
import { Storage } from "@google-cloud/storage";
import puppeteer from "puppeteer";
import { v4 as uuidv4 } from "uuid";
import type { RSVPConfig } from "./utils/generarModalRSVP";




const app = express();
app.get("/i/:slug", async (req, res) => {  // Cambiado a "/i/:slug"
  const slug = req.params.slug;

  if (!slug) {
    res.status(400).send("Falta el slug");
    return;
  }

  const bucket = getStorage().bucket();
  const filePath = `publicadas/${slug}/index.html`;
  const file = bucket.file(filePath);

  try {
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).send("Invitación publicada no encontrada");
      return;
    }

    const [contenido] = await file.download();
    res.set("Content-Type", "text/html");
    res.send(contenido.toString());
  } catch (error) {
    console.error("❌ Error leyendo el archivo publicado:", error);
    res.status(500).send("Error al mostrar la invitación publicada");
  }
});

export const verInvitacionPublicada = functions.https.onRequest(app);


// Inicialización de Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: "reservaeldia-7a440.firebasestorage.app"
  });
}
const db = admin.firestore();


// ✅ Función para ver la invitación en el iframe

export const verInvitacion = functions.https.onRequest(async (req, res) => {
  const slug = req.query.slug as string;
  if (!slug) {
    res.status(400).send("Falta el slug");
return;
  }


  try {
    // 1. Leer contenido de Firestore
    const docRef = db.collection("borradores").doc(slug);
    const snap = await docRef.get();
    if (!snap.exists) {
    res.status(404).send("Invitación no encontrada");
    return;
    }

    const datos = snap.data();
    const contenido = datos?.contenido || {};

    // 2. Descargar el archivo HTML desde Storage
    const bucket = getStorage().bucket();
    const file = bucket.file(`borradores/${slug}/index.html`);
    const [htmlBuffer] = await file.download();
    const html = htmlBuffer.toString("utf-8");

    // 3. Usar JSDOM para editar el HTML
    const dom = new JSDOM(html);
    const { document } = dom.window;

    // 4. Aplicar cada bloque editable (texto + posición)
    Object.entries(contenido).forEach(([id, valores]: any) => {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (!el) return;

      if (valores.texto) el.textContent = valores.texto;

      // ⬇️ Agregar estilos de posición si existen
      if (valores.top || valores.left) {
        el.setAttribute(
          "style",
          `position: absolute; top: ${valores.top}; left: ${valores.left};`
        );
      }
    });

    // 5. Eliminar estilos de edición (opcional)
    const styleTags = document.querySelectorAll("style");
    styleTags.forEach((style) => {
      if (style.textContent?.includes(".editable:hover") || style.textContent?.includes(".editable:focus")) {
        style.remove();
      }
    });

    // 6. Eliminar cabecera que bloquea iframe
    res.set("X-Frame-Options", "");

    // 7. Enviar HTML modificado
    res.set("Content-Type", "text/html");
    res.status(200).send(dom.serialize());
  } catch (err) {
    console.error("Error al servir la invitación:", err);
    res.status(500).send("Error interno del servidor");
  }
});


type CopiarPlantillaData = {
  plantillaId: string;
  slug: string;
    };



// ✅Copia index.html de una plantilla a una nueva carpeta de borrador y guarda el contenido inicial en Firestore.

export const copiarPlantillaHTML = functions.https.onCall(
          async (request: functions.https.CallableRequest<CopiarPlantillaData>) => {
            const { plantillaId, slug } = request.data;
            const uid = request.auth?.uid;

      console.log("🧪 Slug recibido:", slug);



    if (!plantillaId || !slug) {
      throw new functions.https.HttpsError("invalid-argument", "Faltan datos");
    }

    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
    }

    const bucket = getStorage().bucket();
    console.log("Bucket usado:", bucket.name);

    const [archivos] = await bucket.getFiles({ prefix: `plantillas/${plantillaId}/` });

    if (!archivos.length) {
      throw new functions.https.HttpsError("not-found", `No se encontraron archivos en plantillas/${plantillaId}`);
    }

    await Promise.all(
     archivos
    .filter((archivo) => {
      const nombre = archivo.name.split("/").pop();
      return nombre === "index.html"; // Solo copiamos este
    })
    .map(async (archivoOriginal) => {
      const destino = archivoOriginal.name.replace(
        `plantillas/${plantillaId}/`,
        `borradores/${slug}/`
      );
      await archivoOriginal.copy(bucket.file(destino));
      console.log(`✅ Copiado: ${archivoOriginal.name} → ${destino}`);
      console.log("Bucket usado:", bucket.name);
    })
    );

          
      const archivoHtml = archivos.find(f => f.name.endsWith("index.html"));
      if (!archivoHtml) {
        throw new functions.https.HttpsError("not-found", "No se encontró index.html");
}



const [htmlBuffer] = await archivoHtml.download();
const html = htmlBuffer.toString("utf-8");
const dom = new JSDOM(html);
const { document } = dom.window;

// ✅ Extraer contenido inicial de elementos con data-id
const elementos = document.querySelectorAll("[data-id]");
const contenido: Record<string, any> = {};

elementos.forEach((el) => {
  const id = el.getAttribute("data-id");
  const texto = el.textContent?.trim() || "";

  // Extraer posición si está definida inline
  const style = el.getAttribute("style") || "";
  const topMatch = style.match(/top:\s*([^;]+)/);
  const leftMatch = style.match(/left:\s*([^;]+)/);

  const top = topMatch?.[1]?.trim();
  const left = leftMatch?.[1]?.trim();

  contenido[id!] = {
    texto,
    ...(top && { top }),
    ...(left && { left }),
  };
});

    const firestore = admin.firestore();
    await firestore.collection("borradores").doc(slug).set({
          userId: uid,
          slug,
          plantillaId,
          contenido, // ⬅️ El contenido inicial extraído
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });


          return {
        slug,
        url: `https://us-central1-reservaeldia-7a440.cloudfunctions.net/verInvitacion?slug=${slug}`
      };

  }
);




export const borrarBorrador = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ slug: string }>) => {
    const { slug } = request.data;
    const uid = request.auth?.uid;

    if (!slug) {
      throw new functions.https.HttpsError("invalid-argument", "Falta el slug");
    }

    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
    }

    const firestore = admin.firestore();
    const bucket = getStorage().bucket();


    // 🔒 Verificar que el documento le pertenece al usuario
    const docRef = firestore.collection("borradores").doc(slug);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new functions.https.HttpsError("not-found", "El borrador no existe");
    }

    if (docSnap.data()?.userId !== uid) {
      throw new functions.https.HttpsError("permission-denied", "No podés borrar este borrador");
    }

    // 🔥 Borrar documento de Firestore
    await docRef.delete();

    // 🔥 Borrar archivos en Storage
    const [files] = await bucket.getFiles({ prefix: `borradores/${slug}/` });
    const deletePromises = files.map(file => file.delete());
    await Promise.all(deletePromises);

    return { success: true, archivosEliminados: files.length };
  }
);



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



export const publicarInvitacion = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ slug: string }>) => {
    const { slug } = request.data;
    if (!slug) {
      throw new functions.https.HttpsError("invalid-argument", "Falta el slug");
    }

    const firestore = admin.firestore();
    const bucket = getStorage().bucket();

    // 🔍 1. Leer el borrador
    const docSnap = await firestore.collection("borradores").doc(slug).get();
    if (!docSnap.exists) {
      throw new functions.https.HttpsError("not-found", "No se encontró el borrador");
    }

    const data = docSnap.data();
    if (!data) {
  throw new functions.https.HttpsError("internal", "El documento está vacío");
}

    const objetosBase = data?.objetos || [];
    // 🗑️ ELIMINADO: const overrides = data?.overrides || {};
    const secciones = data?.secciones || [];


    // 🧠 2. Resolver URLs de imagen/icono directamente
    const objetosFinales = await resolverURLsDeObjetos(objetosBase);

console.log("🧪 Secciones:", JSON.stringify(secciones));
console.log("🧪 Objetos finales:", JSON.stringify(objetosFinales));

     


    // 🧱 3. Generar el HTML con los objetos editados
let htmlFinal = "";
try {


const rsvp: RSVPConfig = { enabled: true, ...(data?.rsvp ?? {}) }; // ✅ default ON
htmlFinal = generarHTMLDesdeSecciones(secciones, objetosFinales, rsvp);



} catch (error) {
  console.error("❌ Error generando HTML:", error);
  throw new functions.https.HttpsError("internal", "Error al generar el HTML.");
}


    // 📤 4. Guardar en publicadas/<slug>/index.html
    const filePath = `publicadas/${slug}/index.html`;
    await bucket.file(filePath).save(htmlFinal, {
      contentType: "text/html",
      public: true,
      metadata: {
        cacheControl: "public,max-age=3600",
      },
    });

    console.log("🧾 HTML generado (primeros 300 caracteres):", htmlFinal.slice(0, 300));

   // 🧾 5. Registrar en Firestore (mejorado)
const url = `https://reservaeldia.com.ar/i/${slug}`;

// ✅ Validar que el borrador tenga userId
const userId = data.userId as string | undefined;
if (!userId) {
  console.error("Borrador sin userId. Slug:", slug);
  throw new functions.https.HttpsError(
    "failed-precondition",
    "El borrador no tiene userId. No se puede publicar sin propietario."
  );
}

// Campos opcionales que ayudan al dashboard
const nombre = (data.nombre as string) || slug;
const tipo = (data.tipo as string) || (data.plantillaTipo as string) || "desconocido";
// Si tenés portada (thumbnail) del borrador, guardala; si no, dejá null
const portada = (data.thumbnailUrl as string) || null;

// Si llevás conteo de invitados confirmados en el borrador, podés mapearlo aquí.
// Si no, inicializamos en 0 para evitar undefined en el cliente.
const invitadosCount =
  (typeof data.invitadosCount === "number" ? data.invitadosCount : 0);

// 💾 Guardar el doc completo en `publicadas/{slug}`
await firestore.collection("publicadas").doc(slug).set(
  {
    slug,
    userId,
    plantillaId: data.plantillaId || null,
    urlPublica: url,               // ⬅️ importante para el botón "Ver" / "Copiar"
    nombre,                        // ⬅️ mostrable en tarjeta
    tipo,                          // ⬅️ filtro futuro
    portada,                       // ⬅️ imagen de portada si existe
    invitadosCount,                // ⬅️ métrica simple inicial
    publicadaEn: admin.firestore.FieldValue.serverTimestamp(),
  },
  { merge: true }
);

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
  async (request: CallableRequest<{ id: string; datos: any }>) => {
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

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}



