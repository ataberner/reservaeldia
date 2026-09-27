import { info } from "firebase-functions/logger";
import { isSuperAdmin } from "../auth/adminAuth";
import { emailMode } from "./config";
import { createRegistrationDeliveryStore } from "./registrationDeliveryStore";
import { createRegistrationEmailProcessor, normalizedRegistrationName } from "./registrationEmail";
import type { RegistrationEmailDependencies, RegistrationEmailInput } from "./registrationEmail";
import type { NewUserNotificationEmailData } from "./types";

export function newUserNotificationData({ user, eventTimestamp }: RegistrationEmailInput): NewUserNotificationEmailData {
  const name = normalizedRegistrationName(user.displayName);
  // Multiple linked providers cannot identify the method used for creation.
  const providers = new Set(user.providerData?.map(provider => provider.providerId));
  const onlyProvider = providers.size === 1 ? [...providers][0] : undefined;
  const registrationMethod = onlyProvider === "password" || onlyProvider === "google.com" ? onlyProvider : "unavailable";
  const creationTime = Date.parse(user.creationTime || "");
  const timestamp = Number.isFinite(creationTime) ? creationTime : Date.parse(eventTimestamp || "");
  return { ...(name ? { name } : {}), ...(user.email ? { email: user.email } : {}), registrationMethod,
    ...(Number.isFinite(timestamp) ? { createdAt: new Date(timestamp).toISOString() } : {}) };
}

export function createNewUserNotificationProcessor(dependencies: RegistrationEmailDependencies) {
  return createRegistrationEmailProcessor({
    template: "newUserNotification", correlationPrefix: "new-user-notification",
    errorPrefix: "NEW_USER_NOTIFICATION", requiresUserEmail: false,
    request: (registration, correlationId) => ({ template: "newUserNotification",
      data: newUserNotificationData(registration), metadata: { correlationId } }),
  }, dependencies);
}

export const processNewUserNotification = createNewUserNotificationProcessor({
  store: createRegistrationDeliveryStore("newUserNotificationDeliveries"),
  getMode: () => emailMode.value(), isSuperAdmin,
  log: entry => info("new_user_notification", entry),
});
