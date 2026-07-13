import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  buildDraftTemplateAuthoringMetadata,
} = requireBuiltModule("lib/templates/draftAuthoringMetadata.js");

test("draft authoring metadata prefers published templateAuthoringDraft fields and defaults", () => {
  const metadata = buildDraftTemplateAuthoringMetadata({
    templateId: "tpl-boda",
    uid: "user-1",
    updatedAt: "server-time",
    template: {
      fieldsSchema: [
        {
          key: "fallback_name",
          type: "text",
        },
      ],
      defaults: {
        fallback_name: "Fallback",
      },
      templateAuthoringDraft: {
        version: 3,
        sourceTemplateId: "tpl-boda",
        fieldsSchema: [
          {
            key: "event_couple_names_and",
            type: "text",
            eventDetailsRole: "couple_names",
            applyTargets: [
              {
                scope: "objeto",
                id: "names-text",
                path: "texto",
              },
            ],
          },
        ],
        defaults: {
          event_couple_names_and: "Sofia y Mateo",
        },
        status: {
          isReady: true,
          issues: [],
        },
      },
    },
  });

  assert.equal(metadata.version, 3);
  assert.equal(metadata.sourceTemplateId, "tpl-boda");
  assert.deepEqual(metadata.fieldsSchema.map((field) => field.key), [
    "event_couple_names_and",
  ]);
  assert.deepEqual(metadata.defaults, {
    event_couple_names_and: "Sofia y Mateo",
  });
  assert.equal(metadata.updatedAt, "server-time");
  assert.equal(metadata.updatedByUid, "user-1");
});

test("draft authoring metadata falls back to template fieldsSchema and defaults", () => {
  const metadata = buildDraftTemplateAuthoringMetadata({
    templateId: "tpl-boda",
    uid: "user-1",
    template: {
      fieldsSchema: [
        {
          key: "event_ceremony_venue_name",
          type: "text",
          eventDetailsRole: "venue_name",
        },
      ],
      defaults: {
        event_ceremony_venue_name: "Salon Central",
      },
    },
  });

  assert.equal(metadata.sourceTemplateId, "tpl-boda");
  assert.deepEqual(metadata.fieldsSchema.map((field) => field.key), [
    "event_ceremony_venue_name",
  ]);
  assert.deepEqual(metadata.defaults, {
    event_ceremony_venue_name: "Salon Central",
  });
});

test("draft authoring metadata is omitted when the template has no dynamic contract", () => {
  const metadata = buildDraftTemplateAuthoringMetadata({
    templateId: "tpl-simple",
    uid: "user-1",
    template: {
      nombre: "Plantilla simple",
    },
  });

  assert.equal(metadata, null);
});
