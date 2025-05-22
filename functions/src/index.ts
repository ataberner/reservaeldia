import * as functions from "firebase-functions";
import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";
import { JSDOM } from "jsdom";


if (!admin.apps.length) {
  admin.initializeApp();
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


// ✅ Función para copiar una plantilla al bucket
type CopiarPlantillaData = {
  plantillaId: string;
  slug: string;
};


export const copiarPlantilla = functions.https.onCall(
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

    const bucket = getStorage().bucket("reservaeldia-7a440.firebasestorage.app");
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




export const guardarEdicion = functions.https.onRequest(async (req, res) => {
  const { slug, overrides } = req.body;

  if (!slug || !overrides) {
    res.status(400).send("Faltan datos");
    return;
  }

  try {
    await admin.firestore().collection("borradores").doc(slug).update({
      overrides,
      ultimaEdicion: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).send("Guardado OK");
  } catch (error) {
    console.error("Error al guardar:", error);
    res.status(500).send("Error interno");
  }
});


export const leerEdicion = functions.https.onRequest(async (req, res) => {
  const slug = req.query.slug as string;

  if (!slug) {
    res.status(400).send("Falta slug");
    return;
  }

  try {
    const doc = await admin.firestore().collection("borradores").doc(slug).get();
    if (!doc.exists) {
      res.status(404).send("No encontrado");
      return;
    }

    const data = doc.data();
    res.status(200).json({ overrides: data?.overrides || {} });
  } catch (error) {
    console.error("Error al leer edición:", error);
    res.status(500).send("Error interno");
  }
});




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
    const bucket = getStorage().bucket("reservaeldia-7a440.firebasestorage.app");

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


export const publicarInvitacion = functions.https.onCall(
  async (request: functions.https.CallableRequest<PublicarInvitacionData>) => {
    const { slug } = request.data;

    if (!slug) {
      throw new functions.https.HttpsError("invalid-argument", "Falta el slug");
    }

    const bucket = getStorage().bucket("reservaeldia-7a440.firebasestorage.app");
    const origen = `borradores/${slug}/index.html`;
    const destino = `publicadas/${slug}/index.html`;

    const firestore = admin.firestore();
    const docBorrador = await firestore.collection("borradores").doc(slug).get();
    const dataBorrador = docBorrador.data();

    if (!dataBorrador) {
      throw new functions.https.HttpsError("not-found", `No se encontró el borrador ${slug}`);
    }

    const overrides = dataBorrador.overrides || {};

    // 1️⃣ Leer el archivo HTML original desde Storage
    const [contenidoOriginal] = await bucket.file(origen).download();
    const htmlOriginal = contenidoOriginal.toString();

    // 2️⃣ Aplicar overrides y limpiar edición
    const htmlFinal = aplicarOverrides(htmlOriginal, overrides);

    // 3️⃣ Subir el HTML final a la carpeta publicadas
    await bucket.file(destino).save(htmlFinal, {
      contentType: "text/html",
      gzip: true,
    });

    // 4️⃣ Guardar metadata en Firestore
    await firestore.collection("publicadas").doc(slug).set({
  slug,
  userId: dataBorrador.userId || null,
  plantillaId: dataBorrador.plantillaId || null,
  overrides, // 🟢 se actualiza con los nuevos
  publicadaEn: admin.firestore.FieldValue.serverTimestamp(),
}, { merge: true }); // 🔁 Importante para sobrescribir correctamente


    const url = `https://reservaeldia-7a440.web.app/i/${slug}`;

    return { success: true, url };
  }
);

function limpiarCSSDeEdicion(document: Document) {
  const styles = Array.from(document.querySelectorAll("style"));

  styles.forEach((styleTag) => {
    if (styleTag.textContent?.includes(".editable:hover")) {
      styleTag.textContent = styleTag.textContent
        .replace(/\.editable:hover[\s\S]*?\{[^}]*\}/g, "") // remueve el bloque hover
        .replace(/\.editable:focus[\s\S]*?\{[^}]*\}/g, ""); // remueve el bloque focus
    }
  });
}


// Función utilitaria para aplicar overrides y limpiar el HTML
function aplicarOverrides(htmlOriginal: string, overrides: Record<string, string>): string {
  const dom = new JSDOM(htmlOriginal);
  const document = dom.window.document;

  for (const [key, valor] of Object.entries(overrides)) {
    const el = document.querySelector(`[data-id="${key}"]`);
    if (el) el.textContent = valor;
  }

  document.querySelectorAll("[contenteditable]").forEach((el: Element) => {
    el.removeAttribute("contenteditable");
  });

  document.querySelectorAll(".editable").forEach((el: Element) => {
  el.classList.remove("editable");
});


  limpiarCSSDeEdicion(document); // 🔥 limpia el efecto visual editable

  return dom.serialize();
}




import express, { Request, Response } from "express";
const app = express();

app.get("/i/:slug", async (req: Request, res: Response) => {

  const slug = req.params.slug;

  if (!slug) {
    res.status(400).send("Falta el parámetro 'slug'");
    return;
  }

  const bucket = getStorage().bucket("reservaeldia-7a440.firebasestorage.app");
  const filePath = `publicadas/${slug}/index.html`;
  const file = bucket.file(filePath);

  console.log("📂 Buscando archivo en:", filePath);

  try {
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).send("Invitación publicada no encontrada");
      return;
    }

    const [contenido] = await file.download();

    res.set("Content-Type", "text/html");
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.removeHeader("X-Frame-Options");
    res.send(contenido.toString());
  } catch (error) {
    console.error("❌ Error leyendo el archivo publicado:", error);
    res.status(500).send("Error al mostrar la invitación publicada");
  }
});

export const verInvitacionPublicada = functions.https.onRequest(app);
