import * as functions from "firebase-functions";
import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";
import { JSDOM } from "jsdom";
import { onCall } from "firebase-functions/v2/https";
import { CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFunctions, httpsCallable } from "firebase/functions";
import express, { Request, Response } from "express";



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



// Guarda una edición desde el frontend (lo que cambia el usuario al mover o escribir algo).
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

function aplicarOverrides(html: string, contenido: Record<string, any>) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // ✅ Reemplazar contenido editable
  Object.entries(contenido).forEach(([id, val]) => {
    const el = document.querySelector(`[data-id="${id}"]`) as HTMLElement;
    if (!el) return;
    if (Object.prototype.hasOwnProperty.call(val, 'texto')) {
      el.innerHTML = val.texto;
      }
    if (val.top) el.style.top = val.top;
    if (val.left) el.style.left = val.left;
  });

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


  // 🧹 Limpiar edición visual
  limpiarCSSDeEdicion(document);

  // 🧹 Opcional: remover atributos de edición
  document.querySelectorAll("[contenteditable]").forEach(el => {
    el.removeAttribute("contenteditable");
  });
  document.querySelectorAll(".editable").forEach(el => {
    el.classList.remove("editable");
  });
  document.querySelectorAll(".zona-editable").forEach(el => {
    el.classList.remove("zona-editable");
  });

  return dom.serialize();
}


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
    const overrides = data?.overrides || {};

    // 🧠 2. Aplicar overrides y luego resolver URLs de imagen/icono
const objetosConOverrides = objetosBase.map((obj: any) => {
  const mod = overrides[obj.id] || {};
  return { ...obj, ...mod };
});
const objetosFinales = await resolverURLsDeObjetos(objetosConOverrides);


    // 🧱 3. Generar el HTML con los objetos editados
    const htmlFinal = generarHTMLDesdeObjetos(objetosFinales);

    // 📤 4. Guardar en publicadas/<slug>/index.html
    const filePath = `publicadas/${slug}/index.html`;
    await bucket.file(filePath).save(htmlFinal, {
      contentType: "text/html",
      public: true,
      metadata: {
        cacheControl: "public,max-age=3600",
      },
    });

    // 🧾 5. Registrar en Firestore
    await firestore.collection("publicadas").doc(slug).set(
      {
        slug,
        userId: data.userId || null,
        plantillaId: data.plantillaId || null,
        publicadaEn: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

   const url = `https://reservaeldia.com.ar/i/${slug}`;

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

    await db.collection("plantillas").doc(id).set(datos);
    logger.info(`✅ Plantilla '${id}' creada con éxito`);
    return { success: true };
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

function generarHTMLDesdeObjetos(objetos: any[]): string {
  const elementos: string[] = objetos.map((obj) => {
    const rotacion = obj.rotation ?? 0;
    const scaleX = obj.scaleX ?? 1;
    const scaleY = obj.scaleY ?? 1;

    if (obj.tipo === "texto") {
      return `<div style="
        position: absolute;
        top: ${obj.y}px;
        left: ${obj.x}px;
        font-size: ${obj.fontSize || 12}px;
        color: ${obj.color || "#000"};
        font-family: ${obj.fontFamily || "inherit"};
        transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
        transform-origin: top left;
        white-space: pre;
        overflow: hidden;
        text-overflow: clip;
        max-width: ${obj.width ? obj.width + "px" : "none"};
      ">${escapeHTML(obj.texto)}</div>`;
    }

    if (obj.tipo === "imagen" || obj.tipo === "icono") {
      return `<img src="${obj.src}" style="
        position: absolute;
        top: ${obj.y}px;
        left: ${obj.x}px;
        width: ${obj.width ? obj.width + "px" : "auto"};
        height: ${obj.height ? obj.height + "px" : "auto"};
        transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
        transform-origin: top left;
      " />`;
    }

    if (obj.tipo === "icono-svg" && obj.d) {
      return `<svg viewBox="0 0 100 100" style="
        position: absolute;
        top: ${obj.y}px;
        left: ${obj.x}px;
        width: ${obj.width || 100}px;
        height: ${obj.height || 100}px;
        transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
        transform-origin: top left;
        fill: ${obj.color || "#000"};
      ">
        <path d="${obj.d}" />
      </svg>`;
    }

   if (obj.tipo === "forma") {
  const fill = obj.color || "#000";
  const figura = obj.figura;
  const transformOrigin = "center center";
  const size = 100; // ✅ Declarado afuera

  switch (figura) {
    case "rect": {
      return `<div style="
        position: absolute;
        top: ${obj.y}px;
        left: ${obj.x}px;
        width: ${size}px;
        height: ${size}px;
        background: ${fill};
        transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
        transform-origin: ${transformOrigin};
      "></div>`;
    }

    case "circle": {
  return `<div style="
    position: absolute;
    top: ${obj.y - size / 2}px;
    left: ${obj.x - size / 2}px;
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    background: ${fill};
    transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
    transform-origin: center center;
  "></div>`;
}

    case "line": {
      return `<div style="
        position: absolute;
        top: ${obj.y}px;
        left: ${obj.x}px;
        width: ${size}px;
        height: 4px;
        background: ${fill};
        transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
        transform-origin: ${transformOrigin};
      "></div>`;
    }

   case "triangle": {
  const radius = 60;
  const height = radius * Math.sqrt(3);
  return `<div style="
    position: absolute;
    top: ${obj.y - height / 2 + height / 6}px;
    left: ${obj.x - radius}px;
    width: 0;
    height: 0;
    border-left: ${radius}px solid transparent;
    border-right: ${radius}px solid transparent;
    border-bottom: ${height}px solid ${fill};
    transform: rotate(${rotacion}deg) scale(${scaleX}, ${scaleY});
    transform-origin: center center;
  "></div>`;
}


    default:
      return "";
  }
}


    return ""; // para cualquier tipo desconocido
  });

  // ⬇️ HTML completo
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Invitación</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta property="og:title" content="¡Estás invitado!" />
  <meta property="og:description" content="Mirá esta invitación especial 💌" />
  <meta property="og:image" content="https://reservaeldia.com.ar/img/preview.jpg" />
  <meta property="og:type" content="website" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: white;
      font-family: sans-serif;
      width: 100%;
      height: 100%;
      overflow-y: auto;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    .canvas-wrapper {
      height: 100vh;
      overflow-x: hidden;
      overflow-y: auto;
    }
    .canvas {
      position: relative;
      width: 800px;
      height: 1400px;
      transform-origin: top left;
    }
    .scaler {
      transform-origin: top left;
    }
  </style>
</head>
<body>
  <div class="canvas-wrapper">
    <div class="canvas scaler">
      ${elementos.join("\n")}
    </div>
  </div>
  <script>
    function escalarCanvas() {
      const baseWidth = 800;
      const pantalla = window.innerWidth;
      const escala = pantalla / baseWidth;
      const canvas = document.querySelector(".scaler");
      if (canvas) {
        canvas.style.transform = "scale(" + escala + ")";
      }
    }

    window.addEventListener("load", escalarCanvas);
    window.addEventListener("resize", escalarCanvas);
  </script>
</body>
</html>
`;
}
