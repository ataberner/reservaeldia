import test from "node:test";
import assert from "node:assert/strict";

import {
  findFunctionalCtaButtonByType,
  findVisibleFunctionalCtaButtonByType,
  isFunctionalCtaHidden,
  shouldSkipFunctionalCtaDuplicate,
} from "./functionalCtaButtons.js";

test("functional CTA lookup treats hidden grouped buttons as existing but not visible", () => {
  const objetos = [
    {
      id: "group-main",
      tipo: "grupo",
      children: [
        {
          id: "rsvp-preserved",
          tipo: "rsvp-boton",
          hidden: true,
          x: 18,
          y: 32,
        },
      ],
    },
    {
      id: "gift-visible",
      tipo: "regalo-boton",
      hidden: false,
    },
  ];

  const hiddenRsvp = findFunctionalCtaButtonByType(objetos, "rsvp-boton");
  assert.equal(hiddenRsvp?.id, "rsvp-preserved");
  assert.equal(isFunctionalCtaHidden(hiddenRsvp), true);
  assert.equal(findVisibleFunctionalCtaButtonByType(objetos, "rsvp-boton"), null);

  assert.equal(findVisibleFunctionalCtaButtonByType(objetos, "regalo-boton")?.id, "gift-visible");
  assert.equal(shouldSkipFunctionalCtaDuplicate(objetos, { tipo: "rsvp-boton" }), true);
  assert.equal(shouldSkipFunctionalCtaDuplicate(objetos, { tipo: "regalo-boton" }), true);
});
