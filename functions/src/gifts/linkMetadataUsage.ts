import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export const GIFT_METADATA_USAGE_COLLECTION = "giftLinkMetadataUsage";
export const GIFT_METADATA_USAGE_LIMITS = Object.freeze({ perMinute: 30, perDay: 200 });
type UsageDb = Pick<Firestore, "doc" | "runTransaction">;

const unavailable = () => new HttpsError("unavailable", "No pudimos consultar el enlace. Completá sus datos manualmente.");

function safeCounter(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw unavailable();
  return value;
}

export function createGiftMetadataUsageStore(db: UsageDb, now: () => number = Date.now) {
  return {
    async consume(uid: string): Promise<void> {
      if (!uid) throw unavailable();
      const userKey = createHash("sha256").update(uid).digest("hex");
      const reference = db.doc(`${GIFT_METADATA_USAGE_COLLECTION}/${userKey}`);
      try {
        await db.runTransaction(async (transaction) => {
          const nowMs = now();
          const minute = Math.floor(nowMs / 60_000);
          const day = Math.floor(nowMs / 86_400_000);
          const snapshot = await transaction.get(reference);
          const previous = snapshot.data();
          if (snapshot.exists && (!previous || previous.schemaVersion !== 1 ||
              safeCounter(previous.minute) > minute || safeCounter(previous.day) > day)) throw unavailable();
          const minuteCount = previous?.minute === minute ? safeCounter(previous.minuteCount) : 0;
          const dayCount = previous?.day === day ? safeCounter(previous.dayCount) : 0;
          if (minuteCount >= GIFT_METADATA_USAGE_LIMITS.perMinute || dayCount >= GIFT_METADATA_USAGE_LIMITS.perDay) {
            throw new HttpsError("resource-exhausted", "Consultaste muchos enlaces. Podés completar sus datos manualmente o reintentar más tarde.");
          }
          transaction.set(reference, {
            schemaVersion: 1, minute, minuteCount: minuteCount + 1, day, dayCount: dayCount + 1, updatedAtMs: nowMs,
          });
        });
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        // Fail closed without logging Firestore diagnostics or user identifiers.
        throw unavailable();
      }
    },
  };
}
