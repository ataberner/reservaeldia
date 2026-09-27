import { randomUUID } from "node:crypto";
import { isEmailRecipient, resolveEmailMode,
  welcomeEmailActivationAt, welcomeActivationSkipReason } from "./config";
import { isRegistrationUid } from "./registrationDeliveryStore";
import type { RegistrationDelivery, RegistrationDeliveryStore } from "./registrationDeliveryStore";
import type { EmailResult, TransactionalEmailRequest } from "./types";

// Backend input only. The Auth adapter maps UserRecord.metadata.creationTime.
// This module declares no callable, HTTP endpoint or Auth trigger.
export type RegistrationEmailInput = {
  user: {
    uid: string;
    email?: string;
    displayName?: string;
    disabled?: boolean;
    customClaims?: Record<string, unknown>;
    creationTime?: string;
    providerData?: { providerId: string }[];
  };
  sourceEventId: string;
  eventTimestamp?: string;
};

type RegistrationLog = {
  template: "welcome" | "newUserNotification";
  userId: string;
  correlationId: string;
  sourceEventId: string;
  mode: ReturnType<typeof resolveEmailMode>;
  state: RegistrationDelivery["status"] | "already_exists" | "reservation_failed" | "eligibility_failed";
  messageId: string | null;
  errorCode: string | null;
  attempts: 0 | 1;
};

export type RegistrationEmailResult =
  | { outcome: "already_exists" }
  | { outcome: "recorded" | "persistence_failed"; delivery: RegistrationDelivery };

async function sendRegistrationEmail(request: TransactionalEmailRequest): Promise<EmailResult> {
  const { sendTransactionalEmail } = await import("./sendTransactionalEmail");
  return sendTransactionalEmail(request);
}

export type RegistrationEmailDependencies = {
  store: RegistrationDeliveryStore;
  getMode: () => unknown;
  isSuperAdmin: (uid: string) => boolean | Promise<boolean>;
  getActivationTime?: () => unknown;
  send?: (request: TransactionalEmailRequest) => Promise<EmailResult>;
  log?: (entry: RegistrationLog) => void;
  now?: () => Date;
};

// Shared attempt mechanics, separate fixed definitions and stores for each effect.
export function createRegistrationEmailProcessor(definition: {
  template: RegistrationLog["template"];
  correlationPrefix: "welcome" | "new-user-notification";
  errorPrefix: "WELCOME" | "NEW_USER_NOTIFICATION";
  requiresUserEmail: boolean;
  request: (registration: RegistrationEmailInput, correlationId: string) => TransactionalEmailRequest;
}, dependencies: RegistrationEmailDependencies) {
  const send = dependencies.send ?? sendRegistrationEmail;
  const now = dependencies.now ?? (() => new Date());
  const getActivationTime = dependencies.getActivationTime ?? (() => welcomeEmailActivationAt.value());
  return async (registration: RegistrationEmailInput): Promise<RegistrationEmailResult> => {
    const user = registration?.user;
    const sourceEventId = registration?.sourceEventId;
    const errorCode = (suffix: string) => `${definition.errorPrefix}_${suffix}`;
    if (!isRegistrationUid(user?.uid)) throw new Error(errorCode("INVALID_UID"));
    if (typeof sourceEventId !== "string" || !sourceEventId.trim() || sourceEventId.length > 256 ||
      Array.from(sourceEventId).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
      throw new Error(errorCode("INVALID_SOURCE_EVENT"));
    }

    const mode = resolveEmailMode(dependencies.getMode());
    const correlationId = `${definition.correlationPrefix}-${randomUUID()}`;
    const log = (state: RegistrationLog["state"], attempts: 0 | 1, errorCode: string | null = null,
      messageId: string | null = null) => {
      // Observability must never change the sending/persistence decision.
      try {
        dependencies.log?.({ template: definition.template, userId: user.uid, correlationId,
          sourceEventId, mode, state, messageId, errorCode, attempts });
      } catch { /* logging is best effort, never a retry of the sender */ }
    };

    let skipReason: string | undefined;
    if (mode === "disabled") skipReason = "EMAIL_DISABLED";
    else if (mode === "sandbox") skipReason = "EMAIL_SANDBOX_BUSINESS_BLOCKED";
    else if (mode === "invalid") skipReason = "EMAIL_INVALID_MODE";
    else if (user.disabled === true) skipReason = errorCode("USER_DISABLED");
    else {
      let superAdmin;
      try { superAdmin = await dependencies.isSuperAdmin(user.uid); }
      catch {
        log("eligibility_failed", 0, errorCode("SUPERADMIN_LOOKUP_FAILED"));
        throw new Error(errorCode("SUPERADMIN_LOOKUP_FAILED"));
      }
      if (superAdmin) skipReason = errorCode("SUPERADMIN");
      else if (user.customClaims?.admin === true) skipReason = errorCode("ADMIN");
      else if (definition.requiresUserEmail && !user.email) skipReason = errorCode("EMAIL_MISSING");
      else if (definition.requiresUserEmail && !isEmailRecipient(user.email)) skipReason = errorCode("EMAIL_INVALID");
      else skipReason = welcomeActivationSkipReason(getActivationTime(), user.creationTime);
    }

    const startedAt = now();
    const reserved: RegistrationDelivery = {
      status: skipReason ? "skipped" : "dispatching", sourceEventId, correlationId,
      attempts: skipReason ? 0 : 1, startedAt, updatedAt: startedAt,
      ...(skipReason ? { skipReason } : {}),
    };
    let acquired;
    try { acquired = await dependencies.store.reserve(user.uid, reserved); }
    catch {
      log("reservation_failed", 0, errorCode("RESERVATION_FAILED"));
      throw new Error(errorCode("RESERVATION_FAILED"));
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
      result = await send(definition.request(registration, correlationId));
    } catch {
      result = { ok: false, state: "unknown", messageId: null,
        errorCode: "SES_UNKNOWN_OUTCOME", retryable: false };
    }
    const updatedAt = now();
    const blockedBeforeSes = !result.ok && (result.state === "blocked" || result.errorCode === "EMAIL_RENDER_FAILED");
    const delivery: RegistrationDelivery = { ...reserved, updatedAt,
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
    log(delivery.status, 1, errorCode("RESULT_PERSIST_FAILED"), delivery.messageId ?? null);
    return { outcome: "persistence_failed", delivery };
  };
}

export function normalizedRegistrationName(name: unknown): string | undefined {
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ") || undefined : undefined;
}
