const puppeteer = require("puppeteer");
const admin = require("firebase-admin");
const { Storage } = require("@google-cloud/storage");
const path = require("path");
const { v4: uuidv4 } = require("uuid");


admin.initializeApp();
const storage = new Storage();

async function generarPreview({ tipo, id }) {
const url = `https://us-central1-reservaeldia-7a440.cloudfunctions.net/verInvitacion?slug=${id}`;

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 1000 });
  await page.goto(url, { waitUntil: "networkidle0" });

  const buffer = await page.screenshot({ type: "png" });
  await browser.close();

  const filename = `${tipo}/${id}/preview.png`;
  const bucketName = "reservaeldia-7a440.firebasestorage.app";
  const file = storage.bucket(bucketName).file(filename);


  const token = uuidv4();

await file.save(buffer, {
  metadata: {
    contentType: "image/png",
    metadata: {
      firebaseStorageDownloadTokens: token, // 👈 esto genera el acceso público
    },
  },
});

  
  console.log(`✅ Subido: ${filename}`);
}
 


const tipo = process.argv[2]; // "plantillas" o "borradores"
const id = process.argv[3];   // id de la plantilla o borrador

if (!tipo || !id) {
  console.error("❌ Usá: node generarPreview.js plantillas boda-clasica");
  process.exit(1);
}

generarPreview({ tipo, id });
