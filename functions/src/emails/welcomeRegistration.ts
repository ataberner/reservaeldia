import { randomUUID } from "node:crypto";
import { info } from "firebase-functions/logger";
import { isSuperAdmin } from "../auth/adminAuth";
import { emailMode, isEmailRecipient, resolveEmailMode, WELCOME_DASHBOARD_URL,
  welcomeEmailActivationAt, welcomeActivationSkipReason } from "./config";
import { createWelcomeDeliveryStore, isWelcomeUid } from "./welcomeDeliveryStore";
import type { WelcomeDelivery, WelcomeDeliveryStore } from "./welcomeDeliveryStore";
import type { EmailResult, TransactionalEmailRequest } from "./types";

// Backend input only. The Auth adapter maps UserRecord.metadata.creationTime.
// This module declares no callable, HTTP endpoint or Auth trigger.
export type WelcomeRegistration = {
  user: {
    uid: string;
    email?: string;
    displayName?: string;
    disabled?: boolean;
    customClaims?: Record<string, unknown>;
    creationTime?: string;
  };
  sourceEventId: string;
};

type WelcomeLog = {
  template: "welcome";
  userId: string;
  correlationId: string;
  sourceEventId: string;
  mode: ReturnType<typeof resolveEmailMode>;
  state: WelcomeDelivery["status"] | "already_exists" | "reservation_failed" | "eligibility_failed";
  messageId: string | null;
  errorCode: string | null;
  attempts: 0 | 1;
};

export type WelcomeRegistrationResult =
  | { outcome: "already_exists" }
  | { outcome: "recorded" | "persistence_failed"; delivery: WelcomeDelivery };

async function sendWelcome(request: TransactionalEmailRequest): Promise<EmailResult> {
  const { sendTransactionalEmail } = await import("./sendTransactionalEmail");
  return sendTransactionalEmail(request);
}

export function createWelcomeRegistrationProcessor(dependencies: {
  store: WelcomeDeliveryStore;
  getMode: () => unknown;
  isSuperAdmin: (uid: string) => boolean | Promise<boolean>;
  getActivationTime?: () => unknown;
  send?: (request: TransactionalEmailRequest) => Promise<EmailResult>;
  log?: (entry: WelcomeLog) => void;
  now?: () => Date;
}) {
  const send = dependencies.send ?? sendWelcome;
  const now = dependencies.now ?? (() => new Date());
  const getActivationTime = dependencies.getActivationTime ?? (() => welcomeEmailActivationAt.value());
  return async (registration: WelcomeRegistration): Promise<WelcomeRegistrationResult> => {
    const user = registration?.user;
    const sourceEventId = registration?.sourceEventId;
    if (!isWelcomeUid(user?.uid)) throw new Error("WELCOME_INVALID_UID");
    if (typeof sourceEventId !== "string" || !sourceEventId.trim() || sourceEventId.length > 256 ||
      Array.from(sourceEventId).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
      throw new Error("WELCOME_INVALID_SOURCE_EVENT");
    }

    const mode = resolveEmailMode(dependencies.getMode());
    const correlationId = `welcome-${randomUUID()}`;
    const log = (state: WelcomeLog["state"], attempts: 0 | 1, errorCode: string | null = null,
      messageId: string | null = null) => {
      // Observability must never change the sending/persistence decision.
      try {
        dependencies.log?.({ template: "welcome", userId: user.uid, correlationId,
          sourceEventId, mode, state, messageId, errorCode, attempts });
      } catch { /* logging is best effort, never a retry of the sender */ }
    };

    let skipReason: string | undefined;
    if (mode === "disabled") skipReason = "EMAIL_DISABLED";
    else if (mode === "sandbox") skipReason = "EMAIL_SANDBOX_BUSINESS_BLOCKED";
    else if (mode === "invalid") skipReason = "EMAIL_INVALID_MODE";
    else if (user.disabled === true) skipReason = "WELCOME_USER_DISABLED";
    else {
      let superAdmin;
      try { superAdmin = await dependencies.isSuperAdmin(user.uid); }
      catch {
        log("eligibility_failed", 0, "WELCOME_SUPERADMIN_LOOKUP_FAILED");
        throw new Error("WELCOME_SUPERADMIN_LOOKUP_FAILED");
      }
      if (superAdmin) skipReason = "WELCOME_SUPERADMIN";
      else if (user.customClaims?.admin === true) skipReason = "WELCOME_ADMIN";
      else if (!user.email) skipReason = "WELCOME_EMAIL_MISSING";
      else if (!isEmailRecipient(user.email)) skipReason = "WELCOME_EMAIL_INVALID";
      else skipReason = welcomeActivationSkipReason(getActivationTime(), user.creationTime);
    }

    const startedAt = now();
    const reserved: WelcomeDelivery = {
      status: skipReason ? "skipped" : "dispatching", sourceEventId, correlationId,
      attempts: skipReason ? 0 : 1, startedAt, updatedAt: startedAt,
      ...(skipReason ? { skipReason } : {}),
    };
    let acquired;
    try { acquired = await dependencies.store.reserve(user.uid, reserved); }
    catch {
      log("reservation_failed", 0, "WELCOME_RESERVATION_FAILED");
      throw new Error("WELCOME_RESERVATION_FAILED");
    }
    if (!acquired) {
      // Includes every status and every sourceEventId; zero additional attempts.
      log("already_exists", 0);
      return { outcome: "already_exists" };
    }
    if (skipReason) {
      log("skipped", 0, skipReason);
      return { outcome: "recorded", delivery: reserved };
    }

    log("dispatching", 1);
    let result: EmailResult;
    try {
      const name = typeof user.displayName === "string" ? user.displayName.trim().replace(/\s+/g, " ") : "";
      // Production remains blocked by the existing central sender. Offline tests
      // inject a fake sender to exercise final states, never a production switch.
      result = await send({ to: user.email!, template: "welcome",
        data: { ...(name ? { name } : {}), dashboardUrl: WELCOME_DASHBOARD_URL },
        metadata: { correlationId } });
    } catch {
      result = { ok: false, state: "unknown", messageId: null,
        errorCode: "SES_UNKNOWN_OUTCOME", retryable: false };
    }
    const updatedAt = now();
    const blockedBeforeSes = !result.ok && (result.state === "blocked" || result.errorCode === "EMAIL_RENDER_FAILED");
    const delivery: WelcomeDelivery = { ...reserved, updatedAt,
      status: result.ok ? "accepted" : blockedBeforeSes ? "skipped" : result.state === "failed" ? "failed" : "unknown",
      ...(result.ok ? { acceptedAt: updatedAt, messageId: result.messageId } :
        blockedBeforeSes ? { skipReason: result.errorCode } : { errorCode: result.errorCode }),
    };
    // Two bounded persistence attempts, with the same result. Never call SES again.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await dependencies.store.complete(user.uid, delivery);
        log(delivery.status, 1, delivery.errorCode ?? delivery.skipReason ?? null, delivery.messageId ?? null);
        return { outcome: "recorded", delivery };
      } catch { /* retain reservation; retry only this write once */ }
    }
    log(delivery.status, 1, "WELCOME_RESULT_PERSIST_FAILED", delivery.messageId ?? null);
    return { outcome: "persistence_failed", delivery };
  };
}

export const processWelcomeRegistration = createWelcomeRegistrationProcessor({
  store: createWelcomeDeliveryStore(),
  getMode: () => emailMode.value(),
  isSuperAdmin,
  log: entry => info("welcome_registration", entry),
});
