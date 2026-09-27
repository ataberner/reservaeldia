import { region } from "firebase-functions/v1";
import type { EventContext, auth } from "firebase-functions/v1";
import { error as logError } from "firebase-functions/logger";
import { awsSesAccessKeyId, awsSesSecretAccessKey, emailMode, resolveEmailMode, WELCOME_SERVICE_ACCOUNT } from "./config";
import type { WelcomeRegistration } from "./welcomeRegistration";

async function processRegistration(registration: WelcomeRegistration): Promise<unknown> {
  // Discovery declares only the trigger and bindings. No renderer, store or SES runtime.
  const { processWelcomeRegistration } = await import("./welcomeRegistration");
  return processWelcomeRegistration(registration);
}

export function createWelcomeRegistrationHandler(process = processRegistration) {
  return async (user: auth.UserRecord, context: EventContext): Promise<void> => {
    try {
      await process({
        user: { uid: user.uid, email: user.email, displayName: user.displayName,
          disabled: user.disabled, customClaims: user.customClaims, creationTime: user.metadata.creationTime },
        sourceEventId: context.eventId,
      });
    } catch {
      // The processor owns correlation/reservation logs. A load/adapter failure may
      // occur before that context exists: never invent a zero-attempt guarantee here.
      try {
        logError("welcome_registration_adapter", { template: "welcome", userId: user?.uid ?? null,
          sourceEventId: context?.eventId ?? null, correlationId: null,
          mode: resolveEmailMode(emailMode.value()), state: "processor_failed",
          attempts: null, messageId: null, errorCode: "WELCOME_REGISTRATION_FAILED" });
      } catch { /* observability cannot suppress the platform retry */ }
      // onCreate is asynchronous, after the account exists; rejection cannot roll it back.
      // Platform retry is safe: any existing reservation prevents a second sender call.
      throw new Error("WELCOME_REGISTRATION_FAILED");
    }
  };
}

export const onUserCreatedWelcomeEmail = region("us-central1").runWith({
  serviceAccount: WELCOME_SERVICE_ACCOUNT,
  minInstances: 0,
  maxInstances: 2,
  memory: "256MB",
  timeoutSeconds: 60,
  failurePolicy: true,
  secrets: [awsSesAccessKeyId, awsSesSecretAccessKey],
}).auth.user().onCreate(createWelcomeRegistrationHandler());
