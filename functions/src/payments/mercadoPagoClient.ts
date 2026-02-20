import { MercadoPagoConfig, Payment, Preference } from "mercadopago";

function readRequiredEnv(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Falta variable de entorno requerida: ${name}`);
  }
  return value;
}

let cachedClient: MercadoPagoConfig | null = null;

export function getMercadoPagoClient(): MercadoPagoConfig {
  if (cachedClient) return cachedClient;

  const accessToken = readRequiredEnv("MERCADO_PAGO_ACCESS_TOKEN");
  cachedClient = new MercadoPagoConfig({
    accessToken,
    options: {
      timeout: 10000,
      idempotencyKey: undefined,
    },
  });

  return cachedClient;
}

export function getMercadoPagoPaymentClient(): Payment {
  return new Payment(getMercadoPagoClient());
}

export function getMercadoPagoPreferenceClient(): Preference {
  return new Preference(getMercadoPagoClient());
}

export function getMercadoPagoPublicKey(): string {
  return readRequiredEnv("MERCADO_PAGO_PUBLIC_KEY");
}

export function getMercadoPagoWebhookSecret(): string {
  return readRequiredEnv("MP_WEBHOOK_SECRET");
}

export function getMercadoPagoWebhookUrl(): string {
  const explicit = String(process.env.MERCADO_PAGO_WEBHOOK_URL || "").trim();
  if (explicit) return explicit;
  return "https://us-central1-reservaeldia-7a440.cloudfunctions.net/mercadoPagoWebhook";
}
