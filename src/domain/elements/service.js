import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { getDownloadURL, list, ref } from "firebase/storage";
import { db, storage } from "@/firebase";

const ICONS_COLLECTION = "iconos";
const ICONS_STORAGE_FOLDER = "iconos";

export async function fetchFirestoreCatalogPage({
  pageSize = 96,
  cursor = null,
} = {}) {
  const constraints = [orderBy(documentId()), limit(pageSize)];
  if (cursor) {
    constraints.splice(1, 0, startAfter(cursor));
  }

  const pageQuery = query(collection(db, ICONS_COLLECTION), ...constraints);
  const snapshot = await getDocs(pageQuery);

  const items = snapshot.docs.map((docSnapshot) => ({
    id: docSnapshot.id,
    ...docSnapshot.data(),
  }));
  const nextCursor = snapshot.docs.length
    ? snapshot.docs[snapshot.docs.length - 1]
    : null;

  return {
    items,
    cursor: nextCursor,
    hasMore: snapshot.docs.length === pageSize,
  };
}

export async function fetchFirestorePopularCatalog({
  maxItems = 64,
} = {}) {
  const popularQuery = query(
    collection(db, ICONS_COLLECTION),
    where("popular", "==", true),
    limit(maxItems)
  );
  const snapshot = await getDocs(popularQuery);
  return snapshot.docs.map((docSnapshot) => ({
    id: docSnapshot.id,
    ...docSnapshot.data(),
  }));
}

export async function fetchStorageCatalogPage({
  pageSize = 72,
  pageToken = undefined,
} = {}) {
  const folderRef = ref(storage, ICONS_STORAGE_FOLDER);
  const response = await list(folderRef, {
    maxResults: pageSize,
    pageToken,
  });

  const items = await Promise.all(
    response.items.map(async (itemRef) => {
      const url = await getDownloadURL(itemRef);
      const lowerName = String(itemRef.name || "").toLowerCase();
      const extension = lowerName.split(".").pop() || "";
      const format = extension === "jpeg" ? "jpg" : extension;
      return {
        id: itemRef.name,
        nombre: itemRef.name,
        url,
        formato: format,
        tipo: format === "gif" ? "gif" : "icono",
        popular: false,
        categoria: "",
        keywords: [],
      };
    })
  );

  return {
    items,
    nextPageToken: response.nextPageToken || null,
    hasMore: Boolean(response.nextPageToken),
  };
}
