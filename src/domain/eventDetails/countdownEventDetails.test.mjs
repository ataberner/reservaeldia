import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCountdownTargetIsoFromLocalParts,
  findDynamicCountdownBinding,
  isCountdownVisible,
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
