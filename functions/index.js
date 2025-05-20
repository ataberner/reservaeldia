// functions/index.js
import { getStorage } from "firebase-admin/storage";

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Storage } = require("@google-cloud/storage");
const bucket = getStorage().bucket();

// 1️⃣ Listar todos los archivos de la plantilla original
const [archivos] = await bucket.getFiles({
  prefix: `plantillas/${plantillaId}/` // Ej: plantillas/boda-clasica/
});


if (!archivos.length) {
  throw new functions.https.HttpsError("not-found", `No se encontraron archivos en plantillas/${plantillaId}`);
}

console.log("📁 Archivos encontrados:", archivos.map(a => a.name));

// 2️⃣ Copiar cada archivo a la carpeta del borrador
const promesasDeCopia = archivos.map(async (archivoOriginal) => {
  const rutaDestino = archivoOriginal.name.replace(
    `plantillas/${plantillaId}/`,
    `borradores/${slug}/`
  );

  await archivoOriginal.copy(bucket.file(rutaDestino));
  console.log(`✅ Copiado: ${archivoOriginal.name} → ${rutaDestino}`);
});

await Promise.all(promesasDeCopia);

admin.initializeApp();
const storage = new Storage();

exports.copiarPlantilla = functions.https.onCall(async (data, context) => {
  const { plantillaId, slug } = data;

  if (!plantillaId || !slug) {
    throw new functions.https.HttpsError('invalid-argument', 'Faltan datos');
  }

  const bucket = getStorage().bucket("reservaeldia-7a440.firebasestorage.app");
 
  const prefix = `plantillas/${plantillaId}/`;

  const [files] = await bucket.getFiles({ prefix });

  const copyTasks = files.map(file => {
    const destination = file.name.replace(prefix, `borradores/${slug}/`);
    return file.copy(bucket.file(destination));
  });

  await Promise.all(copyTasks);
  return { success: true, message: "Archivos copiados" };
});
