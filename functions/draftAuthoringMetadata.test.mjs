import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  buildDraftTemplateAuthoringMetadata,
  normalizeDetachedVisualsMetadata,
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

test("draft authoring metadata upgrades v1 and round-trips normalized detached visuals", () => {
  const metadata = buildDraftTemplateAuthoringMetadata({
    templateId: "tpl-story",
    uid: "user-1",
    template: {
      templateAuthoringDraft: {
        version: 1,
        sourceTemplateId: "tpl-story",
        fieldsSchema: [
          {
            key: "story_text",
            type: "textarea",
            applyTargets: [],
          },
        ],
        defaults: { story_text: "Historia" },
        detachedVisuals: {
          version: 3,
          nextSequence: 1,
          entries: [
            {
              id: "story-detached",
              sequence: 6,
              fieldKeys: ["story_text", "story_text"],
              object: { id: "story-view", tipo: "texto", texto: "Historia" },
              targets: [
                {
                  fieldKey: "story_text",
                  target: {
                    scope: "objeto",
                    id: "story-view",
                    path: "texto",
                  },
                },
              ],
              source: {
                kind: "root",
                rootId: "story-view",
                rootIndex: 2,
                sectionId: "story",
              },
            },
          ],
        },
      },
    },
  });

  assert.equal(metadata.version, 2);
  assert.deepEqual(metadata.fieldsSchema[0].applyTargets, []);
  assert.deepEqual(metadata.detachedVisuals, {
    version: 1,
    nextSequence: 7,
    entries: [
      {
        id: "story-detached",
        sequence: 6,
        fieldKeys: ["story_text"],
        object: { id: "story-view", tipo: "texto", texto: "Historia" },
        targets: [
          {
            fieldKey: "story_text",
            target: {
              scope: "objeto",
              id: "story-view",
              path: "texto",
              mode: "set",
            },
          },
        ],
        source: {
          kind: "root",
          rootId: "story-view",
          rootIndex: 2,
          sectionId: "story",
        },
      },
    ],
  });
});

test("functions detached metadata preserves implicit views without targets", () => {
  const normalized = normalizeDetachedVisualsMetadata(
    {
      nextSequence: 1,
      entries: [
        {
          id: "implicit-map",
          sequence: 3,
          fieldKeys: ["ceremony_address", "ceremony_address"],
          object: { id: "map-view", tipo: "mapa", x: 25 },
          targets: [],
          source: {
            kind: "event-map",
            rootId: "map-view",
            rootIndex: 2,
            sectionId: "ceremony",
          },
        },
        {
          id: "missing-field",
          sequence: 8,
          fieldKeys: [],
          object: { id: "orphan-view", tipo: "mapa" },
          targets: [],
        },
      ],
    },
    [{ key: "ceremony_address", type: "text", applyTargets: [] }]
  );

  assert.deepEqual(normalized, {
    version: 1,
    nextSequence: 4,
    entries: [
      {
        id: "implicit-map",
        sequence: 3,
        fieldKeys: ["ceremony_address"],
        object: { id: "map-view", tipo: "mapa", x: 25 },
        targets: [],
        source: {
          kind: "event-map",
          rootId: "map-view",
          rootIndex: 2,
          sectionId: "ceremony",
        },
      },
    ],
  });
});

test("functions detached metadata normalizes date text presets like the shared contract", () => {
  const normalized = normalizeDetachedVisualsMetadata(
    {
      entries: [
        {
          id: "date-view",
          sequence: 1,
          fieldKeys: ["event_date", "event_datetime"],
          object: { id: "date-text", tipo: "texto" },
          targets: [
            {
              fieldKey: "event_date",
              target: {
                scope: "objeto",
                id: "date-text",
                path: "texto",
                transform: { kind: "date_to_text", preset: "invalid-preset" },
              },
            },
            {
              fieldKey: "event_datetime",
              target: {
                scope: "objeto",
                id: "date-text",
                path: "texto",
                transform: { kind: "date_to_text" },
              },
            },
          ],
        },
      ],
    },
    [
      { key: "event_date", type: "date" },
      { key: "event_datetime", type: "datetime" },
    ]
  );

  assert.equal(
    normalized.entries[0].targets[0].target.transform.preset,
    "event_date_long_es_ar"
  );
  assert.equal(
    normalized.entries[0].targets[1].target.transform.preset,
    "event_datetime_long_es_ar"
  );
});

test("functions detached metadata omits invalid group child indexes", () => {
  const normalized = normalizeDetachedVisualsMetadata(
    {
      entries: [
        {
          id: "group-child-view",
          sequence: 1,
          fieldKeys: ["story"],
          object: { id: "story-text", tipo: "texto" },
          targets: [],
          source: {
            kind: "group-child",
            rootId: "group",
            rootIndex: 3,
            childIndex: "not-an-index",
            sectionId: "story",
          },
        },
      ],
    },
    [{ key: "story", type: "textarea" }]
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      normalized.entries[0].source,
      "childIndex"
    ),
    false
  );
});

test("functions detached metadata rejects entries against non-canonical raw schema keys", () => {
  const normalized = normalizeDetachedVisualsMetadata(
    {
      entries: [
        {
          id: "raw-field-view",
          sequence: 1,
          fieldKeys: ["Field With Space"],
          object: { id: "raw-text", tipo: "texto" },
          targets: [
            {
              fieldKey: "Field With Space",
              target: { scope: "objeto", id: "raw-text", path: "texto" },
            },
          ],
        },
      ],
    },
    [{ key: "Field With Space", type: "text" }]
  );

  assert.deepEqual(normalized.entries, []);
});

test("functions detached metadata keeps only the newest presentation per field", () => {
  const normalized = normalizeDetachedVisualsMetadata(
    {
      entries: [
        {
          id: "older-shared",
          sequence: 2,
          fieldKeys: ["name", "address"],
          object: { id: "older", tipo: "texto" },
          targets: [
            { fieldKey: "name", target: { scope: "objeto", id: "older", path: "texto" } },
            { fieldKey: "address", target: { scope: "objeto", id: "older", path: "texto" } },
          ],
        },
        {
          id: "newer-name",
          sequence: 4,
          fieldKeys: ["name"],
          object: { id: "newer", tipo: "texto" },
          targets: [
            { fieldKey: "name", target: { scope: "objeto", id: "newer", path: "texto" } },
          ],
        },
      ],
    },
    [
      { key: "name", type: "text", applyTargets: [] },
      { key: "address", type: "text", applyTargets: [] },
    ]
  );

  assert.deepEqual(
    normalized.entries.map(({ id, fieldKeys, targets }) => ({
      id,
      fieldKeys,
      targetFields: targets.map((target) => target.fieldKey),
    })),
    [
      {
        id: "older-shared",
        fieldKeys: ["address"],
        targetFields: ["address"],
      },
      {
        id: "newer-name",
        fieldKeys: ["name"],
        targetFields: ["name"],
      },
    ]
  );
});
