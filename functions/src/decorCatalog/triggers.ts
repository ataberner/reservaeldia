import * as logger from "firebase-functions/logger";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import {
  DECOR_CATALOG_COLLECTION,
  DECOR_CATALOG_TRIGGER_OPTIONS,
  DECOR_V1_ENABLED,
} from "./config";
import { writeDecorAuditEvent } from "./audit";
import { activeDecorCollection, moveDecorToArchived } from "./repository";

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

let processDecorDocumentV1Promise: Promise<typeof import("./processor")["processDecorDocumentV1"]> | null = null;

async function loadProcessDecorDocumentV1() {
  if (!processDecorDocumentV1Promise) {
    // Lazy-loaded to reduce Functions startup cost during emulator discovery/cold start.
    processDecorDocumentV1Promise = import("./processor").then(
      (module) => module.processDecorDocumentV1
    );
  }
  return processDecorDocumentV1Promise;
}

export const onDecorCatalogDocWriteV1 = onDocumentWritten(
  {
    ...DECOR_CATALOG_TRIGGER_OPTIONS,
    document: `${DECOR_CATALOG_COLLECTION}/{decorId}`,
  },
  async (event) => {
    if (!DECOR_V1_ENABLED) return;
    const decorId = normalizeString(event.params.decorId);
    if (!decorId) return;
    if (!event.data?.after.exists) return;

    const afterData = asObject(event.data.after.data());

    try {
      const processDecorDocumentV1 = await loadProcessDecorDocumentV1();
      const processed = await processDecorDocumentV1({
        decorId,
        rawData: afterData,
        force: false,
        triggeredByUid: null,
      });

      if (processed.skip) return;
      if (Object.keys(processed.patch).length > 0) {
        await activeDecorCollection().doc(decorId).set(processed.patch, { merge: true });
      }

      if (processed.shouldArchive) {
        await moveDecorToArchived({
          decorId,
          reason: processed.archiveReason || "trigger-archive",
          uid: null,
        });
      }

      await writeDecorAuditEvent({
        event: "onDecorCatalogDocWriteV1",
        decorId,
        uid: null,
        payload: {
          skip: processed.skip,
          shouldArchive: processed.shouldArchive,
          archiveReason: processed.archiveReason,
        },
      });
    } catch (error) {
      logger.error("Error procesando trigger de decoraciones v1", {
        decorId,
        error: error instanceof Error ? error.message : String(error || ""),
      });
      await writeDecorAuditEvent({
        event: "onDecorCatalogDocWriteV1:error",
        decorId,
        uid: null,
        payload: {
          error: error instanceof Error ? error.message : String(error || ""),
        },
      });
    }
  }
);
