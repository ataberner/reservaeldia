import test from "node:test";
import assert from "node:assert/strict";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";
import { adaptRsvpResponse } from "../src/domain/rsvp/publicadas.js";
import { computeResponseMetrics } from "../src/domain/publications/myInvitationsView.js";

const { readUserDirectoryPublicationMetrics } = requireBuiltModule("lib/users/publicationMetrics.js");

function fixture(overrides = {}) {
  const reads = { responses: 0, visits: 0 };
  return {
    reads,
    params: {
      data: { rsvp: { enabled: true } },
      historical: false,
      readResponses: async () => { reads.responses += 1; return []; },
      readVisits: async () => { reads.visits += 1; return { totalVisits: 8, uniqueVisits: 3 }; },
      ...overrides,
    },
  };
}

test("active RSVP counts match Mis invitaciones for version 2 and legacy answers", async () => {
  const rows = [
    { version: 2, answers: { attendance: "yes", party_size: 7, full_name: "Private" } },
    { version: 2, answers: { attendance: "yes" }, metrics: { attendance: "no" } },
    { version: 2, answers: { attendance: "sí" }, metrics: { attendance: "invalid" } },
    { confirma: true },
    { confirmado: false },
    { asistencia: "SI" },
    { asistencia: "no" },
    { answers: { attendance: "yes" } },
    { version: 2, answers: { attendance: false }, confirma: true },
    { metrics: { attendance: 0 } },
    {},
  ];
  const { params } = fixture({ readResponses: async () => rows });
  const result = await readUserDirectoryPublicationMetrics(params);
  const dashboard = computeResponseMetrics(rows.map((row) => adaptRsvpResponse(row)));
  assert.deepEqual(result, {
    hasEnabledRsvp: true,
    responseMetrics: { confirmedResponses: 5, declinedResponses: 4 },
    visitMetrics: { status: "ready", totalVisits: 8, uniqueVisits: 3 },
  });
  assert.equal(result.responseMetrics.confirmedResponses, dashboard.confirmedResponses);
  assert.equal(result.responseMetrics.declinedResponses, dashboard.declinedResponses);
  assert.equal(JSON.stringify(result).includes("Private"), false);
  assert.equal(Object.hasOwn(result, "answers"), false);
});

test("RSVP is omitted without configuration or when disabled, but legacy objects are enabled", async () => {
  for (const [rsvp, enabled] of [[null, false], [undefined, false], [{ enabled: false }, false], [{}, true]]) {
    const { params, reads } = fixture({ data: { rsvp } });
    const result = await readUserDirectoryPublicationMetrics(params);
    assert.equal(result.hasEnabledRsvp, enabled);
    assert.equal(reads.responses, enabled ? 1 : 0);
    assert.equal(reads.visits, 1);
    assert.deepEqual(result.responseMetrics, enabled ? { confirmedResponses: 0, declinedResponses: 0 } : null);
  }
});

test("expired and historical publications use snapshots without reading live collections", async () => {
  const { params, reads } = fixture({
    historical: true,
    data: {
      rsvp: {},
      rsvpSummary: { confirmados: "3", noAsisten: 2, confirmedGuests: 12 },
      visitSummary: { schemaVersion: 1, totalVisits: 14, uniqueVisits: 6 },
    },
  });
  assert.deepEqual(await readUserDirectoryPublicationMetrics(params), {
    hasEnabledRsvp: true,
    responseMetrics: { confirmedResponses: 3, declinedResponses: 2 },
    visitMetrics: { status: "ready", totalVisits: 14, uniqueVisits: 6 },
  });
  assert.deepEqual(reads, { responses: 0, visits: 0 });
});

test("historic missing visits are unavailable and valid empty snapshots remain zero", async () => {
  for (const visitSummary of [undefined, null, {}, { schemaVersion: 2, totalVisits: 10 }]) {
    const { params } = fixture({ historical: true, data: { rsvp: {}, visitSummary } });
    const result = await readUserDirectoryPublicationMetrics(params);
    assert.deepEqual(result.visitMetrics, { status: "unavailable", totalVisits: null, uniqueVisits: null });
    assert.deepEqual(result.responseMetrics, { confirmedResponses: 0, declinedResponses: 0 });
  }
  const { params } = fixture({ historical: true, data: { visitSummary: { schemaVersion: 1, totalVisits: 0, uniqueVisits: 0 } } });
  assert.deepEqual((await readUserDirectoryPublicationMetrics(params)).visitMetrics, { status: "ready", totalVisits: 0, uniqueVisits: 0 });
});

test("snapshot counts use dashboard rounding, aliases, and upper bound for unique visits", async () => {
  const { params } = fixture({
    historical: true,
    data: {
      rsvp: {},
      rsvpSummary: { confirmedResponses: -2, confirmados: 99, declinedResponses: 2.6 },
      visitSummary: { schemaVersion: 1, totalVisits: "4.6", uniqueVisits: 9 },
    },
  });
  const result = await readUserDirectoryPublicationMetrics(params);
  assert.deepEqual(result.responseMetrics, { confirmedResponses: 0, declinedResponses: 3 });
  assert.deepEqual(result.visitMetrics, { status: "ready", totalVisits: 5, uniqueVisits: 5 });
});

test("independent read failures never become zero counts or discard successful metrics", async () => {
  const fail = async () => { throw new Error("Synthetic read failure"); };
  const responseFailure = fixture({ readResponses: fail });
  const first = await readUserDirectoryPublicationMetrics(responseFailure.params);
  assert.equal(first.responseMetrics, null);
  assert.deepEqual(first.visitMetrics, { status: "ready", totalVisits: 8, uniqueVisits: 3 });
  const visitFailure = fixture({ readVisits: fail });
  const second = await readUserDirectoryPublicationMetrics(visitFailure.params);
  assert.deepEqual(second.responseMetrics, { confirmedResponses: 0, declinedResponses: 0 });
  assert.deepEqual(second.visitMetrics, { status: "error", totalVisits: null, uniqueVisits: null });
});
