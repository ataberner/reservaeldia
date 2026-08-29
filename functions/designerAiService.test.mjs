import test from "node:test";
import assert from "node:assert/strict";
import {
  DESIGNER_AI_CONTRACT_VERSION,
  sanitizeCapabilitySnapshot,
} from "../shared/designerAiCapabilityContract.js";
import serviceModule from "./lib/designerAi/service.js";

const {
  buildDesignerAiClientCompatibilityResponse,
  buildDesignerAiConversationBrief,
  buildDesignerAiErrorDetails,
  discardModelResolutionsForControlVerifiedLeaves,
  DesignerAiServiceError,
  createDesignerAiOpenAiClient,
  interpretDesignerAiChat,
  validateDesignerAiChatPayload,
  validateDesignerAiModelResult,
} = serviceModule;

function guidedBlockForLeaf(id, fallback) {
  if (id.startsWith("event.people.")) return "names";
  if (id === "event.mode") return "event_structure";
  if (id.startsWith("event.ceremony.") || id.startsWith("event.party.")) return "event_data";
  if (id.startsWith("gifts.")) return "gifts";
  if (id.startsWith("event.dress_code.")) return "dress_code";
  if (id === "media.cover") return "cover";
  if (id.startsWith("media.gallery.") && !id.endsWith(".order")) return "galleries";
  return fallback === "outside_guided_flow" ? fallback : "outside_guided_flow";
}

const leaf = (id, block, status = "pending", provenance = "unknown") => ({
  id,
  block: guidedBlockForLeaf(id, block),
  status,
  provenance,
  rule: null,
  fingerprint: `fp-${id}`,
});

function snapshot({ values = {}, leaves = null, namePolicy = "unknown" } = {}) {
  const snapshotLeaves = leaves || [
    leaf("document.name", "outside_guided_flow", "pending", "placeholder_or_sample"),
    leaf("event.people.primary_name", "names"),
    leaf("event.people.secondary_name", "names"),
    leaf("event.mode", "event_structure"),
    leaf("event.ceremony.date", "event_data"),
    leaf("event.ceremony.start_time", "event_data"),
    leaf("event.ceremony.address", "event_data"),
    leaf("event.dress_code.enabled", "dress_code"),
    leaf("rsvp.enabled", "outside_guided_flow"),
    leaf("gifts.enabled", "gifts"),
  ];
  return sanitizeCapabilitySnapshot({
    revision: "rev-1",
    availability: {
      documentName: true,
      people: true,
      eventMode: true,
      ceremonyDatetime: true,
      partyDatetime: true,
      ceremonyLocation: true,
      partyLocation: true,
      dressCode: true,
      story: true,
      cover: true,
      gallery: false,
      rsvp: true,
      gifts: true,
    },
    values: {
      documentName: "",
      people: { primaryName: "", secondaryName: "" },
      eventMode: "single",
      ...values,
    },
    ledger: {
      version: 2,
      leaves: snapshotLeaves,
      guidedFlow: {
        leafIds: snapshotLeaves
          .filter((entry) => entry.block !== "outside_guided_flow")
          .map((entry) => entry.id),
      },
    },
    conversation: {
      usage: { hasStarted: false },
      namePolicy: { mode: namePolicy, lastAutomaticName: "" },
    },
  });
}

function payload(overrides = {}) {
  return {
    contractVersion: DESIGNER_AI_CONTRACT_VERSION,
    clientMessageId: "message-1",
    entryMode: "continuation",
    message: "Somos Ana y Luz",
    recentTurns: [],
    capabilitySnapshot: snapshot(),
    ...overrides,
  };
}

function functionResponse(result, requestId = "req_test") {
  return {
    _request_id: requestId,
    output: [{
      type: "function_call",
      name: "submit_designer_ai_result",
      arguments: JSON.stringify(result),
    }],
  };
}

