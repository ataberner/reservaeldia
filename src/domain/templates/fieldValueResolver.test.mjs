import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCountdownTargetIsoFromLocalParts,
  splitCountdownTargetIso,
} from "../eventDetails/countdownEventDetails.js";
import {
  formatTemplateDateTextValue,
  normalizeCountdownDateValue,
  normalizeTemplateInputValueForFieldType,
} from "./fieldValueResolver.js";

test("countdown normalization preserves an already combined event date and time", () => {
  const combinedValue = buildCountdownTargetIsoFromLocalParts({
    date: "2027-04-12",
    time: "19:45",
  });
  const normalizedValue = normalizeCountdownDateValue(combinedValue);

  assert.deepEqual(splitCountdownTargetIso(normalizedValue), {
    date: "2027-04-12",
    time: "19:45",
  });
  assert.equal(
    normalizeTemplateInputValueForFieldType("date", normalizedValue),
    "2027-04-12"
  );
  assert.equal(
    normalizeTemplateInputValueForFieldType("datetime", normalizedValue),
    "2027-04-12T19:45"
  );
});

test("date and datetime text presets keep their intended date/time projection", () => {
  const combinedValue = buildCountdownTargetIsoFromLocalParts({
    date: "2027-04-12",
    time: "19:45",
  });

  assert.equal(
    formatTemplateDateTextValue(
      combinedValue,
      "event_date_slash_short_year_es_ar",
      "date"
    ),
    "12/4/27"
  );
  assert.equal(
    formatTemplateDateTextValue(
      combinedValue,
      "event_datetime_short_es_ar",
      "date"
    ),
    "12/04/2027, 19:45"
  );
});
