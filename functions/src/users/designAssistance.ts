import { HttpsError } from "firebase-functions/v2/https";

export type DesignAssistance = { requested: boolean; whatsapp: string | null };

const contract = require("../../shared/profileDesignAssistance.cjs") as {
  validateDesignAssistance(raw: unknown): { value: DesignAssistance | undefined; error: string | null };
  readDesignAssistance(raw: unknown): DesignAssistance;
};

export const readDesignAssistance = contract.readDesignAssistance;

export function parseDesignAssistance(raw: unknown): DesignAssistance | undefined {
  const result = contract.validateDesignAssistance(raw);
  if (result.error) throw new HttpsError("invalid-argument", result.error);
  return result.value;
}