test("validates exact payload and rejects canvas or URL exfiltration", () => {
  assert.equal(validateDesignerAiChatPayload(payload()).message, "Somos Ana y Luz");
  assert.throws(
    () => validateDesignerAiChatPayload(payload({ extra: true })),
    (error) => error instanceof DesignerAiServiceError && error.kind === "invalid-payload"
  );
  assert.throws(
    () => validateDesignerAiChatPayload(payload({ entryMode: "guessed_from_messages" })),
    (error) => error instanceof DesignerAiServiceError && error.kind === "invalid-payload"
  );
  assert.throws(
    () => validateDesignerAiChatPayload(payload({
      capabilitySnapshot: { ...snapshot(), values: { objetos: [{ src: "https://private.example" }] } },
    })),
    (error) => error instanceof DesignerAiServiceError && error.kind === "invalid-payload"
  );
});

test("every incompatible client version receives a safe reload response instead of an invalid payload", () => {
  const compatibility = buildDesignerAiClientCompatibilityResponse(
    {
      ...payload(),
      contractVersion: "2.0.0",
      entryMode: undefined,
    },
    () => "legacy-reload-1"
  );
  assert.deepEqual(compatibility, {
    contractVersion: "2.0.0",
    batchId: "legacy-reload-1",
    intent: "clarify",
    assistantMessage: "Actualizamos Diseñador AI. Recargá la página para continuar con la nueva versión.",
    actions: [],
    resolutions: [],
    controlRequest: null,
  });
  assert.equal(
    buildDesignerAiClientCompatibilityResponse(payload(), () => "unused"),
    null
  );
  assert.equal(
    buildDesignerAiClientCompatibilityResponse(
      { ...payload(), contractVersion: "2.1.0" },
      () => "legacy-reload-2"
    )?.contractVersion,
    "2.1.0"
  );
  assert.equal(
    buildDesignerAiClientCompatibilityResponse(
      { ...payload(), contractVersion: "1.0.0" },
      () => "legacy-reload-3"
    )?.contractVersion,
    "1.0.0"
  );
  assert.equal(
    buildDesignerAiClientCompatibilityResponse(
      { ...payload(), contractVersion: "9.0.0" },
      () => "future-reload"
    )?.contractVersion,
    "9.0.0"
  );
  assert.equal(
    buildDesignerAiClientCompatibilityResponse(
      { ...payload(), contractVersion: "" },
      () => "unused"
    ),
    null
  );
});

test("builds the next semantic block from unresolved leaves, not aggregate coverage", () => {
  const brief = buildDesignerAiConversationBrief(snapshot({
    leaves: [
      leaf("event.people.primary_name", "names", "resolved_from_user", "user_current_session"),
      leaf("event.people.secondary_name", "names"),
      leaf("event.ceremony.date", "event_data"),
      leaf("event.ceremony.start_time", "event_data"),
    ],
  }));
  assert.equal(brief.nextBlock.id, "names");
  assert.deepEqual(brief.nextBlock.leafIds, ["event.people.secondary_name"]);
  assert.deepEqual(brief.needsAttention[1].leafIds, ["event.ceremony.date", "event.ceremony.start_time"]);
  const complete = buildDesignerAiConversationBrief(snapshot({
    leaves: [leaf("event.mode", "event_structure", "resolved_from_user", "user_current_session")],
  }));
  assert.equal(complete.complete, true);
  assert.deepEqual(complete.needsAttention, []);
});

