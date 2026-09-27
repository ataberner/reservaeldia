import { info } from "firebase-functions/logger";
import { isSuperAdmin } from "../auth/adminAuth";
import { emailMode, WELCOME_DASHBOARD_URL } from "./config";
import { createWelcomeDeliveryStore } from "./welcomeDeliveryStore";
import { createRegistrationEmailProcessor, normalizedRegistrationName } from "./registrationEmail";
import type { RegistrationEmailDependencies } from "./registrationEmail";

export type { RegistrationEmailInput as WelcomeRegistration,
  RegistrationEmailResult as WelcomeRegistrationResult } from "./registrationEmail";

export function createWelcomeRegistrationProcessor(dependencies: RegistrationEmailDependencies) {
  return createRegistrationEmailProcessor({
    template: "welcome", correlationPrefix: "welcome", errorPrefix: "WELCOME", requiresUserEmail: true,
    request: ({ user }, correlationId) => {
      const name = normalizedRegistrationName(user.displayName);
      return { template: "welcome", to: user.email!,
        data: { ...(name ? { name } : {}), dashboardUrl: WELCOME_DASHBOARD_URL },
        metadata: { correlationId } };
    },
  }, dependencies);
}

export const processWelcomeRegistration = createWelcomeRegistrationProcessor({
  store: createWelcomeDeliveryStore(), getMode: () => emailMode.value(), isSuperAdmin,
  log: entry => info("welcome_registration", entry),
});
