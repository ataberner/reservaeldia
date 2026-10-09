import { HttpsError, type HttpsFunction } from "firebase-functions/v2/https";

const { DESIGNER_AI_REQUEST_LIMITS, inspectDesignerAiRequestData } = require("../../shared/designerAiCapabilityContract.cjs") as {
  DESIGNER_AI_REQUEST_LIMITS: { maxBytes: number };
  inspectDesignerAiRequestData(value: unknown): { ok: boolean };
};

/**
 * Runs before Firebase's recursive callable decoder. A Proxy retains the SDK's
 * original endpoint/trigger descriptors and callable testing helpers. Invalid
 * bodies are replaced with an empty envelope: the SDK then owns its standard
 * INVALID_ARGUMENT response and CORS without decoding or logging private input.
 * Authentication/App Check for accepted bodies remain exclusively SDK-owned.
 */
export function withDesignerAiRequestBoundary<T extends HttpsFunction>(callable: T): T {
  const run = Reflect.get(callable, "run");
  const guardedRun = typeof run === "function" ? function(this: unknown, ...args: unknown[]) {
    const request = args[0] as { data?: unknown } | undefined;
    if (!inspectDesignerAiRequestData(request?.data).ok) {
      return Promise.reject(new HttpsError("invalid-argument", "El payload es inválido."));
    }
    return Reflect.apply(run, this, args);
  } : run;
  return new Proxy(callable, {
    get(target, property, receiver) {
      return property === "run" ? guardedRun : Reflect.get(target, property, receiver);
    },
    apply(target, thisArgument, argumentsList) {
      const [request] = argumentsList;
      if (request?.method === "POST") {
        const rawBody = request.rawBody;
        const tooLarge = Buffer.isBuffer(rawBody) && rawBody.length > DESIGNER_AI_REQUEST_LIMITS.maxBytes;
        const validData = !tooLarge && inspectDesignerAiRequestData(request.body).ok;
        const body = request.body;
        const validEnvelope = validData && body && !Array.isArray(body) && typeof body === "object" &&
          Object.keys(body).length === 1 && Object.prototype.hasOwnProperty.call(body, "data");
        if (!validEnvelope) {
          request.body = {};
          request.rawBody = Buffer.from("{}");
        }
      }
      return Reflect.apply(target, thisArgument, argumentsList);
    },
  });
}
