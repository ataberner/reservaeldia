#!/usr/bin/env node
const admin = require("firebase-admin");

function parseArgs(argv) {
  const args = {
    dryRun: argv.includes("--dry-run"),
    archiveDuplicates: argv.includes("--archive-duplicates"),
    limit: 0,
    batchSize: 200,
    resumeAfter: "",
  };

  argv.forEach((entry) => {
    if (entry.startsWith("--limit=")) {
      const parsed = Number(entry.slice("--limit=".length));
      if (Number.isFinite(parsed) && parsed > 0) args.limit = Math.floor(parsed);
    }
    if (entry.startsWith("--batch-size=")) {
      const parsed = Number(entry.slice("--batch-size=".length));
      if (Number.isFinite(parsed) && parsed > 0) args.batchSize = Math.floor(parsed);
    }
    if (entry.startsWith("--resume-after=")) {
      args.resumeAfter = String(entry.slice("--resume-after=".length) || "").trim();
    }
  });
  return args;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\-_ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseList(value) {
  if (Array.isArray(value)) return value.map((entry) => normalizeToken(entry)).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => normalizeToken(entry))
      .filter(Boolean);
  }
  return [];
}

function uniq(values, max) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function guessFormat(data) {
  const explicit = normalizeToken(data.format || data.formato || data.ext || "");
  if (explicit) return explicit === "jpeg" ? "jpg" : explicit;

  const contentType = normalizeString(data.contentType).toLowerCase();
  if (contentType === "image/svg+xml") return "svg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/webp") return "webp";

  const raw = normalizeString(data.nombre || data.url || "").toLowerCase();
  const clean = raw.split("?")[0].split("#")[0];
  const ext = clean.split(".").pop() || "";
  if (!ext) return null;
  return ext === "jpeg" ? "jpg" : ext;
}

function normalizeMetadata(data) {
  const nombre = normalizeString(data.nombre || data.name || data.label || "");
  const categorias = uniq(
    [...parseList(data.categorias), ...parseList(data.categoria), ...parseList(data.category)],
    12
  );
  const keywords = uniq(
    [...parseList(data.keywords), ...parseList(data.tags), ...parseList(data.keyword)],
    64
  );
  const tags = uniq([...parseList(data.tags), ...parseList(data.keywords)], 64);
  const priorityParsed = Number(data.priority);
  const priority = Number.isFinite(priorityParsed)
    ? Math.max(-9999, Math.min(9999, Math.round(priorityParsed)))
    : data.popular === true
      ? 1
      : 0;
  const popular = priority > 0;
  const categoria = categorias[0] || "";
  const searchTokens = uniq(
    [normalizeToken(nombre), ...categorias, ...keywords, ...tags],
    200
  );

  return {
    nombre,
    categoria,
    categorias,
    keywords,
    tags,
    priority,
    popular,
    format: guessFormat(data),
    searchTokens,
    searchText: searchTokens.join(" "),
    assetType: normalizeToken(data.assetType) === "decoracion" ? "decoracion" : "icon",
  };
}

function resolveStoragePath(data) {
  const storagePath = normalizeString(data.storagePath);
  if (storagePath) return storagePath;

  const url = normalizeString(data.url);
  if (url.startsWith("gs://")) {
    const withoutScheme = url.slice(5);
    const slash = withoutScheme.indexOf("/");
    if (slash !== -1) return withoutScheme.slice(slash + 1);
  }

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (
        parsed.hostname === "firebasestorage.googleapis.com" ||
        parsed.hostname.endsWith(".firebasestorage.app")
      ) {
        const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/i);
        if (match) return decodeURIComponent(match[2] || "");
      }
      if (parsed.hostname === "storage.googleapis.com") {
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts.length >= 2) return decodeURIComponent(parts.slice(1).join("/"));
      }
    } catch {
      // ignore
    }
  }

  const nombre = normalizeString(data.nombre);
  if (!nombre) return null;
  return nombre.startsWith("iconos/") ? nombre : `iconos/${nombre}`;
}

async function initAdmin() {
  if (admin.apps.length) return;
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET || "reservaeldia-7a440.firebasestorage.app",
  });
}

