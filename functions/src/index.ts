import * as functions from "firebase-functions";
import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}


// ✅ Función para servir la invitación en el iframe


export const verInvitacion = functions.https.onRequest(async (req, res) => {
  const rawSlug = req.query.slug;
  const slug = Array.isArray(rawSlug)
    ? rawSlug[0]
    : typeof rawSlug === "string"
    ? decodeURIComponent(rawSlug)
    : "";

  console.log("📩 Slug recibido:", slug);

  if (!slug) {
    console.log("❌ Slug inválido");
    res.status(400).send("Falta el parámetro 'slug'");
    return;
  }

  const bucket = getStorage().bucket("reservaeldia-7a440.firebasestorage.app");
  const filePath = `borradores/${slug}/index.html`;
  const file = bucket.file(filePath);

  console.log("📂 Buscando archivo en:", filePath);

  try {
    const [exists] = await file.exists();
    console.log("📁 ¿Existe el archivo?", exists);

    if (!exists) {
      console.warn("⚠️ El archivo no existe en Storage:", filePath);
      res.status(404).send("Invitación no encontrada");
      return;
    }

    const [contenido] = await file.download();

    res.set("Content-Type", "text/html");
    res.set("Cache-Control", "public, max-age=3600");
    res.removeHeader?.("X-Frame-Options"); // opcional: no todos los entornos lo soportan
    res.send(contenido.toString());
  } catch (error) {
    console.error("❌ Error leyendo el archivo:", error);
    res.status(500).send("Error al mostrar la invitación");
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


    const firestore = admin.firestore();
    await firestore.collection("borradores").doc(slug).set({
      userId: uid,
      slug,
      plantillaId,
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