test("interprets one strict call, extracts several data points and sends no private context", async () => {
  let requestBody = null;
  const client = {
    responses: {
      create: async (body) => {
        requestBody = body;
        return functionResponse({
          intent: "apply",
          assistantMessage: "Listo, ya quedó a nombre de Ana y Luz. ¿Cuándo y dónde es la ceremonia?",
          actions: [
            { type: "event.set_people", arguments: { primaryName: "Ana", secondaryName: "Luz" } },
            { type: "event.set_mode", arguments: { mode: "ceremony_party" } },
            { type: "event.set_dress_code", arguments: { enabled: true, value: "Elegante sport" } },
          ],
          controlRequest: null,
          resolutions: [],
        });
      },
    },
  };
  const ids = ["trace-1", "batch-1"];
  const result = await interpretDesignerAiChat({
    payload: payload({
      entryMode: "first_entry",
      message: "Somos Ana y Luz, hay ceremonia y fiesta y vamos de elegante sport.",
    }),
    client,
    userContext: { registeredFirstName: "Agus" },
    now: (() => { let value = 100; return () => value += 10; })(),
    createId: () => ids.shift(),
  });
  assert.equal(result.batchId, "batch-1");
  assert.equal(result.repairCount, 0);
  assert.equal(result.actions.length, 4);
  assert.deepEqual(result.actions.at(-1), {
    type: "document.set_name",
    arguments: { name: "Casamiento Ana y Luz" },
  });
  assert.equal(result.resolutions.some((item) => item.leafId === "document.name" && item.rule === "automatic_event_name"), true);
  assert.equal(requestBody.model, "gpt-5.6-luna");
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.parallel_tool_calls, false);
  assert.equal(requestBody.previous_response_id, undefined);
  const instructions = requestBody.input[0].content;
  assert.match(instructions, /TODAS las hojas disponibles/);
  assert.match(instructions, /No hagas un formulario/);
  assert.match(instructions, /Extraé toda información válida espontánea/);
  assert.match(instructions, /Preguntá de forma directa por el siguiente dato necesario/);
  assert.match(instructions, /No ofrezcas proactivamente dejarlo para después/);
  assert.match(instructions, /dejá la hoja pendiente, no insistas ni repitas inmediatamente la pregunta/);
  assert.match(instructions, /acompañamiento natural; no encadenes preguntas secas, mecánicas o repetitivas/);
  assert.match(instructions, /avanzá transitoriamente a otro dato aplicable sin marcarla como resuelta/);
  assert.match(instructions, /Ceremony y Party tienen hojas de ubicación independientes/);
  assert.match(instructions, /si event_data todavía contiene hojas de ubicación/);
  assert.match(instructions, /no avances a Regalos/);
  assert.match(instructions, /no preguntes a la vez por la dirección y por Google Maps/);
  assert.match(instructions, /Las hojas con estado resolved_by_control ya tienen evidencia local terminal/);
  assert.match(instructions, /guidedFlow\.completion\.complete/);
  assert.match(instructions, /RSVP queda disponible solo ante un pedido explícito/);
  assert.match(instructions, /cambiar, agregar, eliminar o reordenar fotos no completa la etapa/);
  assert.match(instructions, /media\.gallery\.\{galleryId\}\.guided_completion/);
  assert.match(instructions, /el slot solo define el foco inicial del control y nunca la completitud/);
  assert.match(instructions, /No abras varias Galleries a la vez ni saltees a otra/);
  assert.match(instructions, /Si identifica otra Gallery, continuá naturalmente con esa única Gallery/);
  assert.match(requestBody.input[1].content, /Prioridad conversacional derivada/);
  assert.match(requestBody.input[1].content, /"entryMode":"first_entry"/);
  assert.match(requestBody.input[1].content, /"registeredFirstName":"Agus"/);
  const serialized = JSON.stringify(requestBody);
  assert.equal(serialized.includes("objetos"), false);
  assert.equal(serialized.includes("private.example"), false);
  assert.equal(serialized.includes("contentRevision"), false);
  assert.equal(serialized.includes('"fingerprint":'), false);
});

test("passes reentry and the safe no-name fallback as trusted minimal context", async () => {
  let requestBody = null;
  const client = {
    responses: {
      create: async (body) => {
        requestBody = body;
        return functionResponse({
          intent: "clarify",
          assistantMessage: "Podemos seguir por los nombres. ¿Cómo se llaman?",
          actions: [],
          controlRequest: null,
          resolutions: [],
        });
      },
    },
  };
  await interpretDesignerAiChat({
    payload: payload({ entryMode: "reentry" }),
    client,
    userContext: { registeredFirstName: null },
  });
  assert.match(requestBody.input[0].content, /Si entryMode es reentry/);
  assert.match(requestBody.input[1].content, /"entryMode":"reentry"/);
  assert.match(requestBody.input[1].content, /"registeredFirstName":""/);
});

