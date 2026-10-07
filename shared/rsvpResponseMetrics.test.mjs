import test from "node:test";
import assert from "node:assert/strict";
import metrics from "./rsvpResponseMetrics.cjs";

const { resolveRsvpResponseAttendance } = metrics;

test("attendance keeps structured metric priority and dashboard legacy fallbacks", () => {
  const cases = [
    [{ metrics: { attendance: "yes" }, confirma: false }, "yes"],
    [{ metrics: { attendance: "unknown" }, version: 2, answers: { attendance: "no" }, confirma: true }, "no"],
    [{ version: 2, answers: { attendance: "" }, confirmado: true }, "yes"],
    [{ version: 2, answers: { attendance: "invalid" }, confirma: true }, "unknown"],
    [{ answers: { attendance: "yes" } }, "unknown"],
    [{ confirma: false, confirmado: true, asistencia: "si" }, "no"],
    [{ confirmado: false }, "no"],
    [{ asistencia: " Sí " }, "yes"],
    [{ asistencia: false }, "no"],
    [{ metrics: { attendance: 1 } }, "yes"],
    [{}, "unknown"],
  ];
  for (const [record, expected] of cases) {
    assert.equal(resolveRsvpResponseAttendance(record), expected);
  }
});
