import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import {
  admissionRecord, calculateDesignerAiCostMicrousd, designerAiUsageKey,
  DesignerAiAdmissionError, parseDesignerAiAdmissionConfig, validateDesignerAiAdmissionInput,
  DESIGNER_AI_ADMISSION_CONFIG_PATH, DESIGNER_AI_RESERVATION_LEASE_MS,
  DESIGNER_AI_USAGE_COLLECTION, DESIGNER_AI_USAGE_RETENTION_MS,
} from "./admission";
import type { DesignerAiAdmissionConfig, DesignerAiAdmissionInput } from "./admission";

type AdmissionDb = Pick<Firestore, "doc" | "runTransaction">;
export type DesignerAiReservation = {
  requestKey: string;
  userKey: string;
  globalKey: string;
  ownerToken: string;
  reservedMicrousd: number;
  pricing: Pick<DesignerAiAdmissionConfig, "inputMicrousdPerMillionTokens" | "outputMicrousdPerMillionTokens">;
};
export type DesignerAiSettlement = {
  outcome: "succeeded" | "failed" | "unknown";
  actualMicrousd?: number;
  // Only true when usage is present for every dispatched provider attempt.
  usageComplete?: boolean;
};

function nonnegativeCounter(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new DesignerAiAdmissionError("accounting_unavailable");
  }
  return value;
}