test("does not expose template examples to the model and replaces their title from real names", async () => {
  let requestBody = null;
  const client = {
    responses: {
      create: async (body) => {
        requestBody = body;
        return functionResponse({
          intent: "apply",
          assistantMessage: "Listo, ya quedaron sus nombres. ¿Cuándo y dónde es la ceremonia?",
          actions: [
            { type: "event.set_people", arguments: { primaryName: "Ana", secondaryName: "Luz" } },
          ],
          controlRequest: null,
          resolutions: [],
        });
      },
    },
  };
  const result = await interpretDesignerAiChat({
    payload: payload({
      message: "Somos Ana y Luz",
      capabilitySnapshot: snapshot({
        values: {
          documentName: "Casamiento Mica y Juani",
          people: { primaryName: "Mica", secondaryName: "Juani" },
          ceremony: {
            date: "2027-04-10",
            startTime: "18:00",
            endTime: "",
            venueName: "Salón de muestra",
            address: "Calle Demo 123",
            placeSelected: false,
          },
        },
        leaves: [
          leaf("document.name", "couple", "pending", "template_value"),
          leaf("event.people.primary_name", "couple", "pending", "template_value"),
          leaf("event.people.secondary_name", "couple", "pending", "template_value"),
          leaf("event.ceremony.date", "ceremony", "pending", "template_value"),
          leaf("event.ceremony.start_time", "ceremony", "pending", "template_value"),
          leaf("event.ceremony.venue_name", "ceremony", "pending", "placeholder_or_sample"),
          leaf("event.ceremony.address", "ceremony", "pending", "template_value"),
        ],
      }),
    }),
    client,
    createId: (() => {
      const ids = ["trace-template", "batch-template"];
      return () => ids.shift();
    })(),
  });

  const modelContext = requestBody.input[1].content;
  assert.equal(modelContext.includes("Mica"), false);
  assert.equal(modelContext.includes("Juani"), false);
  assert.equal(modelContext.includes("Calle Demo 123"), false);
  assert.equal(modelContext.includes("2027-04-10"), false);
  assert.match(requestBody.input[0].content, /Tratálos como vacíos/);
  assert.deepEqual(result.actions.at(-1), {
    type: "document.set_name",
    arguments: { name: "Casamiento Ana y Luz" },
  });
  assert.equal(result.resolutions.some((item) => item.leafId === "document.name" && item.rule === "automatic_event_name"), true);
});

test("keeps an explicit document name authoritative and does not append the rule action", () => {
  const result = validateDesignerAiModelResult({
    intent: "apply",
    assistantMessage: "Perfecto, la invitación se llama Nuestra fiesta.",
    actions: [
      { type: "event.set_people", arguments: { primaryName: "Ana", secondaryName: "Luz" } },
      { type: "document.set_name", arguments: { name: "Nuestra fiesta" } },
    ],
    controlRequest: null,
    resolutions: [],
  }, snapshot());
  assert.equal(result.actions.filter((action) => action.type === "document.set_name").length, 1);
  assert.equal(result.actions.find((action) => action.type === "document.set_name").arguments.name, "Nuestra fiesta");
});

test("does not overwrite an unknown nonempty name with the automatic rule", () => {
  const result = validateDesignerAiModelResult({
    intent: "apply",
    assistantMessage: "Perfecto, ya quedaron los nombres.",
    actions: [{ type: "event.set_people", arguments: { primaryName: "Ana", secondaryName: "Luz" } }],
    controlRequest: null,
    resolutions: [],
  }, snapshot({
    values: { documentName: "Nuestra celebración" },
    leaves: [
      leaf("document.name", "couple", "pending", "unknown"),
      leaf("event.people.primary_name", "couple"),
      leaf("event.people.secondary_name", "couple"),
    ],
  }));
  assert.equal(result.actions.some((action) => action.type === "document.set_name"), false);
});

test("derives the automatic name when both names were already trustworthy", () => {
  const result = validateDesignerAiModelResult({
    intent: "apply",
    assistantMessage: "Bien, dejamos elegante sport.",
    actions: [{ type: "event.set_dress_code", arguments: { enabled: true, value: "Elegante sport" } }],
    controlRequest: null,
    resolutions: [],
  }, snapshot({
    values: {
      documentName: "Borgoña · Floral contemporánea",
      people: { primaryName: "Ana", secondaryName: "Luz" },
    },
    leaves: [
      leaf("document.name", "couple", "pending", "placeholder_or_sample"),
      leaf("event.people.primary_name", "couple", "resolved_from_existing_user_data", "existing_user_data"),
      leaf("event.people.secondary_name", "couple", "resolved_from_existing_user_data", "existing_user_data"),
      leaf("event.dress_code.enabled", "guest_info"),
      leaf("event.dress_code.value", "guest_info"),
    ],
  }));
  assert.equal(result.actions.some((action) => action.type === "document.set_name" && action.arguments.name === "Casamiento Ana y Luz"), true);
});

