// Deployment authority for email only. Runtime/template imports stay lazy in adapters.
export { testTransactionalEmail } from "./testEmailFunction";
export { testWelcomeEmail } from "./welcomeEmailTestFunction";
export { onUserCreatedWelcomeEmail } from "./welcomeRegistrationFunction";
