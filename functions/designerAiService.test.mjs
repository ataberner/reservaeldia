import test from "node:test";
import assert from "node:assert/strict";
import {
  DESIGNER_AI_CONTRACT_VERSION,
  sanitizeCapabilitySnapshot,
} from "../shared/designerAiCapabilityContract.js";
import serviceModule from "./lib/designerAi/service.js";

const {
  buildDesignerAiConversationBrief,
  DesignerAiServiceError,
  createDesignerAiOpenAiClient,
  interpretDesignerAiChat,
  validateDesignerAiChatPayload,
  validateDesignerAiModelResult,
} = serviceModule;

const leaf = (id, block, status = "pending", provenance = "unknown") => ({
  id,
  block,
  status,
  provenance,
  rule: null,
  fingerprint: `fp-${id}`,
});

function snapshot({ values = {}, leaves = null, namePolicy = "unknown" } = {}) {
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
      version: 1,
      leaves: leaves || [
        leaf("document.name", "couple", "pending", "placeholder_or_sample"),
        leaf("event.people.primary_name", "couple"),
        leaf("event.people.secondary_name", "couple"),
        leaf("event.mode", "couple"),
        leaf("event.ceremony.date", "ceremony"),
        leaf("event.ceremony.start_time", "ceremony"),
        leaf("event.ceremony.address", "ceremony"),
        leaf("event.dress_code.enabled", "guest_info"),
        leaf("rsvp.enabled", "rsvp"),
        leaf("gifts.enabled", "gifts"),
      ],
    },
    conversation: { namePolicy: { mode: namePolicy, lastAutomaticName: "" } },
  });
}

function payload(overrides = {}) {
  return {
    contractVersion: DESIGNER_AI_CONTRACT_VERSION,
    clientMessageId: "message-1",
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
    () => validateDesignerAiChatPayload(payload({
      capabilitySnapshot: { ...snapshot(), values: { objetos: [{ src: "https://private.example" }] } },
    })),
    (error) => error instanceof DesignerAiServiceError && error.kind === "invalid-payload"
  );
});

test("builds the next semantic block from unresolved leaves, not aggregate coverage", () => {
  const brief = buildDesignerAiConversationBrief(snapshot({
    leaves: [
      leaf("event.people.primary_name", "couple", "resolved_from_user", "user_current_session"),
      leaf("event.people.secondary_name", "couple"),
      leaf("event.ceremony.date", "ceremony"),
      leaf("event.ceremony.start_time", "ceremony"),
    ],
  }));
  assert.equal(brief.nextBlock.id, "couple");
  assert.deepEqual(brief.nextBlock.leafIds, ["event.people.secondary_name"]);
  assert.deepEqual(brief.needsAttention[1].leafIds, ["event.ceremony.date", "event.ceremony.start_time"]);
  const complete = buildDesignerAiConversationBrief(snapshot({
    leaves: [leaf("event.mode", "couple", "resolved_from_user", "user_current_session")],
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
    payload: payload({ message: "Somos Ana y Luz, hay ceremonia y fiesta y vamos de elegante sport." }),
    client,
    now: (() => { let value = 100; return () => value += 10; })(),
    createId: () => ids.shift(),
  });
  assert.equal(result.batchId, "batch-1");
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
  assert.match(instructions, /Cerrá únicamente/);
  assert.match(requestBody.input[1].content, /Prioridad conversacional derivada/);
  const serialized = JSON.stringify(requestBody);
  assert.equal(serialized.includes("objetos"), false);
  assert.equal(serialized.includes("private.example"), false);
  assert.equal(serialized.includes("contentRevision"), false);
  assert.equal(serialized.includes("fingerprint"), false);
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
  const client = { responses: { create: async () => ({ output: [functionResponse(validResult).output[0], functionResponse(validResult).output[0]] }) } };
  await assert.rejects(
    interpretDesignerAiChat({ payload: payload(), client }),
    (error) => error instanceof DesignerAiServiceError && error.kind === "malformed-output"
  );
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
