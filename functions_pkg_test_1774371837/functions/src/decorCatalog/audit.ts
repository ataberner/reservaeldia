import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { DECOR_CATALOG_AUDIT_COLLECTION } from "./config";

type AuditPayload = Record<string, unknown>;

export async function writeDecorAuditEvent(params: {
  event: string;
  decorId: string | null;
  uid: string | null;
  payload?: AuditPayload;
}): Promise<void> {
  const { event, decorId, uid, payload } = params;
  const safeEvent = String(event || "").trim();
  if (!safeEvent) return;

  const data = {
    event: safeEvent,
    decorId: decorId || null,
    uid: uid || null,
    payload: payload || {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  logger.info("[decor-catalog-audit]", data);

  try {
    await admin.firestore().collection(DECOR_CATALOG_AUDIT_COLLECTION).add(data);
  } catch (error) {
    logger.warn("No se pudo guardar auditoria de decoraciones", {
      event: safeEvent,
      decorId: decorId || null,
      error: error instanceof Error ? error.message : String(error || ""),
    });
  }
}
