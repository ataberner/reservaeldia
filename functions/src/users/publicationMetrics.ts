const { normalizeRsvpConfig } = require("../../shared/rsvpConfig.cjs");
const { resolveRsvpResponseAttendance } = require("../../shared/rsvpResponseMetrics.cjs");

type UnknownRecord = Record<string, unknown>;
type ResponseMetrics = { confirmedResponses: number; declinedResponses: number };
type VisitCounts = { totalVisits: number; uniqueVisits: number };

export type UserDirectoryPublicationMetrics = {
  hasEnabledRsvp: boolean;
  responseMetrics: ResponseMetrics | null;
  visitMetrics: {
    status: "ready" | "unavailable" | "error";
    totalVisits: number | null;
    uniqueVisits: number | null;
  };
};

function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {};
}

export async function readUserDirectoryPublicationMetrics(params: {
  data: UnknownRecord;
  historical: boolean;
  readResponses(): Promise<UnknownRecord[]>;
  readVisits(): Promise<VisitCounts>;
}): Promise<UserDirectoryPublicationMetrics> {
  const { data, historical } = params;
  const hasEnabledRsvp = Boolean(
    data.rsvp && typeof data.rsvp === "object" &&
      normalizeRsvpConfig(data.rsvp, { forceEnabled: false }).enabled === true
  );

  const responseRead = async (): Promise<ResponseMetrics | null> => {
    if (!hasEnabledRsvp) return null;
    if (historical) {
      const summary = asRecord(data.rsvpSummary);
      return {
        confirmedResponses: toNonNegativeInteger(summary.confirmedResponses ?? summary.confirmados),
        declinedResponses: toNonNegativeInteger(summary.declinedResponses ?? summary.noAsisten),
      };
    }
    try {
      const rows = await params.readResponses();
      const metrics = { confirmedResponses: 0, declinedResponses: 0 };
      rows.forEach((row) => {
        const attendance = resolveRsvpResponseAttendance(row);
        if (attendance === "yes") metrics.confirmedResponses += 1;
        if (attendance === "no") metrics.declinedResponses += 1;
      });
      return metrics;
    } catch {
      return null;
    }
  };

  const visitRead = async (): Promise<UserDirectoryPublicationMetrics["visitMetrics"]> => {
    let counts: UnknownRecord;
    if (historical) {
      counts = asRecord(data.visitSummary);
      if (counts.schemaVersion !== 1) {
        return { status: "unavailable", totalVisits: null, uniqueVisits: null };
      }
    } else {
      try {
        counts = await params.readVisits();
      } catch {
        return { status: "error", totalVisits: null, uniqueVisits: null };
      }
    }
    const totalVisits = toNonNegativeInteger(counts.totalVisits);
    return {
      status: "ready",
      totalVisits,
      uniqueVisits: Math.min(toNonNegativeInteger(counts.uniqueVisits), totalVisits),
    };
  };

  const [responseMetrics, visitMetrics] = await Promise.all([responseRead(), visitRead()]);
  return { hasEnabledRsvp, responseMetrics, visitMetrics };
}
