import type { Firestore } from "firebase-admin/firestore";
import { ensureAdminApp } from "../firebaseAdmin";

export type WelcomeDeliveryStatus = "dispatching" | "accepted" | "failed" | "unknown" | "skipped";
export type WelcomeDelivery = {
  status: WelcomeDeliveryStatus;
  sourceEventId: string;
  correlationId: string;
  // Reserved automatic attempts, not deliveries or confirmed SES requests.
  attempts: 0 | 1;
  startedAt: Date;
  updatedAt: Date;
  acceptedAt?: Date;
  messageId?: string;
  errorCode?: string;
  skipReason?: string;
};

export interface WelcomeDeliveryStore {
  reserve(uid: string, delivery: WelcomeDelivery): Promise<boolean>;
  complete(uid: string, delivery: WelcomeDelivery): Promise<void>;
}

// Auth UIDs must fit a single Firestore document segment. Never normalize a UID.
export function isWelcomeUid(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 &&
    value.trim() === value && !value.includes("/") &&
    !Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) &&
    value !== "." && value !== ".." && !/^__.*__$/.test(value);
}

export function createWelcomeDeliveryStore(
  getDb: () => Pick<Firestore, "doc"> = () => ensureAdminApp().firestore()
): WelcomeDeliveryStore {
  const reference = (uid: string) => {
    if (!isWelcomeUid(uid)) throw new Error("WELCOME_INVALID_UID");
    return getDb().doc(`welcomeEmailDeliveries/${uid}`);
  };
  return {
    async reserve(uid, delivery) {
      try {
        // Firestore create has an atomic exists=false precondition across instances.
        await reference(uid).create(delivery);
        return true;
      } catch (error: unknown) {
        const code = (error as { code?: unknown } | null)?.code;
        if (code === 6 || code === "already-exists") return false;
        // An unconfirmed write may have committed: do not grant sending rights.
        throw new Error("WELCOME_RESERVATION_FAILED");
      }
    },
    async complete(uid, delivery) {
      // Update never recreates a deleted record. There are no leases or deletes.
      await reference(uid).update(delivery);
    },
  };
}
