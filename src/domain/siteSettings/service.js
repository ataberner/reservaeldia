import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

const getPricingConfigCallable = httpsCallable(functions, "adminGetPricingConfigV1");
const listPricingHistoryCallable = httpsCallable(functions, "adminListPricingHistoryV1");
const updatePricingConfigCallable = httpsCallable(functions, "adminUpdatePricingConfigV1");

function unwrap(result) {
  return result?.data || {};
}

export async function getPublicationPricing() {
  const result = unwrap(await getPricingConfigCallable({}));
  return result?.config || null;
}

export async function listPublicationPricingHistory(payload = {}) {
  const safePayload =
    payload && typeof payload === "object"
      ? {
          ...(payload.limit ? { limit: payload.limit } : {}),
          ...(payload.cursorVersion ? { cursorVersion: payload.cursorVersion } : {}),
        }
      : {};

  const result = unwrap(await listPricingHistoryCallable(safePayload));
  return {
    items: Array.isArray(result?.items) ? result.items : [],
    nextCursorVersion: result?.nextCursorVersion ?? null,
  };
}

export async function updatePublicationPricing(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const result = unwrap(await updatePricingConfigCallable(safePayload));
  return {
    config: result?.config || null,
    change: result?.change || null,
  };
}

export const getPricingConfig = getPublicationPricing;
export const listPricingHistory = listPublicationPricingHistory;
export const updatePricingConfig = updatePublicationPricing;
