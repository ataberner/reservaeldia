import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCountdownTargetIsoFromLocalParts,
  buildDynamicCountdownEventDetails,
  buildDynamicCountdownProjectionPatches,
  collectCountdownObjects,
  collectDynamicCountdownBindings,
  findDynamicCountdownBinding,
  isCountdownVisible,
  mergeCountdownTargetLocalParts,
  resolveCanonicalCountdownTargetIso,
  splitCountdownTargetIso,
} from "./countdownEventDetails.js";

test("detects the first date-like dynamic field targeting countdown fechaObjetivo", () => {
  const fieldsSchema = [
    {
      key: "event_date",
      type: "date",
      applyTargets: [
        {
          scope: "objeto",
          id: "countdown-main",
          path: "fechaObjetivo",
        },
      ],
    },
    {
      key: "event_datetime",
      type: "datetime",
      applyTargets: [
        {
          scope: "objeto",
          id: "countdown-secondary",
          path: "fechaObjetivo",
        },
      ],
    },
  ];
  const objetos = [
    { id: "countdown-main", tipo: "countdown" },
    { id: "countdown-secondary", tipo: "countdown" },
  ];

  const binding = findDynamicCountdownBinding({ fieldsSchema, objetos });

  assert.equal(binding.fieldKey, "event_date");
  assert.equal(binding.fieldType, "date");
  assert.equal(binding.countdownId, "countdown-main");
});

test("ignores fields without a valid countdown fechaObjetivo target", () => {
  const fieldsSchema = [
    {
      key: "event_title",
      type: "text",
      applyTargets: [{ scope: "objeto", id: "countdown-main", path: "fechaObjetivo" }],
    },
    {
      key: "event_date_wrong_path",
      type: "date",
      applyTargets: [{ scope: "objeto", id: "countdown-main", path: "texto" }],
    },
    {
      key: "event_date_wrong_object",
      type: "datetime",
      applyTargets: [{ scope: "objeto", id: "title-main", path: "fechaObjetivo" }],
    },
  ];
  const objetos = [
    { id: "countdown-main", tipo: "countdown" },
    { id: "title-main", tipo: "texto" },
  ];

  assert.equal(findDynamicCountdownBinding({ fieldsSchema, objetos }), null);
});

