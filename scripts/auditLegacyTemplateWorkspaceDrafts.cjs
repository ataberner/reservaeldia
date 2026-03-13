#!/usr/bin/env node
const admin = require("firebase-admin");

const DRAFTS_COLLECTION = "borradores";

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

function toIsoString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") {
    try {
      const parsed = value.toDate();
      return parsed instanceof Date ? parsed.toISOString() : null;
    } catch {
      return null;
    }
  }
  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  return null;
}

async function main() {
  const snapshot = await db().collection(DRAFTS_COLLECTION).get();
  const items = snapshot.docs
    .map((docSnap) => {
      const data = docSnap.data() || {};
      const workspace =
        data?.templateWorkspace && typeof data.templateWorkspace === "object"
          ? data.templateWorkspace
          : {};
      const mode = normalizeText(workspace.mode);
      if (mode !== "template_edit") return null;

      return {
        id: docSnap.id,
        userId: normalizeText(data.userId) || null,
        templateId: normalizeText(workspace.templateId || data.plantillaId) || null,
        templateName:
          normalizeText(workspace.templateName) ||
          normalizeText(data.nombre) ||
          "Plantilla",
        estadoEditorial: normalizeText(workspace.estadoEditorial) || null,
        openedAt: toIsoString(workspace.openedAt),
        lastCommittedAt: toIsoString(workspace.lastCommittedAt),
        ultimaEdicion: toIsoString(data.ultimaEdicion),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftDate = normalizeText(left?.ultimaEdicion);
      const rightDate = normalizeText(right?.ultimaEdicion);
      return rightDate.localeCompare(leftDate);
    });

  console.log(
    JSON.stringify(
      {
        totalDraftsScanned: snapshot.size,
        legacyTemplateWorkspaceDrafts: items.length,
        items,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