export function createDesignerAiAdmissionStore(db: AdmissionDb, {
  isDraftEditable,
  now = () => Date.now(),
  createOwnerToken = () => randomUUID(),
}: {
  // The caller supplies the canonical draft lifecycle predicate; this store owns only authorization.
  isDraftEditable: (draft: Record<string, unknown>) => boolean;
  now?: () => number;
  createOwnerToken?: () => string;
}) {
  const reference = (key: string) => db.doc(`${DESIGNER_AI_USAGE_COLLECTION}/${key}`);
  const safely = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { return await operation(); }
    catch (error) {
      if (error instanceof DesignerAiAdmissionError) throw error;
      // Firestore diagnostics may include document identities. Never surface or log them here.
      throw new DesignerAiAdmissionError("accounting_unavailable");
    }
  };

  return {
    loadConfig: () => safely(async () => parseDesignerAiAdmissionConfig((await db.doc(DESIGNER_AI_ADMISSION_CONFIG_PATH).get()).data())),

    reserve(input: DesignerAiAdmissionInput): Promise<DesignerAiReservation> {
      const requestedAt = now();
      validateDesignerAiAdmissionInput(input, requestedAt);
      const userKey = `user_${designerAiUsageKey(input.uid)}`;
      const requestKey = `request_${designerAiUsageKey(JSON.stringify([input.uid, input.clientMessageId]))}`;
      const ownerToken = createOwnerToken();
      return safely(() => db.runTransaction(async tx => {
        // Recompute clock/window on transaction retries, including after an UTC day boundary.
        const nowMs = now();
        validateDesignerAiAdmissionInput(input, nowMs);
        const minute = Math.floor(nowMs / 60_000);
        const day = Math.floor(nowMs / 86_400_000);
        const globalKey = `global_${day}`;
        const [configSnap, draftSnap, requestSnap, userSnap, globalSnap] = await Promise.all([
          tx.get(db.doc(DESIGNER_AI_ADMISSION_CONFIG_PATH)), tx.get(db.doc(`borradores/${input.draftId}`)),
          tx.get(reference(requestKey)), tx.get(reference(userKey)), tx.get(reference(globalKey)),
        ]);
        const config = parseDesignerAiAdmissionConfig(configSnap.data());
        if (config.model !== input.model) throw new DesignerAiAdmissionError("configuration_invalid");
        const draft = admissionRecord(draftSnap.data());
        if (!draft || draft.userId !== input.uid || !isDraftEditable(draft)) {
          throw new DesignerAiAdmissionError("draft_unavailable");
        }
        const previous = admissionRecord(requestSnap.data());
        if (requestSnap.exists) {
          if (!previous || previous.payloadDigest !== input.payloadDigest || previous.requestCreatedAt !== input.requestCreatedAt) {
            throw new DesignerAiAdmissionError("request_conflict");
          }
          if (previous.state === "settled") {
            throw new DesignerAiAdmissionError(previous.outcome === "unknown" ? "duplicate_unknown" : "duplicate_completed");
          }
          throw new DesignerAiAdmissionError(
            nonnegativeCounter(previous.leaseUntilMs) > nowMs ? "duplicate_active" : "duplicate_unknown"
          );
        }
        const user = admissionRecord(userSnap.data());
        if (userSnap.exists && !user) throw new DesignerAiAdmissionError("accounting_unavailable");
        const minuteCount = user?.minute === minute ? nonnegativeCounter(user.minuteCount) : 0;
        const dayCount = user?.day === day ? nonnegativeCounter(user.dayCount) : 0;
        if (minuteCount >= config.perUserMinuteLimit) throw new DesignerAiAdmissionError("minute_quota");
        if (dayCount >= config.perUserDayLimit) throw new DesignerAiAdmissionError("daily_quota");
        if (user?.activeRequestKey && nonnegativeCounter(user.activeUntilMs) > nowMs) {
          throw new DesignerAiAdmissionError("concurrent_request");
        }
        const global = admissionRecord(globalSnap.data());
        const allocated = globalSnap.exists ? nonnegativeCounter(global?.allocatedMicrousd) : 0;
        const reservedMicrousd = calculateDesignerAiCostMicrousd(input.maxInputTokens, input.maxOutputTokens, config);
        if (allocated > config.dailyBudgetMicrousd - reservedMicrousd) {
          throw new DesignerAiAdmissionError("global_budget");
        }
        // Read an expired active request before any writes. Expiry releases only concurrency,
        // never the uncertain charge and never permission to dispatch that request again.
        const expiredRequestKey = typeof user?.activeRequestKey === "string" ? user.activeRequestKey : "";
        const expiredSnap = expiredRequestKey ? await tx.get(reference(expiredRequestKey)) : null;
        const expired = admissionRecord(expiredSnap?.data());
        if (expiredSnap?.exists && expired && expired.state !== "settled") {
          tx.update(reference(expiredRequestKey), { state: "settled", outcome: "unknown", settledAtMs: nowMs });
        }
        const expiresAt = new Date(nowMs + DESIGNER_AI_USAGE_RETENTION_MS);
        const leaseUntilMs = nowMs + DESIGNER_AI_RESERVATION_LEASE_MS;
        tx.create(reference(requestKey), {
          schemaVersion: 1, state: "reserved", payloadDigest: input.payloadDigest,
          draftKey: designerAiUsageKey(input.draftId), userKey, globalKey, ownerToken,
          requestCreatedAt: input.requestCreatedAt, createdAtMs: nowMs, leaseUntilMs,
          policyVersion: config.policyVersion, model: config.model, reservedMicrousd, chargedMicrousd: reservedMicrousd,
          expiresAt,
        });
        tx.set(reference(userKey), {
          schemaVersion: 1, minute, minuteCount: minuteCount + 1, day, dayCount: dayCount + 1,
          activeRequestKey: requestKey, activeUntilMs: leaseUntilMs, expiresAt,
        });
        tx.set(reference(globalKey), {
          schemaVersion: 1, day, allocatedMicrousd: allocated + reservedMicrousd, expiresAt,
        });
        return { requestKey, userKey, globalKey, ownerToken, reservedMicrousd, pricing: {
          inputMicrousdPerMillionTokens: config.inputMicrousdPerMillionTokens,
          outputMicrousdPerMillionTokens: config.outputMicrousdPerMillionTokens,
        } };
      }));
    },

    markDispatching(reservation: DesignerAiReservation): Promise<void> {
      return safely(() => db.runTransaction(async tx => {
        const record = admissionRecord((await tx.get(reference(reservation.requestKey))).data());
        if (!record || record.ownerToken !== reservation.ownerToken || record.state !== "reserved" ||
            nonnegativeCounter(record.leaseUntilMs) <= now()) {
          throw new DesignerAiAdmissionError("reservation_invalid");
        }
        tx.update(reference(reservation.requestKey), { state: "dispatching", dispatchedAtMs: now() });
      }));
    },

    settle(reservation: DesignerAiReservation, settlement: DesignerAiSettlement): Promise<void> {
      return safely(() => db.runTransaction(async tx => {
        const [requestSnap, userSnap, globalSnap] = await Promise.all([
          tx.get(reference(reservation.requestKey)), tx.get(reference(reservation.userKey)), tx.get(reference(reservation.globalKey)),
        ]);
        const request = admissionRecord(requestSnap.data());
        if (!request || request.ownerToken !== reservation.ownerToken) throw new DesignerAiAdmissionError("reservation_invalid");
        if (request.state === "settled") return; // Idempotent completion; an unknown result is never auto-refunded later.
        if (!["succeeded", "failed", "unknown"].includes(settlement.outcome)) throw new DesignerAiAdmissionError("invalid_request");
        const reserved = nonnegativeCounter(request.reservedMicrousd);
        let charged = reserved;
        if (settlement.usageComplete === true && settlement.outcome !== "unknown") {
          charged = nonnegativeCounter(settlement.actualMicrousd);
          if (charged > reserved) throw new DesignerAiAdmissionError("accounting_unavailable");
        }
        const allocated = nonnegativeCounter(admissionRecord(globalSnap.data())?.allocatedMicrousd);
        const refund = reserved - charged;
        if (allocated < refund) throw new DesignerAiAdmissionError("accounting_unavailable");
        tx.update(reference(reservation.requestKey), {
          state: "settled", outcome: settlement.outcome, chargedMicrousd: charged, settledAtMs: now(),
        });
        if (refund) tx.update(reference(reservation.globalKey), { allocatedMicrousd: allocated - refund });
        if (admissionRecord(userSnap.data())?.activeRequestKey === reservation.requestKey) {
          tx.update(reference(reservation.userKey), { activeRequestKey: null, activeUntilMs: 0 });
        }
      }));
    },
  };
}
