import { processWelcomeRegistration } from "./welcomeRegistration";
import { processNewUserNotification } from "./newUserNotification";
import type { RegistrationEmailInput } from "./registrationEmail";

type Processor = (registration: RegistrationEmailInput) => Promise<unknown>;

export function createRegistrationEmailsProcessor(dependencies: {
  welcome: Processor;
  internal: Processor;
}) {
  return async (registration: RegistrationEmailInput): Promise<void> => {
    // Wait for BOTH effects even if one fails before reserving. Existing records
    // protect the successful effect when the platform retries the event.
    const outcomes = await Promise.allSettled([
      Promise.resolve().then(() => dependencies.welcome(registration)),
      Promise.resolve().then(() => dependencies.internal(registration)),
    ]);
    if (outcomes.some(outcome => outcome.status === "rejected")) {
      throw new Error("REGISTRATION_EMAILS_FAILED");
    }
  };
}

export const processRegistrationEmails = createRegistrationEmailsProcessor({
  welcome: processWelcomeRegistration, internal: processNewUserNotification,
});
