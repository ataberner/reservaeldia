import type { Firestore } from "firebase-admin/firestore";
import { createRegistrationDeliveryStore } from "./registrationDeliveryStore";

export type { RegistrationDelivery as WelcomeDelivery,
  RegistrationDeliveryStatus as WelcomeDeliveryStatus,
  RegistrationDeliveryStore as WelcomeDeliveryStore } from "./registrationDeliveryStore";
export { isRegistrationUid as isWelcomeUid } from "./registrationDeliveryStore";

export function createWelcomeDeliveryStore(getDb?: () => Pick<Firestore, "doc">) {
  return createRegistrationDeliveryStore("welcomeEmailDeliveries", getDb);
}