test("converts local date and time to ISO and splits it back", () => {
  const iso = buildCountdownTargetIsoFromLocalParts({
    date: "2027-03-18",
    time: "19:45",
  });

  assert.match(iso, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(splitCountdownTargetIso(iso), {
    date: "2027-03-18",
    time: "19:45",
  });
});

test("date-only edits preserve the explicit hydrated start time for ceremony and party", () => {
  for (const scenario of [
    { feature: "ceremony", date: "2027-03-18", time: "19:45" },
    { feature: "party", date: "2027-03-19", time: "23:30" },
  ]) {
    const merged = mergeCountdownTargetLocalParts({
      currentTargetValue: `${scenario.date}T00:00:00.000Z`,
      currentDate: scenario.date,
      currentTime: scenario.time,
      patch: { date: "2027-04-12" },
    });

    assert.deepEqual(
      splitCountdownTargetIso(merged.targetISO),
      { date: "2027-04-12", time: scenario.time },
      scenario.feature
    );
  }
});

test("time-only edits and consecutive edits preserve the complementary local part", () => {
  const timeOnly = mergeCountdownTargetLocalParts({
    currentDate: "2027-03-18",
    currentTime: "19:45",
    patch: { time: "20:15" },
  });
  assert.deepEqual(splitCountdownTargetIso(timeOnly.targetISO), {
    date: "2027-03-18",
    time: "20:15",
  });

  const dateOnly = mergeCountdownTargetLocalParts({
    currentTargetValue: timeOnly.targetISO,
    currentDate: timeOnly.date,
    currentTime: timeOnly.time,
    patch: { date: "2027-04-12" },
  });
  const dateThenTime = mergeCountdownTargetLocalParts({
    currentTargetValue: dateOnly.targetISO,
    currentDate: dateOnly.date,
    currentTime: dateOnly.time,
    patch: { time: "21:30" },
  });
  assert.deepEqual(splitCountdownTargetIso(dateThenTime.targetISO), {
    date: "2027-04-12",
    time: "21:30",
  });
});

test("resolves countdown visibility with default visible behavior", () => {
  assert.equal(isCountdownVisible({ tipo: "countdown" }), true);
  assert.equal(
    isCountdownVisible({ tipo: "countdown", mostrarCuentaRegresiva: true }),
    true
  );
  assert.equal(
    isCountdownVisible({ tipo: "countdown", mostrarCuentaRegresiva: false }),
    false
  );
});

test("collects every countdown and binding recursively while preserving the first wrapper", () => {
  const fieldsSchema = [
    {
      key: "event_ceremony_date",
      type: "date",
      applyTargets: [
        {
          scope: "objeto",
          id: "countdown-root",
          path: "fechaObjetivo",
          transform: { kind: "date_to_countdown_iso" },
        },
        {
          scope: "objeto",
          id: "countdown-child",
          path: "fechaObjetivo",
          transform: { kind: "date_to_countdown_iso" },
        },
      ],
    },
  ];
  const objetos = [
    { id: "countdown-root", tipo: "countdown" },
    {
      id: "group",
      tipo: "grupo",
      children: [
        { id: "countdown-child", tipo: "countdown" },
        { id: "not-countdown", tipo: "texto" },
      ],
    },
  ];

  assert.deepEqual(
    collectCountdownObjects(objetos).map(({ id }) => id),
    ["countdown-root", "countdown-child"]
  );
  assert.deepEqual(
    collectDynamicCountdownBindings({ fieldsSchema, objetos }).map(
      ({ countdownId }) => countdownId
    ),
    ["countdown-root", "countdown-child"]
  );
  assert.equal(
    findDynamicCountdownBinding({ fieldsSchema, objetos }).countdownId,
    "countdown-root"
  );
});

test("countdown sidebar details aggregate visibility across every linked view", () => {
  const fieldsSchema = [
    {
      key: "event_ceremony_date",
      type: "date",
      applyTargets: [
        { scope: "objeto", id: "countdown-hidden", path: "fechaObjetivo" },
        { scope: "objeto", id: "countdown-visible", path: "fechaObjetivo" },
        { scope: "objeto", id: "countdown-visible", path: "fechaObjetivo" },
      ],
    },
  ];
  const objetos = [
    {
      id: "countdown-hidden",
      tipo: "countdown",
      fechaObjetivo: "2030-01-01T00:00:00.000Z",
      mostrarCuentaRegresiva: false,
    },
    {
      id: "countdown-visible",
      tipo: "countdown",
      fechaObjetivo: "2030-01-01T00:00:00.000Z",
      mostrarCuentaRegresiva: true,
    },
  ];

  const details = buildDynamicCountdownEventDetails({
    fieldsSchema,
    objetos,
    fieldKey: "event_ceremony_date",
  });

  assert.equal(details.countdownId, "countdown-hidden");
  assert.equal(details.visible, true);
  assert.deepEqual(details.countdownIds, [
    "countdown-hidden",
    "countdown-visible",
  ]);
  assert.equal(details.linkedCount, 2);
  assert.equal(details.visibleCount, 1);
});

test("projects canonical date and start time to every targeted countdown view", () => {
  const fieldsSchema = [
    {
      key: "event_ceremony_date",
      type: "date",
      applyTargets: [
        { scope: "objeto", id: "countdown-a", path: "fechaObjetivo" },
        { scope: "objeto", id: "countdown-b", path: "fechaObjetivo" },
      ],
    },
  ];
  const objetos = [
    { id: "countdown-a", tipo: "countdown", fechaObjetivo: "stale" },
    {
      id: "group",
      tipo: "grupo",
      children: [
        { id: "countdown-b", tipo: "countdown", fechaObjetivo: "stale" },
      ],
    },
  ];

  const patches = buildDynamicCountdownProjectionPatches({
    fieldsSchema,
    objetos,
    fieldKey: "event_ceremony_date",
    values: { event_ceremony_date: "2028-05-09" },
    startTimeByFieldKey: { event_ceremony_date: "19:30" },
  });

  assert.deepEqual(
    patches.map(({ objectId }) => objectId),
    ["countdown-a", "countdown-b"]
  );
  assert.deepEqual(
    patches.map(({ patch }) => splitCountdownTargetIso(patch.fechaObjetivo)),
    [
      { date: "2028-05-09", time: "19:30" },
      { date: "2028-05-09", time: "19:30" },
    ]
  );
});

test("countdown projection accepts explicit canonical values and ignores absent or invalid targets", () => {
  const fieldsSchema = [
    {
      key: "event_party_date",
      type: "date",
      applyTargets: [
        { scope: "objeto", id: "party-countdown", path: "fechaObjetivo" },
        { scope: "objeto", id: "missing-countdown", path: "fechaObjetivo" },
      ],
    },
  ];
  const objetos = [{ id: "party-countdown", tipo: "countdown" }];

  assert.deepEqual(
    splitCountdownTargetIso(
      resolveCanonicalCountdownTargetIso({
        dateValue: "2029-01-15",
        startTime: "23:45",
      })
    ),
    { date: "2029-01-15", time: "23:45" }
  );
  assert.equal(
    buildDynamicCountdownProjectionPatches({
      fieldsSchema,
      objetos,
      dateValue: "not-a-date",
      startTime: "23:45",
    }).length,
    0
  );
  assert.equal(
    buildDynamicCountdownProjectionPatches({
      fieldsSchema,
      objetos: [],
      dateValue: "2029-01-15",
      startTime: "23:45",
    }).length,
    0
  );
});