async function isDuplicateHash(db, iconId, hash) {
  const safeHash = normalizeString(hash);
  if (!safeHash) return { duplicate: false, duplicateOf: null };
  const snap = await db.collection("iconos").where("hashSha256", "==", safeHash).limit(6).get();
  if (snap.empty) return { duplicate: false, duplicateOf: null };
  const ids = snap.docs.map((docItem) => docItem.id).sort();
  const winner = ids[0] || null;
  return {
    duplicate: Boolean(winner && winner !== iconId),
    duplicateOf: winner && winner !== iconId ? winner : null,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  await initAdmin();
  const db = admin.firestore();
  const sourceCollection = db.collection("iconos");
  const archivedCollection = db.collection("iconos_archived");

  let query = sourceCollection.orderBy(admin.firestore.FieldPath.documentId());
  if (args.resumeAfter) {
    query = query.startAfter(args.resumeAfter);
  }
  if (args.limit > 0) {
    query = query.limit(args.limit);
  }

  const snap = await query.get();
  const docs = snap.docs;
  console.log(`Procesando ${docs.length} docs de iconos...`);
  console.log(`dryRun=${args.dryRun} archiveDuplicates=${args.archiveDuplicates}`);

  let updated = 0;
  let archived = 0;
  let skipped = 0;

  let batch = db.batch();
  let writeOps = 0;

  async function flushBatch() {
    if (writeOps === 0 || args.dryRun) {
      batch = db.batch();
      writeOps = 0;
      return;
    }
    await batch.commit();
    batch = db.batch();
    writeOps = 0;
  }

  for (const docItem of docs) {
    const data = asObject(docItem.data());
    const normalized = normalizeMetadata(data);
    const storagePath = resolveStoragePath(data);
    const currentPopular = data.popular === true;
    const currentPriority = Number.isFinite(Number(data.priority))
      ? Number(data.priority)
      : null;
    const currentSchema = Number.isFinite(Number(data.schemaVersion))
      ? Number(data.schemaVersion)
      : 0;
    const currentAssetType = normalizeToken(data.assetType) || "icon";
    const currentSearch = normalizeString(data.searchText);
    const currentStoragePath = normalizeString(data.storagePath);

    const patch = {
      ...normalized,
      schemaVersion: 2,
      status: normalizeToken(data.status) || "active",
      storagePath: storagePath || null,
      contentType: normalizeString(data.contentType) || null,
      bytes: Number.isFinite(Number(data.bytes)) ? Number(data.bytes) : null,
      hashSha256: normalizeString(data.hashSha256) || null,
      stats: {
        usesCount: Number(asObject(data.stats).usesCount || 0),
        lastUsedAt: asObject(data.stats).lastUsedAt || null,
        lastUsedSlug: normalizeString(asObject(data.stats).lastUsedSlug) || null,
      },
      audit: {
        ...asObject(data.audit),
        createdByUid: normalizeString(asObject(data.audit).createdByUid) || null,
        updatedByUid: normalizeString(asObject(data.audit).updatedByUid) || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    };

    const changed =
      currentSchema < 2 ||
      currentPopular !== normalized.popular ||
      currentPriority !== normalized.priority ||
      currentAssetType !== normalized.assetType ||
      currentSearch !== normalized.searchText ||
      currentStoragePath !== normalizeString(storagePath);

    let duplicate = false;
    let duplicateOf = null;
    if (args.archiveDuplicates && patch.hashSha256) {
      const duplicateCheck = await isDuplicateHash(db, docItem.id, patch.hashSha256);
      duplicate = duplicateCheck.duplicate;
      duplicateOf = duplicateCheck.duplicateOf;
    }

    if (!changed && !duplicate) {
      skipped += 1;
      continue;
    }

    if (duplicate) {
      archived += 1;
      const archivedPayload = {
        ...data,
        ...patch,
        status: "duplicate",
        duplicateOf: duplicateOf || null,
        archivedReason: "duplicate-content-migration",
        archivedFrom: "iconos",
        audit: {
          ...asObject(data.audit),
          ...asObject(patch.audit),
          archivedByUid: "migration:iconos-v2",
          archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      };

      if (!args.dryRun) {
        batch.set(archivedCollection.doc(docItem.id), archivedPayload, { merge: true });
        batch.delete(docItem.ref);
        writeOps += 2;
      }
    } else {
      updated += 1;
      if (!args.dryRun) {
        batch.set(docItem.ref, patch, { merge: true });
        writeOps += 1;
      }
    }

    if (writeOps >= args.batchSize) {
      await flushBatch();
    }
  }

  await flushBatch();

  console.log(
    JSON.stringify(
      {
        scanned: docs.length,
        updated,
        archived,
        skipped,
        dryRun: args.dryRun,
        archiveDuplicates: args.archiveDuplicates,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error("migrateIconCatalogV2 failed:", error);
  process.exit(1);
});

