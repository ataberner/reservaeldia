
// subirIconosConMetadatos.js
import admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const serviceAccount = JSON.parse(readFileSync("firebase-key.json", "utf-8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "reservaeldia-7a440.firebasestorage.app",
});

const db = admin.firestore();
const bucket = getStorage().bucket();

// 🧠 Diccionario extendido de metadatos
const METADATOS_ICONOS = {

  "heart": {
    "keywords": [
      "corazón",
      "amor",
      "romántico",
      "pareja",
      "enamorado",
      "sentimientos",
      "novios",
      "afecto",
      "relación"
    ],
    "categorias": [
      "boda",
      "romance",
      "sentimientos",
      "invitaciones"
    ],
    "popular": true
  },
  "cake": {
    "keywords": [
      "torta",
      "pastel",
      "cumpleaños",
      "fiesta",
      "celebración",
      "postre",
      "evento",
      "mesa dulce"
    ],
    "categorias": [
      "cumpleaños",
      "boda",
      "baby shower",
      "aniversario"
    ],
    "popular": true
  },
  "ring": {
    "keywords": [
      "anillo",
      "compromiso",
      "casamiento",
      "boda",
      "promesa",
      "alianza",
      "noviazgo",
      "matrimonio",
      "joyería"
    ],
    "categorias": [
      "boda",
      "romance",
      "propuesta"
    ],
    "popular": true
  },
  "calendar": {
    "keywords": [
      "calendario",
      "fecha",
      "agenda",
      "día",
      "planificación",
      "evento",
      "programa",
      "organización"
    ],
    "categorias": [
      "organización",
      "eventos",
      "planificación"
    ],
    "popular": false
  },
  "camera": {
    "keywords": [
      "foto",
      "fotografía",
      "cámara",
      "recuerdo",
      "captura",
      "memoria",
      "imagen",
      "selfie",
      "momentos"
    ],
    "categorias": [
      "recuerdos",
      "fiesta",
      "boda",
      "cumpleaños"
    ],
    "popular": true
  },
  "star": {
    "keywords": [
      "estrella",
      "brillo",
      "magia",
      "noche",
      "destacado",
      "especial",
      "cielo",
      "luz",
      "destello"
    ],
    "categorias": [
      "decoración",
      "estilo",
      "temáticas",
      "luces"
    ],
    "popular": false
  },
  "flower": {
    "keywords": [
      "flor",
      "flores",
      "decoración",
      "ramo",
      "naturaleza",
      "ornamento",
      "romántico",
      "verde",
      "arreglo"
    ],
    "categorias": [
      "boda",
      "decoración",
      "naturaleza"
    ],
    "popular": true
  },
  "music": {
    "keywords": [
      "música",
      "nota",
      "canción",
      "sonido",
      "banda",
      "playlist",
      "baile",
      "DJ",
      "melodía"
    ],
    "categorias": [
      "fiesta",
      "entretenimiento",
      "evento"
    ],
    "popular": false
  },
  "gift": {
    "keywords": [
      "regalo",
      "obsequio",
      "presente",
      "sorpresa",
      "detalle",
      "paquete",
      "envuelto",
      "agradecimiento"
    ],
    "categorias": [
      "boda",
      "cumpleaños",
      "souvenir",
      "baby shower"
    ],
    "popular": true
  },
  "champagne": {
    "keywords": [
      "champán",
      "brindis",
      "celebración",
      "bebida",
      "copas",
      "vino",
      "toast",
      "evento",
      "fiesta"
    ],
    "categorias": [
      "boda",
      "aniversario",
      "evento",
      "brindis"
    ],
    "popular": false
  },
  "balloon": {
    "keywords": [
      "globo",
      "decoración",
      "cumpleaños",
      "infantil",
      "alegría",
      "colores",
      "globos",
      "fiesta"
    ],
    "categorias": [
      "cumpleaños",
      "baby shower",
      "decoración",
      "eventos"
    ],
    "popular": false
  },
  "cakeSlice": {
    "keywords": [
      "rebanada",
      "tarta",
      "postre",
      "dulce",
      "servicio",
      "comida",
      "porción"
    ],
    "categorias": [
      "cumpleaños",
      "evento",
      "comida"
    ],
    "popular": false
  },
  "church": {
    "keywords": [
      "iglesia",
      "religioso",
      "ceremonia",
      "sacramento",
      "casamiento",
      "templo",
      "fe",
      "misa"
    ],
    "categorias": [
      "boda",
      "bautismo",
      "religioso"
    ],
    "popular": false
  }
};




const generarMetadatos = (nombre) => {
  const base = nombre.toLowerCase().replace(/[-_]/g, " ");
  const palabras = base.split(" ");
  const coincidencias = Object.entries(METADATOS_ICONOS).filter(([key]) =>
    palabras.some((p) => p.includes(key) || key.includes(p))
  );

  const keywords = new Set();
  const categorias = new Set();

  for (const [_, meta] of coincidencias) {
    meta.keywords.forEach(k => keywords.add(k));
    meta.categorias.forEach(c => categorias.add(c));
  }

  return {
    keywords: Array.from(keywords),
    categorias: Array.from(categorias),
  };
};

const subirIconos = async () => {
  const carpeta = "./iconos/phosphor/bold";
  const archivos = readdirSync(carpeta).filter(file => file.endsWith(".svg"));
console.log("🔍 SVGs encontrados:", archivos.length);

  for (const archivo of archivos) {
    const filePath = path.join(carpeta, archivo);
    const nombre = path.parse(archivo).name;
    const id = uuidv4();
    const destino = `iconos/${archivo}`;

     console.log(`⏳ Subiendo ${archivo}...`);
    // Subida al storage
    await bucket.upload(filePath, {
      destination: destino,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: id,
        },
      },
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destino)}?alt=media&token=${id}`;
    const { keywords, categorias } = generarMetadatos(nombre);

    // Guardar en Firestore
    await db.collection("iconos").add({
      nombre,
      url,
      keywords,
      categorias,
      creadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Subido ${nombre}`);
  }
};

subirIconos().catch(console.error);
