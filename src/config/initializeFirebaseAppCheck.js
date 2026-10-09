// Public site key, restricted to the production Hosting domains in reCAPTCHA.
export const FIREBASE_APP_CHECK_SITE_KEY = "6LfyLuQtAAAAAOuCUIo4yDVLtE5R2A7rupqWaMEd";

export function initializeFirebaseAppCheck(sdk, app, environment, { browser = typeof window !== "undefined" } = {}) {
  if (!browser || environment.mode !== "prod") return null;
  const cacheKey = Symbol.for("reservaeldia.firebase.appCheck");
  if (app[cacheKey]) return app[cacheKey];
  const instance = sdk.initializeAppCheck(app, {
    provider: new sdk.ReCaptchaEnterpriseProvider(FIREBASE_APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
  Object.defineProperty(app, cacheKey, { value: instance });
  return instance;
}
