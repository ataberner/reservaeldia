import { httpsCallable } from "firebase/functions";
import { auth, functions, firebaseEnvironment } from "../../firebase.js";

export async function providerDirectoryRequest(operation, payload = {}) {
  const result = await httpsCallable(functions, "providerDirectoryV1")({ operation, ...payload });
  return result.data;
}

export async function readDirectoryImage(providerId, imageId, approvedRevision, signal) {
  const user = auth.currentUser;
  if (!user) throw new Error("Iniciá sesión para ver esta imagen.");
  const url = new URL(`${firebaseEnvironment.functionsBaseUrl}/providerDirectoryImageV1`);
  url.searchParams.set("providerId", providerId);
  url.searchParams.set("imageId", imageId);
  url.searchParams.set("approvedRevision", String(approvedRevision));
  const token = await user.getIdToken();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal });
  if (!response.ok) throw new Error("Esta imagen ya no está disponible.");
  return response.blob();
}
