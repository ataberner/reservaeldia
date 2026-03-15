#!/usr/bin/env node
const admin = require("firebase-admin");

const SITE_SETTINGS_COLLECTION = "site_settings";
const PRICING_DOC_ID = "pricing";
const HISTORY_COLLECTION = "history";
const LEGACY_DOC_PATH = "app_config/publicationPayments";
const DEFAULTS = {
  publishPrice: 29900,
  updatePrice: 1490,
};

function parseArgs(argv) {
  const runApply = argv.includes("--apply");
  const runDryRun = argv.includes("--dry-run");

  return {
    dryRun: runDryRun || !runApply,
  };
}

function ensureApp() {
  if (admin.apps.length > 0) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

function db() {
  ensureApp();
  return admin.firestore();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed);
}

async function loadSeedSource() {
  const legacySnap = await db().doc(LEGACY_DOC_PATH).get();
  if (legacySnap.exists) {
    const data = legacySnap.data() || {};
    return {
      source: "legacy_app_config",
      publishPrice: parseNonNegativeInteger(data.publishAmountArs, DEFAULTS.publishPrice),
      updatePrice: parseNonNegativeInteger(data.updateAmountArs, DEFAULTS.updatePrice),
      reason: "Seed inicial desde app_config/publicationPayments.",
    };
  }

  return {
    source: "hardcoded_defaults",
    publishPrice: DEFAULTS.publishPrice,
    updatePrice: DEFAULTS.updatePrice,
    reason: "Seed inicial con defaults legacy 29900/1490.",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pricingRef = db().collection(SITE_SETTINGS_COLLECTION).doc(PRICING_DOC_ID);
  const historyRef = pricingRef.collection(HISTORY_COLLECTION).doc("1");
  const pricingSnap = await pricingRef.get();

  if (pricingSnap.exists) {
    console.log(
      JSON.stringify(
        {
          dryRun: args.dryRun,
          skipped: true,
          reason: `${SITE_SETTINGS_COLLECTION}/${PRICING_DOC_ID} ya existe.`,
          current: pricingSnap.data() || {},
        },
        null,
        2
      )
    );
    return;
  }

  const seed = await loadSeedSource();
  const actorUid = "migration-script";
  const actorEmail = null;

  const payload = {
    publishPrice: seed.publishPrice,
    updatePrice: seed.updatePrice,
    currency: "ARS",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByUid: actorUid,
    updatedByEmail: actorEmail,
    version: 1,
    lastChangeReason: seed.reason,
  };

  const historyPayload = {
    previousPublishPrice: null,
    previousUpdatePrice: null,
    newPublishPrice: seed.publishPrice,
    newUpdatePrice: seed.updatePrice,
    changedAt: admin.firestore.FieldValue.serverTimestamp(),
    changedByUid: actorUid,
    changedByEmail: actorEmail,
    reason: seed.reason,
    version: 1,
  };

  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun,
        source: seed.source,
        target: `${SITE_SETTINGS_COLLECTION}/${PRICING_DOC_ID}`,
        payload: {
          ...payload,
          updatedAt: "serverTimestamp()",
        },
        history: {
          ...historyPayload,
          changedAt: "serverTimestamp()",
        },
      },
      null,
      2
    )
  );

  if (args.dryRun) return;

  const batch = db().batch();
  batch.set(pricingRef, payload, { merge: false });
  batch.set(historyRef, historyPayload, { merge: false });
  await batch.commit();

  console.log(
    JSON.stringify(
      {
        applied: true,
        reason: normalizeText(seed.reason),
      },
      null,
      2
    )
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error creando seed de pricing:", error);
    process.exit(1);
  });
