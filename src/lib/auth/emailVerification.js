import { sendEmailVerification } from "firebase/auth";

const DEFAULT_CONTINUE_URL = "https://reservaeldia.com.ar/?emailVerified=1";

function resolveContinueUrl() {
  const configured = process.env.NEXT_PUBLIC_VERIFY_EMAIL_CONTINUE_URL;
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/?emailVerified=1`;
  }

  return DEFAULT_CONTINUE_URL;
}

export function getVerificationActionCodeSettings() {
  return {
    url: resolveContinueUrl(),
    handleCodeInApp: false,
  };
}

export async function sendVerificationEmailLocalized(auth, user) {
  if (!auth || !user) {
    throw new Error("Faltan auth/user para enviar verificacion");
  }

  auth.languageCode = "es";
  await sendEmailVerification(user, getVerificationActionCodeSettings());
}
