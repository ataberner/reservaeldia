
#!/usr/bin/env node
const path = require("path");
const { pathToFileURL } = require("url");
const { randomUUID } = require("crypto");
const admin = require("firebase-admin");
const puppeteer = require("puppeteer");

const SCHEMA_VERSION = 2;
const RENDER_CONTRACT_VERSION = 2;
const DEFAULT_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "reservaeldia-7a440.firebasestorage.app";

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    overwrite: argv.includes("--overwrite"),
  };
}

function sanitizeId(value) {
  const id = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return id || `legacy-${Date.now().toString(36)}`;
}

function validHexOrFallback(value, fallback) {
  const color = String(value || "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : fallback;
}

function buildLegacyConfig(preset) {
  const props = preset?.props || {};
  return {
    layout: {
      type: "singleFrame",
      distribution: "centered",
      visibleUnits: ["days", "hours", "minutes", "seconds"],
      gap: Number.isFinite(props.gap) ? Number(props.gap) : 8,
      framePadding: 10,
    },
    tipografia: {
      fontFamily: String(props.fontFamily || "Poppins"),
      numberSize: Number.isFinite(props.fontSize) ? Number(props.fontSize) : 28,
      labelSize: Number.isFinite(props.labelSize) ? Number(props.labelSize) : 12,
      letterSpacing: Number.isFinite(props.letterSpacing) ? Number(props.letterSpacing) : 0,
      lineHeight: Number.isFinite(props.lineHeight) ? Number(props.lineHeight) : 1.05,
      labelTransform: "uppercase",
    },
    colores: {
      numberColor: validHexOrFallback(props.color, "#111111"),
      labelColor: validHexOrFallback(props.labelColor, "#6b7280"),
      frameColor: validHexOrFallback(props.boxBorder, "#773dbe"),
    },
    animaciones: {
      entry: "none",
      tick: "none",
      frame: "none",
    },
    tamanoBase: 320,
  };
}

function buildThumbnailHtml(preset) {
  const props = preset?.props || {};
  const fontFamily = String(props.fontFamily || "Poppins").replace(/"/g, "'");
  const numberColor = String(props.color || "#111111");
  const labelColor = String(props.labelColor || "#6b7280");
  const chipBg = String(props.boxBg || "transparent");
  const chipBorder = String(props.boxBorder || "transparent");
  const chipRadius = Number.isFinite(props.boxRadius) ? Number(props.boxRadius) : 12;
  const numberSize = Number.isFinite(props.fontSize) ? Number(props.fontSize) : 28;
  const showLabels = props.showLabels !== false;

  const labels = ["DIAS", "HORAS", "MIN", "SEG"];
  const unitsHtml = labels
    .map((label) => `
      <div class="unit">
        <div class="value">00</div>
        ${showLabels ? `<div class="label">${label}</div>` : ""}
      </div>
    `)
    .join("");

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 360px;
      height: 360px;
      display: grid;
      place-items: center;
      background: linear-gradient(180deg, #ffffff, #f8fafc);
      font-family: ${fontFamily}, sans-serif;
    }
    #thumb {
      width: 320px;
      height: 320px;
      border-radius: 22px;
      border: 1px solid rgba(15, 23, 42, 0.08);
      background: #ffffff;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      padding: 18px;
      align-content: center;
    }
    .unit {
      min-height: 92px;
      border-radius: ${chipRadius}px;
      border: 1px solid ${chipBorder};
      background: ${chipBg};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      overflow: hidden;
    }
    .value {
      color: ${numberColor};
      font-size: ${numberSize}px;
      font-weight: 700;
      line-height: 1;
    }
    .label {
      color: ${labelColor};
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.3px;
      line-height: 1;
    }
  </style>
</head>
<body>
  <div id="thumb">${unitsHtml}</div>
</body>
</html>
  `.trim();
}

async function renderThumbnailPng(browser, preset) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 360, height: 360, deviceScaleFactor: 2 });
    await page.setContent(buildThumbnailHtml(preset), { waitUntil: "domcontentloaded" });
    const target = await page.$("#thumb");
    if (!target) {
      throw new Error("No se pudo renderizar #thumb");
    }
    const buffer = await target.screenshot({ type: "png" });
    return buffer;
  } finally {
    await page.close();
  }
}

async function uploadThumbnail(bucket, presetId, buffer) {
  const pathName = `assets/countdown/thumbnails/${presetId}/v1/thumbnail.png`;
  const token = randomUUID();
  const file = bucket.file(pathName);
  await file.save(buffer, {
    contentType: "image/png",
    metadata: {
      cacheControl: "public,max-age=31536000,immutable",
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const thumbnailUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(pathName)}?alt=media&token=${token}`;
  return { pathName, thumbnailUrl, bytes: buffer.byteLength };
}
async function run() {
  const { dryRun, overwrite } = parseArgs(process.argv.slice(2));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: DEFAULT_BUCKET,
    });
  }

  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  const presetsModulePath = pathToFileURL(path.resolve(__dirname, "../src/config/countdownPresets.js")).href;
  const presetsModule = await import(presetsModulePath);
  const presets = Array.isArray(presetsModule.COUNTDOWN_PRESETS)
    ? presetsModule.COUNTDOWN_PRESETS
    : [];

  if (!presets.length) {
    console.log("No se encontraron presets legacy para migrar.");
    return;
  }

  console.log(`Iniciando migracion de ${presets.length} presets legacy...`);
  console.log(`Modo: dryRun=${dryRun} overwrite=${overwrite}`);

  const browser = await puppeteer.launch({ headless: "new" });
  let migrated = 0;
  let skipped = 0;

  try {
    for (const preset of presets) {
      const presetId = sanitizeId(preset?.id || preset?.nombre || `legacy-${Date.now()}`);
      const nombre = String(preset?.nombre || presetId);
      const ref = db.collection("countdownPresets").doc(presetId);
      const current = await ref.get();

      if (current.exists && !overwrite) {
        skipped += 1;
        console.log(`- Skip ${presetId} (ya existe)`);
        continue;
      }

      const config = buildLegacyConfig(preset);
      const thumbnailBuffer = await renderThumbnailPng(browser, preset);

      let thumbnailPath = null;
      let thumbnailUrl = null;
      let frameBytes = 0;

      if (!dryRun) {
        const uploaded = await uploadThumbnail(bucket, presetId, thumbnailBuffer);
        thumbnailPath = uploaded.pathName;
        thumbnailUrl = uploaded.thumbnailUrl;
        frameBytes = uploaded.bytes;
      }

      const timestamp = admin.firestore.Timestamp.now();

      const baseDoc = {
        id: presetId,
        nombre,
        categoria: {
          event: "general",
          style: "minimal",
          custom: null,
          label: "General / Minimal",
        },
        estado: "published",
        activeVersion: 1,
        draftVersion: null,
        svgRef: {
          storagePath: null,
          downloadUrl: null,
          thumbnailPath,
          thumbnailUrl,
          viewBox: null,
          hasFixedDimensions: false,
          bytes: frameBytes,
          colorMode: "fixed",
        },
        layout: config.layout,
        tipografia: config.tipografia,
        colores: config.colores,
        animaciones: config.animaciones,
        tamanoBase: config.tamanoBase,
        draft: null,
        metadata: {
          schemaVersion: SCHEMA_VERSION,
          renderContractVersion: RENDER_CONTRACT_VERSION,
          createdAt: timestamp,
          createdByUid: "migration:legacy",
          updatedAt: timestamp,
          updatedByUid: "migration:legacy",
          publishedAt: timestamp,
          publishedByUid: "migration:legacy",
          archivedAt: null,
          archivedByUid: null,
          migrationSource: "legacy",
        },
      };

      if (!dryRun) {
        const batch = db.batch();
        batch.set(ref, baseDoc, { merge: false });
        batch.set(ref.collection("versions").doc("1"), {
          id: presetId,
          version: 1,
          nombre,
          categoria: baseDoc.categoria,
          svgRef: baseDoc.svgRef,
          layout: baseDoc.layout,
          tipografia: baseDoc.tipografia,
          colores: baseDoc.colores,
          animaciones: baseDoc.animaciones,
          tamanoBase: baseDoc.tamanoBase,
          metadata: {
            schemaVersion: SCHEMA_VERSION,
            renderContractVersion: RENDER_CONTRACT_VERSION,
            publishedAt: timestamp,
            publishedByUid: "migration:legacy",
            migrationSource: "legacy",
          },
        }, { merge: false });
        await batch.commit();
      }

      migrated += 1;
      console.log(`+ Migrado ${presetId}`);
    }
  } finally {
    await browser.close();
  }

  console.log(`Migracion finalizada. Migrados=${migrated}, Skipped=${skipped}, DryRun=${dryRun}`);
}

run().catch((error) => {
  console.error("Error en migracion de countdown presets:", error);
  process.exit(1);
});
