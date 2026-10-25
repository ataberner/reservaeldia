import { httpsCallable } from "firebase/functions";
import { auth, functions, firebaseEnvironment } from "../../firebase.js";

export async function providerAdminRequest(operation, payload = {}) {
  const result = await httpsCallable(functions, "adminProvidersV1")({ operation, ...payload });
  return result.data;
}

async function imageRequest(providerId, { storagePath, file } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Iniciá sesión para acceder a las fotos privadas.");
  const url = new URL(`${firebaseEnvironment.functionsBaseUrl}/providerAdminImageV1`);
  url.searchParams.set("providerId", providerId);
  if (storagePath) url.searchParams.set("storagePath", storagePath);
  const token = await user.getIdToken();
  const response = await fetch(url, {
    method: file ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(file ? { "Content-Type": file.type } : {}) },
    ...(file ? { body: file } : {}),
    cache: "no-store",
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result?.error?.message || result.message || "No se pudo acceder a la imagen privada.");
  }
  return response;
}

export async function readProviderImage(providerId, storagePath) {
  const response = await imageRequest(providerId, { storagePath });
  return response.blob();
}

export async function uploadProviderImage(providerId, file) {
  const response = await imageRequest(providerId, { file });
  return (await response.json()).image;
}