test("accepts natural out-of-scope output and rejects generic canvas mutations", () => {
  const out = validateDesignerAiModelResult({
    intent: "out_of_scope",
    assistantMessage: "Ese cambio de tipografía se hace desde el editor. Por acá seguimos con los datos de la invitación.",
    actions: [],
    controlRequest: null,
    resolutions: [],
  }, snapshot());
  assert.equal(out.intent, "out_of_scope");
  assert.throws(
    () => validateDesignerAiModelResult({
      intent: "apply",
      assistantMessage: "Moví el elemento.",
      actions: [{ type: "canvas.update_object", arguments: { id: "x", x: 10 } }],
      controlRequest: null,
      resolutions: [],
    }, snapshot()),
    (error) => error instanceof DesignerAiServiceError && error.kind === "malformed-output"
  );
});

test("keeps partial event data and normalizes clarify with valid actions to apply", () => {
  const result = validateDesignerAiModelResult({
    intent: "clarify",
    assistantMessage: "Anoté la fecha y el lugar. ¿A qué hora comienza?",
    actions: [
      {
        type: "event.set_datetime",
        arguments: {
          phase: "ceremony",
          date: "2027-07-29",
          startTime: null,
          endTime: null,
        },
      },
      {
        type: "event.set_location_text",
        arguments: {
          phase: "ceremony",
          venueName: "Friendly",
          address: "De la Vidalita 499",
        },
      },
    ],
    controlRequest: null,
    resolutions: [{
      leafId: "event.ceremony.start_time",
      status: "needs_clarification",
      rule: null,
    }],
  }, snapshot({
    leaves: [
      leaf("event.ceremony.date", "event_data"),
      leaf("event.ceremony.start_time", "event_data"),
      leaf("event.ceremony.end_time", "event_data"),
      leaf("event.ceremony.venue_name", "event_data"),
      leaf("event.ceremony.address", "event_data"),
    ],
  }));

  assert.equal(result.intent, "apply");
  assert.deepEqual(result.actions.map((action) => action.type), [
    "event.set_datetime",
    "event.set_location_text",
  ]);
  assert.match(result.assistantMessage, /hora comienza/i);
});

test("keeps location and time supplied together while leaving the Google Maps decision pending", () => {
  const result = validateDesignerAiModelResult({
    intent: "apply",
    assistantMessage: "Anoté el lugar y el horario. ¿Querés buscar este lugar en Google Maps?",
    actions: [
      {
        type: "event.set_location_text",
        arguments: {
          phase: "ceremony",
          venueName: "Salón Los Robles",
          address: "Av. Ejemplo 1234",
        },
      },
      {
        type: "event.set_datetime",
        arguments: {
          phase: "ceremony",
          date: null,
          startTime: "18:00",
          endTime: null,
        },
      },
    ],
    controlRequest: null,
    resolutions: [{
      leafId: "event.ceremony.place_selection",
      status: "needs_clarification",
      rule: null,
    }],
  }, snapshot({
    leaves: [
      leaf("event.ceremony.start_time", "event_data"),
      leaf("event.ceremony.venue_name", "event_data"),
      leaf("event.ceremony.address", "event_data"),
      leaf("event.ceremony.place_selection", "event_data"),
    ],
  }));

  assert.deepEqual(result.actions.map((action) => action.type), [
    "event.set_location_text",
    "event.set_datetime",
  ]);
  assert.equal(result.controlRequest, null);
  assert.deepEqual(result.resolutions, [{
    leafId: "event.ceremony.place_selection",
    status: "needs_clarification",
    rule: null,
  }]);
});

test("keeps only the provided venue and does not resolve an absent address", () => {
  const result = validateDesignerAiModelResult({
    intent: "apply",
    assistantMessage: "Anoté el lugar. ¿Querés buscarlo en Google Maps?",
    actions: [{
      type: "event.set_location_text",
      arguments: {
        phase: "ceremony",
        venueName: "Salón Los Robles",
        address: "",
      },
    }],
    controlRequest: null,
    resolutions: [{
      leafId: "event.ceremony.place_selection",
      status: "needs_clarification",
      rule: null,
    }],
  }, snapshot({
    leaves: [
      leaf("event.ceremony.venue_name", "event_data"),
      leaf("event.ceremony.address", "event_data"),
      leaf("event.ceremony.place_selection", "event_data"),
    ],
  }));

  assert.equal(result.actions[0].arguments.address, "");
  assert.equal(
    result.resolutions.some((resolution) => resolution.leafId === "event.ceremony.address"),
    false
  );
});

