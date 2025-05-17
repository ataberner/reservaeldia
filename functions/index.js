// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Storage } = require("@google-cloud/storage");

admin.initializeApp();
const storage = new Storage();

exports.copiarPlantilla = functions.https.onCall(async (data, context) => {
  const { plantillaId, slug } = data;

  if (!plantillaId || !slug) {
    throw new functions.https.HttpsError('invalid-argument', 'Faltan datos');
  }

  const bucket = storage.bucket(); // Usa el bucket por defecto del proyecto
  const prefix = `plantillas/${plantillaId}/`;

  const [files] = await bucket.getFiles({ prefix });

  const copyTasks = files.map(file => {
    const destination = file.name.replace(prefix, `borradores/${slug}/`);
    return file.copy(bucket.file(destination));
  });

  await Promise.all(copyTasks);
  return { success: true, message: "Archivos copiados" };
});
