import { isTransientDashboardAuthError } from "../../lib/auth/dashboardAuthRecovery.js";

// Firestore errors omit the functions/auth namespace. Permission failures keep
// their existing terminal behavior; recovery never grants access locally.
export function isTransientDashboardReadError(error) {
  return isTransientDashboardAuthError(error) || [
    "unavailable",
    "deadline-exceeded",
  ].includes(error?.code);
}