test("allows the Google Places control only after an explicit acceptance", () => {
  const result = validateDesignerAiModelResult({
    intent: "apply",
    assistantMessage: "Abramos la búsqueda para que elijas el resultado correcto.",
    actions: [],
    controlRequest: { type: "google_place_picker", phase: "ceremony" },
    resolutions: [],
  }, snapshot({
    leaves: [
      leaf("event.ceremony.venue_name", "event_data", "resolved_from_existing_user_data", "existing_user_data"),
      leaf("event.ceremony.address", "event_data", "resolved_from_existing_user_data", "existing_user_data"),
      leaf("event.ceremony.place_selection", "event_data"),
    ],
    values: {
      ceremony: {
        venueName: "Salón Los Robles",
        address: "Av. Ejemplo 1234",
        placeSelected: false,
      },
    },
  }));

  assert.deepEqual(result.controlRequest, {
    type: "google_place_picker",
    phase: "ceremony",
  });
  assert.deepEqual(result.actions, []);
});

test("drops redundant model resolutions for a location already verified by its local control", () => {
  const verifiedSnapshot = snapshot({
    leaves: [
      leaf(
        "event.ceremony.place_selection",
        "event_data",
        "resolved_by_control",
        "user_current_session"
      ),
      leaf("gifts.enabled", "gifts"),
    ],
    values: {
      ceremony: {
        venueName: "Friendly",
        address: "De la Vidalita 499",
        placeSelected: true,
      },
    },
  });
  assert.deepEqual(discardModelResolutionsForControlVerifiedLeaves([{
    leafId: "event.ceremony.place_selection",
    status: "resolved_from_user",
    rule: null,
  }], verifiedSnapshot), []);

  const result = validateDesignerAiModelResult({
    intent: "clarify",
    assistantMessage: "La ubicación quedó guardada. ¿Quieren incluir una sección de regalos?",
    actions: [],
    controlRequest: null,
    resolutions: [{
      leafId: "event.ceremony.place_selection",
      status: "resolved_from_user",
      rule: null,
    }],
  }, verifiedSnapshot);
  assert.deepEqual(result.resolutions, []);
});

test("repairs one malformed structured output before returning an error to the chat", async () => {
  const calls = [];
  const locationSnapshot = snapshot({
    leaves: [
      leaf("event.ceremony.place_selection", "event_data"),
      leaf("event.ceremony.address", "event_data"),
    ],
    values: {
      ceremony: {
        venueName: "Friendly",
        address: "",
        placeSelected: false,
      },
    },
  });
  const client = {
    responses: {
      create: async (body) => {
        calls.push(body);
        if (calls.length === 1) {
          return functionResponse({
            intent: "clarify",
            assistantMessage: "¿Querés buscarlo en Google Maps?",
            actions: [],
            controlRequest: null,
            resolutions: [{
              leafId: "event.ceremony.place_selection",
              status: "resolved_from_user",
              rule: null,
            }],
          }, "req-invalid");
        }
        return functionResponse({
          intent: "clarify",
          assistantMessage: "¿Querés buscar Friendly en Google Maps o cargar la dirección manualmente?",
          actions: [],
          controlRequest: null,
          resolutions: [{
            leafId: "event.ceremony.place_selection",
            status: "needs_clarification",
            rule: null,
          }],
        }, "req-repaired");
      },
    },
  };
  const result = await interpretDesignerAiChat({
    payload: payload({ capabilitySnapshot: locationSnapshot }),
    client,
  });
  assert.equal(calls.length, 2);
  assert.equal(result.repairCount, 1);
  assert.equal(result.openAiRequestId, "req-repaired");
  assert.match(calls[1].input.at(-1).content, /salida anterior fue rechazada/);
  assert.match(calls[1].input.at(-1).content, /No resuelvas hojas ya terminales ni inventes evidencia/);
  assert.equal(result.resolutions[0].status, "needs_clarification");
});

