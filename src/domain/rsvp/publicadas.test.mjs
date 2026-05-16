import test from "node:test";
import assert from "node:assert/strict";

import {
  adaptRsvpResponse,
  computeAttendanceResponseSummary,
} from "./publicadas.js";

test("computeAttendanceResponseSummary counts only yes and no RSVP responses", () => {
  const rows = [
    { metrics: { attendance: "yes" } },
    { metrics: { attendance: "yes" } },
    { metrics: { attendance: "no" } },
    { metrics: { attendance: "unknown" } },
    {},
  ];

  assert.deepEqual(computeAttendanceResponseSummary(rows), {
    attendingResponses: 2,
    declinedResponses: 1,
  });
});

test("adaptRsvpResponse preserves legacy attendance values for dashboard summaries", () => {
  const rows = [
    adaptRsvpResponse({ id: "one", asistencia: "si", nombre: "A" }),
    adaptRsvpResponse({ id: "two", confirma: false, nombre: "B" }),
    adaptRsvpResponse({
      id: "three",
      version: 2,
      answers: { attendance: "yes", full_name: "C" },
      metrics: { attendance: "yes" },
    }),
  ];

  assert.deepEqual(computeAttendanceResponseSummary(rows), {
    attendingResponses: 2,
    declinedResponses: 1,
  });
});
