import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { ICON_CATALOG_AUDIT_COLLECTION } from "./config";

type AuditPayload = Record<string, unknown>;

export async function writeIconAuditEvent(params: {
  event: string;
  iconId: string | null;
  uid: string | null;
  payload?: AuditPayload;
}): Promise<void> {
  const { event, iconId, uid, payload } = params;
  const safeEvent = String(event || "").trim();
  if (!safeEvent) return;

  const data = {
    event: safeEvent,
    iconId: iconId || null,
    uid: uid || null,
    payload: payload || {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  logger.info("[icon-catalog-audit]", data);

  try {
    await admin.firestore().collection(ICON_CATALOG_AUDIT_COLLECTION).add(data);
  } catch (error) {
    logger.warn("No se pudo guardar auditoria de iconos", {
      event: safeEvent,
      iconId: iconId || null,
      error: error instanceof Error ? error.message : String(error || ""),
    });
  }
}

export function auditIconError(params: {
  event: string;
  iconId: string | null;
  error: unknown;
  payload?: AuditPayload;
}): void {
  const { event, iconId, error, payload } = params;
  logger.error("[icon-catalog-error]", {
    event,
    iconId,
    payload: payload || {},
    error: error instanceof Error ? error.message : String(error || ""),
  });
}

