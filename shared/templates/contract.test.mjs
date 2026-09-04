import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCatalogFromTemplate,
  normalizeDetachedVisuals,
  normalizeTemplateDocument,
} from "./contract.js";

test("full template normalization preserves editor protected-section markers", () => {
  const normalized = normalizeTemplateDocument(
    {
      id: "template-1",
      nombre: "Template",
      secciones: [
        {
          id: "final",
          orden: 1,
          altura: 180,
          bloqueada: true,
          bloqueoMotivo: "system-final-section",
        },
      ],
    },
    "template-1"
  );

  assert.equal(normalized.secciones[0].bloqueada, true);
  assert.equal(normalized.secciones[0].bloqueoMotivo, "system-final-section");
});

test("template catalog normalization does not expose editor section lock metadata", () => {
  const catalog = buildCatalogFromTemplate({
    id: "template-1",
    nombre: "Template",
    secciones: [
      {
        id: "final",
        orden: 1,
        altura: 180,
        bloqueada: true,
        bloqueoMotivo: "admin-section-lock",
      },
    ],
  });

  assert.equal("secciones" in catalog, false);
});

test("full template normalization preserves the exact cover source but catalog omits it", () => {
  const source = {
    id: "template-cover",
    nombre: "Template cover",
    portada: "https://example.test/template-preview.jpg",
    portadaSource: {
      kind: "canvas-object",
      objectId: "hero-image",
    },
    objetos: [
      {
        id: "hero-image",
        tipo: "imagen",
        src: "https://example.test/canvas-cover.jpg",
      },
    ],
  };

  const normalized = normalizeTemplateDocument(source, source.id);
  const catalog = buildCatalogFromTemplate(source);

  assert.deepEqual(normalized.portadaSource, {
    kind: "canvas-object",
    objectId: "hero-image",
  });
  assert.equal(normalized.portada, source.portada);
  assert.equal("portadaSource" in catalog, false);
});

test("full template normalization rejects an invalid cover source", () => {
  const normalized = normalizeTemplateDocument({
    id: "template-invalid-cover",
    nombre: "Template invalid cover",
    portadaSource: {
      kind: "canvas-object",
      objectId: "",
    },
  });

  assert.equal(normalized.portadaSource, null);
});

test("template normalization preserves date text format presets", () => {
  const normalized = normalizeTemplateDocument(
    {
      id: "template-1",
      nombre: "Template",
      fieldsSchema: [
        {
          key: "event_date",
          label: "Fecha",
          type: "date",
          dateTextFormatPreset: "event_date_slash_short_year_es_ar",
          applyTargets: [
            {
              scope: "objeto",
              id: "date-short",
              path: "texto",
              mode: "set",
              transform: {
                kind: "date_to_text",
                preset: "event_date_slash_short_year_es_ar",
              },
            },
            {
              scope: "objeto",
              id: "date-long",
              path: "texto",
              mode: "set",
              transform: {
                kind: "date_to_text",
                preset: "event_date_long_es_ar",
              },
            },
          ],
        },
      ],
    },
    "template-1"
  );

  const field = normalized.fieldsSchema[0];
  assert.equal(field.dateTextFormatPreset, "event_date_slash_short_year_es_ar");
  assert.deepEqual(
    field.applyTargets.map((target) => target.transform?.preset),
    ["event_date_slash_short_year_es_ar", "event_date_long_es_ar"]
  );
});

