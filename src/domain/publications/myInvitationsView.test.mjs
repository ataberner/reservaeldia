import test from "node:test";
import assert from "node:assert/strict";

import {
  buildResponsesCsv,
  computeResponseMetrics,
  filterInvitationRows,
  filterResponseRows,
  paginateItems,
} from "./myInvitationsView.js";

function response(id, name, attendance, partySize = 1, message = "") {
  return {
    id,
    displayName: name,
    answers: {
      attendance,
      party_size: partySize,
      host_message: message,
    },
    metrics: {
      attendance,
      confirmedGuests: attendance === "yes" ? partySize : 0,
    },
    createdAt: new Date("2026-04-30T22:10:00.000Z"),
  };
}

test("filterInvitationRows filters by search and status", () => {
  const rows = [
    { nombre: "Luis y Maria", estado: "Activa", isActive: true },
    { nombre: "Elena - Mis 15", estado: "Pausada", isPaused: true },
    { nombre: "Sofia y Tomas", estado: "Finalizada", isFinalized: true },
  ];

  assert.deepEqual(
    filterInvitationRows(rows, { search: "maria", status: "active" }).map(
      (row) => row.nombre
    ),
    ["Luis y Maria"]
  );
  assert.deepEqual(
    filterInvitationRows(rows, { search: "", status: "paused" }).map(
      (row) => row.nombre
    ),
    ["Elena - Mis 15"]
  );
});

test("filterResponseRows filters by attendance and accent-insensitive search", () => {
  const rows = [
    response("1", "Laura Rodriguez", "yes", 2, "Ahi estaremos"),
    response("2", "Ana Lopez", "no", 0, "No podemos"),
    response("3", "Martin Gonzalez", "unknown", 0, ""),
  ];

  assert.deepEqual(
    filterResponseRows(rows, { attendanceFilter: "confirmed" }).map(
      (row) => row.id
    ),
    ["1"]
  );
  assert.deepEqual(
    filterResponseRows(rows, { search: "ahi", attendanceFilter: "all" }).map(
      (row) => row.id
    ),
    ["1"]
  );
});

test("paginateItems clamps requested pages and reports visible range", () => {
  const result = paginateItems([1, 2, 3, 4, 5], 3, 2);

  assert.deepEqual(result.items, [5]);
  assert.equal(result.page, 3);
  assert.equal(result.totalPages, 3);
  assert.equal(result.startIndex, 4);
  assert.equal(result.endIndex, 5);
});

test("computeResponseMetrics derives confirmed declined and pending counts", () => {
  const rows = [
    response("1", "Laura", "yes", 2),
    response("2", "Ana", "no", 0),
    response("3", "Martin", "unknown", 0),
  ];

  assert.deepEqual(computeResponseMetrics(rows, { invitedCount: 5 }), {
    confirmedResponses: 1,
    declinedResponses: 1,
    pendingResponses: 3,
    confirmedGuests: 2,
    totalResponses: 3,
    totalExpected: 5,
  });

  assert.equal(
    computeResponseMetrics(rows, { invitedCount: 0 }).pendingResponses,
    1
  );
});

test("buildResponsesCsv uses BOM, semicolon separator and escaped cells", () => {
  const rows = [
    response("1", 'Laura "Lu"', "yes", 2, "Ahi; estaremos"),
  ];
  const csv = buildResponsesCsv(rows, [], () => "");

  assert.equal(csv.startsWith("\uFEFFInvitado;Estado;Asistio"), true);
  assert.match(csv, /"Laura ""Lu""";Confirmado;Si;2;/);
  assert.match(csv, /"Ahi; estaremos"/);
});
