import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCountdownTargetIsoFromLocalParts,
  findDynamicCountdownBinding,
  isCountdownVisible,
  mergeCountdownTargetLocalParts,
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