test("records a Google Maps rejection without inventing provider metadata", () => {
  const result = validateDesignerAiModelResult({
    intent: "apply",
    assistantMessage: "Perfecto, usamos el lugar y la dirección que me pasaste.",
    actions: [],
    controlRequest: null,
    resolutions: [{
      leafId: "event.ceremony.place_selection",
      status: "resolved_by_rule",
      rule: "leave_empty",
    }],
  }, snapshot({
    leaves: [
      leaf("event.ceremony.venue_name", "event_data", "resolved_from_existing_user_data", "existing_user_data"),
      leaf("event.ceremony.address", "event_data", "resolved_from_existing_user_data", "existing_user_data"),
      leaf("event.ceremony.place_selection", "event_data"),
    ],
    values: {
      ceremony: {
        venueName: "Salón Los Robles",
        address: "Av. Ejemplo 1234",
        placeSelected: false,
      },
    },
  }));

  assert.deepEqual(result.resolutions, [{
    leafId: "event.ceremony.place_selection",
    status: "resolved_by_rule",
    rule: "leave_empty",
  }]);
  assert.equal(result.controlRequest, null);
});

test("rejects cross-phase location completion without executable evidence", () => {
  const doubleEventSnapshot = snapshot({
    leaves: [
      leaf("event.ceremony.venue_name", "event_data"),
      leaf("event.ceremony.address", "event_data"),
      leaf("event.ceremony.place_selection", "event_data"),
      leaf("event.party.venue_name", "event_data", "resolved_from_existing_user_data", "existing_user_data"),
      leaf("event.party.address", "event_data", "resolved_from_existing_user_data", "existing_user_data"),
      leaf("event.party.place_selection", "event_data"),
      leaf("gifts.enabled", "gifts"),
    ],
    values: {
      eventMode: "ceremony_party",
      ceremony: { venueName: "", address: "", placeSelected: false },
      party: { venueName: "Estancia", address: "Ruta 8", placeSelected: false },
    },
  });

  assert.throws(
    () => validateDesignerAiModelResult({
      intent: "apply",
      assistantMessage: "Perfecto, confirmé los dos lugares. ¿Quieren incluir Regalos?",
      actions: [],
      controlRequest: { type: "google_place_picker", phase: "party" },
      resolutions: [
        { leafId: "event.ceremony.venue_name", status: "resolved_from_user", rule: null },
        { leafId: "event.ceremony.address", status: "resolved_from_user", rule: null },
      ],
    }, doubleEventSnapshot),
    (error) => error instanceof DesignerAiServiceError &&
      error.kind === "malformed-output" &&
      /event\.ceremony\.venue_name no tiene una action ejecutable/.test(error.message)
  );

  const valid = validateDesignerAiModelResult({
    intent: "apply",
    assistantMessage: "Elegí el resultado correcto para la fiesta y después seguimos con lo pendiente.",
    actions: [],
    controlRequest: { type: "google_place_picker", phase: "party" },
    resolutions: [],
  }, doubleEventSnapshot);
  assert.deepEqual(valid.controlRequest, { type: "google_place_picker", phase: "party" });
  assert.equal(valid.resolutions.length, 0);
});

test("keeps a partial date action and fails closed only incompatible per-leaf rules", () => {
  const result = validateDesignerAiModelResult({
    intent: "clarify",
    assistantMessage: "Anoté la fecha. ¿A qué hora comienza y dónde se realiza?",
    actions: [{
      type: "event.set_datetime",
      arguments: {
        phase: "ceremony",
        date: "2027-07-29",
        startTime: null,
        endTime: null,
      },
    }],
    controlRequest: null,
    resolutions: [
      {
        leafId: "event.ceremony.end_time",
        status: "resolved_by_rule",
        rule: "optional_end_time_omitted",
      },
      {
        leafId: "event.ceremony.start_time",
        status: "resolved_by_rule",
        rule: "optional_end_time_omitted",
      },
      {
        leafId: "event.ceremony.address",
        status: "resolved_by_rule",
        rule: "optional_venue_name_omitted",
      },
    ],
  }, snapshot({
    leaves: [
      leaf("event.ceremony.date", "event_data"),
      leaf("event.ceremony.start_time", "event_data"),
      leaf("event.ceremony.end_time", "event_data"),
      leaf("event.ceremony.address", "event_data"),
    ],
  }));

  assert.equal(result.intent, "apply");
  assert.equal(result.actions[0].arguments.date, "2027-07-29");
  assert.deepEqual(result.resolutions, [{
    leafId: "event.ceremony.end_time",
    status: "resolved_by_rule",
    rule: "optional_end_time_omitted",
  }]);
});

