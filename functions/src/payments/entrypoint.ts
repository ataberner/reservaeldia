import { onCall, onRequest } from "firebase-functions/v2/https";
import { mercadoPagoAccessToken, mercadoPagoWebhookSecret } from "./mercadoPagoClient";
import {
  createPublicationCheckoutSessionHandler,
  createPublicationPaymentHandler,
  processMercadoPagoWebhookRequest,
} from "./publicationPayments";

// Keep effective options explicit: this entrypoint also runs without index.ts
// and must not change global options for other modules importing these exports.
export const createPublicationCheckoutSession = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    cpu: "gcf_gen1",
    secrets: [mercadoPagoAccessToken],
  },
  async (request) => createPublicationCheckoutSessionHandler(request)
);

export const createPublicationPayment = onCall(
  {
    region: "us-central1",
    memory: "1GiB",
    timeoutSeconds: 60,
    cpu: 1,
    concurrency: 1,
    secrets: [mercadoPagoAccessToken],
  },
  async (request) => createPublicationPaymentHandler(request)
);

export const mercadoPagoWebhook = onRequest(
  {
    region: "us-central1",
    memory: "1GiB",
    timeoutSeconds: 60,
    cpu: 1,
    concurrency: 1,
    secrets: [mercadoPagoAccessToken, mercadoPagoWebhookSecret],
  },
  async (req, res) => processMercadoPagoWebhookRequest(req, res)
);
