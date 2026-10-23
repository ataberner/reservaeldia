import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import { sanitizeGiftImageUrl, sanitizeGiftLinkUrl } from "./config";

const getLinkMetadata = httpsCallable(functions, "getGiftLinkMetadata", { timeout: 20000 });

export async function loadGiftLinkMetadata(url) {
  const safeUrl = sanitizeGiftLinkUrl(url);
  if (!safeUrl) return { title: "", imageUrl: "", status: "unavailable" };

  const { data } = await getLinkMetadata({ url: safeUrl });
  if (!data || data.status !== "found") {
    return { title: "", imageUrl: "", status: data?.status === "empty" ? "empty" : "unavailable" };
  }
  const title = typeof data.title === "string" ? data.title.trim().slice(0, 120) : "";
  const imageUrl = sanitizeGiftImageUrl(data.imageUrl);
  return { title, imageUrl, status: title || imageUrl ? "found" : "empty" };
}