test("template contract v2 preserves explicit data-only fields and detached visuals", () => {
  const normalized = normalizeTemplateDocument(
    {
      id: "template-data-only",
      nombre: "Template data only",
      fieldsSchema: [
        {
          key: "story_text",
          label: "Historia",
          type: "textarea",
          group: "Datos principales",
          applyTargets: [],
        },
        {
          key: "legacy_title",
          label: "Titulo legacy",
          type: "text",
          group: "Datos principales",
        },
      ],
      defaults: {
        story_text: "Siempre guardada",
        legacy_title: "Titulo",
      },
      templateAuthoringDraft: {
        version: 1,
        sourceTemplateId: "template-data-only",
        fieldsSchema: [
          {
            key: "story_text",
            label: "Historia",
            type: "textarea",
            group: "Datos principales",
            applyTargets: [],
          },
        ],
        defaults: { story_text: "Siempre guardada" },
        detachedVisuals: {
          version: 7,
          nextSequence: 2,
          entries: [
            {
              id: "detached-story",
              sequence: 4,
              fieldKeys: ["story_text", "story_text", "unknown"],
              object: {
                id: "story-view",
                tipo: "texto",
                texto: "Siempre guardada",
                x: 10,
              },
              targets: [
                {
                  fieldKey: "story_text",
                  target: {
                    scope: "objeto",
                    id: "story-view",
                    path: "texto",
                    transform: { kind: "identity" },
                  },
                },
                {
                  fieldKey: "story_text",
                  target: {
                    scope: "objeto",
                    id: "story-view",
                    path: "texto",
                    transform: { kind: "identity" },
                  },
                },
              ],
              source: {
                kind: "group-child",
                rootId: "story-group",
                rootIndex: 3,
                childIndex: 1,
                sectionId: "hero",
              },
            },
            {
              id: "detached-story",
              sequence: 9,
              object: { id: "duplicate" },
            },
            {
              id: "invalid-object",
              sequence: 8,
              object: null,
            },
          ],
        },
        status: { isReady: true, issues: [] },
      },
    },
    "template-data-only"
  );

  assert.deepEqual(normalized.fieldsSchema[0].applyTargets, []);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      normalized.fieldsSchema[1],
      "applyTargets"
    ),
    false
  );
  assert.equal(normalized.templateAuthoringDraft.version, 2);
  assert.deepEqual(
    normalized.templateAuthoringDraft.fieldsSchema[0].applyTargets,
    []
  );
  assert.deepEqual(normalized.templateAuthoringDraft.detachedVisuals, {
    version: 1,
    nextSequence: 5,
    entries: [
      {
        id: "detached-story",
        sequence: 4,
        fieldKeys: ["story_text"],
        object: {
          id: "story-view",
          tipo: "texto",
          texto: "Siempre guardada",
          x: 10,
        },
        targets: [
          {
            fieldKey: "story_text",
            target: {
              scope: "objeto",
              id: "story-view",
              path: "texto",
              mode: "set",
              transform: { kind: "identity" },
            },
          },
        ],
        source: {
          kind: "group-child",
          rootId: "story-group",
          rootIndex: 3,
          childIndex: 1,
          sectionId: "hero",
        },
      },
    ],
  });
});

test("detached visuals preserve implicit views without targets and reject entries without fields", () => {
  const normalized = normalizeDetachedVisuals(
    {
      version: 9,
      nextSequence: 1,
      entries: [
        {
          id: "implicit-map",
          sequence: 3,
          fieldKeys: ["ceremony_address", "ceremony_address"],
          object: { id: "map-view", tipo: "mapa", x: 25, y: 40 },
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
          source: { kind: "event-map" },
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
        object: { id: "map-view", tipo: "mapa", x: 25, y: 40 },
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

test("detached visuals retain only the newest recoverable entry for each field", () => {
  const normalized = normalizeDetachedVisuals(
    {
      nextSequence: 12,
      entries: [
        {
          id: "older-shared-view",
          sequence: 4,
          fieldKeys: ["story", "date"],
          object: { id: "older", tipo: "texto" },
          targets: [
            {
              fieldKey: "story",
              target: { scope: "objeto", id: "older", path: "texto" },
            },
            {
              fieldKey: "date",
              target: { scope: "objeto", id: "older", path: "texto" },
            },
          ],
          source: { kind: "root" },
        },
        {
          id: "newer-story-view",
          sequence: 9,
          fieldKeys: ["story"],
          object: { id: "newer", tipo: "texto" },
          targets: [
            {
              fieldKey: "story",
              target: { scope: "objeto", id: "newer", path: "texto" },
            },
          ],
          source: { kind: "root" },
        },
      ],
    },
    [
      { key: "story", type: "textarea", applyTargets: [] },
      { key: "date", type: "date", applyTargets: [] },
    ]
  );

  assert.deepEqual(
    normalized.entries.map((entry) => ({
      id: entry.id,
      fieldKeys: entry.fieldKeys,
      targetFields: entry.targets.map((target) => target.fieldKey),
    })),
    [
      {
        id: "older-shared-view",
        fieldKeys: ["date"],
        targetFields: ["date"],
      },
      {
        id: "newer-story-view",
        fieldKeys: ["story"],
        targetFields: ["story"],
      },
    ]
  );
  assert.equal(normalized.nextSequence, 12);
});

test("detached combined-name visuals retain both sidebar dependencies without inventing targets", () => {
  const normalized = normalizeDetachedVisuals(
    {
      nextSequence: 3,
      entries: [
        {
          id: "combined-names",
          sequence: 2,
          fieldKeys: [
            "event_couple_names_ampersand",
            "event_primary_person_name",
            "event_secondary_person_name",
          ],
          object: { id: "names", tipo: "texto", texto: "" },
          targets: [
            {
              fieldKey: "event_couple_names_ampersand",
              target: { scope: "objeto", id: "names", path: "texto" },
            },
          ],
          source: { kind: "root", rootId: "names", rootIndex: 0 },
        },
      ],
    },
    [
      { key: "event_primary_person_name", applyTargets: [] },
      { key: "event_secondary_person_name", applyTargets: [] },
      { key: "event_couple_names_ampersand", applyTargets: [] },
    ]
  );

  assert.deepEqual(normalized.entries[0].fieldKeys, [
    "event_couple_names_ampersand",
    "event_primary_person_name",
    "event_secondary_person_name",
  ]);
  assert.deepEqual(
    normalized.entries[0].targets.map((record) => record.fieldKey),
    ["event_couple_names_ampersand"]
  );
});