test("returns safe error context and a reference without exposing raw payloads", () => {
  const details = buildDesignerAiErrorDetails(
    new DesignerAiServiceError(
      "malformed-output",
      "clarify no puede ejecutar acciones ni controles."
    ),
    "trace-safe-123"
  );
  assert.deepEqual(details, {
    category: "invalid_model_output",
    summary: "La respuesta del modelo no cumplió el formato o las validaciones esperadas.",
    retryable: true,
    referenceId: "trace-safe-123",
  });
  assert.doesNotMatch(JSON.stringify(details), /clarify no puede/);
});

test("preserve_while_inactive is valid only when the effective owner is disabled", () => {
  const activeSnapshot = snapshot({
    values: { rsvp: { enabled: true, questions: [] } },
    leaves: [
      leaf("rsvp.enabled", "rsvp", "resolved_from_user", "user_current_session"),
      leaf("rsvp.modal.title", "rsvp"),
    ],
  });
  const resolution = {
    leafId: "rsvp.modal.title",
    status: "resolved_by_rule",
    rule: "preserve_while_inactive",
  };
  assert.throws(
    () => validateDesignerAiModelResult({
      intent: "apply",
      assistantMessage: "Dejamos la confirmación como está.",
      actions: [],
      controlRequest: null,
      resolutions: [resolution],
    }, activeSnapshot),
    (error) => error instanceof DesignerAiServiceError && error.kind === "malformed-output"
  );
  const disabled = validateDesignerAiModelResult({
    intent: "apply",
    assistantMessage: "Listo, no mostramos confirmación.",
    actions: [{ type: "rsvp.set_enabled", arguments: { enabled: false } }],
    controlRequest: null,
    resolutions: [resolution],
  }, activeSnapshot);
  assert.equal(disabled.actions[0].arguments.enabled, false);
});

test("rejects unknown leaf resolutions and multiple function calls", async () => {
  assert.throws(
    () => validateDesignerAiModelResult({
      intent: "apply",
      assistantMessage: "Listo.",
      actions: [],
      controlRequest: null,
      resolutions: [{ leafId: "canvas.color", status: "resolved_from_user", rule: null }],
    }, snapshot()),
    (error) => error instanceof DesignerAiServiceError && error.kind === "malformed-output"
  );
  const validResult = {
    intent: "clarify",
    assistantMessage: "¿A qué hora empieza?",
    actions: [],
    controlRequest: null,
    resolutions: [{ leafId: "event.ceremony.start_time", status: "needs_clarification", rule: null }],
  };
  let malformedCallCount = 0;
  const client = { responses: { create: async () => {
    malformedCallCount += 1;
    return { output: [functionResponse(validResult).output[0], functionResponse(validResult).output[0]] };
  } } };
  await assert.rejects(
    interpretDesignerAiChat({ payload: payload(), client }),
    (error) => error instanceof DesignerAiServiceError && error.kind === "malformed-output"
  );
  assert.equal(malformedCallCount, 2, "solo se permite una reparación semántica");
});

test("maps timeout and rate limit errors and requires the private secret", async () => {
  for (const [error, expectedKind] of [
    [Object.assign(new Error("slow"), { name: "APIConnectionTimeoutError" }), "timeout"],
    [Object.assign(new Error("limit"), { status: 429 }), "rate-limit"],
  ]) {
    const client = { responses: { create: async () => { throw error; } } };
    await assert.rejects(
      interpretDesignerAiChat({ payload: payload(), client }),
      (caught) => caught instanceof DesignerAiServiceError && caught.kind === expectedKind
    );
  }
  assert.throws(
    () => createDesignerAiOpenAiClient(""),
    (error) => error instanceof DesignerAiServiceError && error.kind === "missing-secret"
  );
});
