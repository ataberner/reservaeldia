import {
  collection,
  documentId,
  doc,
  getDocFromServer,
  getDocs,
  limit,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { db } from "@/firebase";

const ICONS_COLLECTION = "iconos";
const DECOR_COLLECTION = "decoraciones";

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase();
}

function isActiveDecorCandidate(raw) {
  const status = normalizeToken(raw?.status);
  if (status && status !== "active") return false;

  const assetType = normalizeToken(raw?.assetType || raw?.tipo);
  if (assetType && assetType !== "decoracion") return false;

  return true;
}

export async function fetchFirestoreCatalogPage({
  pageSize = 96,
  cursor = null,
} = {}) {
  const constraints = [
    where("status", "==", "active"),
    orderBy(documentId()),
    limit(pageSize),
  ];
  if (cursor) {
    constraints.splice(2, 0, startAfter(cursor));
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
    where("status", "==", "active"),
    where("popular", "==", true),
    limit(maxItems)
  );
  const snapshot = await getDocs(popularQuery);
  return snapshot.docs.map((docSnapshot) => ({
    id: docSnapshot.id,
    ...docSnapshot.data(),
  }));
}

export async function fetchFirestoreDecorCatalogPage({
  pageSize = 96,
  cursor = null,
} = {}) {
  const constraints = [orderBy(documentId()), limit(pageSize)];
  if (cursor) {
    constraints.splice(1, 0, startAfter(cursor));
  }

  const decorCollectionRef = collection(db, DECOR_COLLECTION);
  let snapshot = null;

  try {
    snapshot = await getDocs(
      query(decorCollectionRef, where("status", "==", "active"), ...constraints)
    );
  } catch {
    snapshot = await getDocs(query(decorCollectionRef, ...constraints));
  }

  const items = snapshot.docs
    .map((docSnapshot) => ({
      id: docSnapshot.id,
      ...docSnapshot.data(),
    }))
    .filter((item) => isActiveDecorCandidate(item));
  const nextCursor = snapshot.docs.length
    ? snapshot.docs[snapshot.docs.length - 1]
    : null;

  return {
    items,
    cursor: nextCursor,
    hasMore: snapshot.docs.length === pageSize,
  };
}

export function subscribeFirestoreCatalog({
  maxItems = 96,
  onData,
  onError,
} = {}) {
  const safeLimit = Math.max(1, Math.floor(Number(maxItems || 96)));
  const catalogQuery = query(
    collection(db, ICONS_COLLECTION),
    where("status", "==", "active"),
    orderBy(documentId()),
    limit(safeLimit)
  );

  return onSnapshot(
    catalogQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache) {
        onError?.(new Error("Catalog snapshot not confirmed by Firestore server."));
        return;
      }
      onData?.({
        items: snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })),
        hasMore: snapshot.docs.length === safeLimit,
      });
    },
    (error) => onError?.(error)
  );
}

export function subscribeFirestorePopularCatalog({
  maxItems = 64,
  onData,
  onError,
} = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(maxItems || 64)));
  const popularQuery = query(
    collection(db, ICONS_COLLECTION),
    where("status", "==", "active"),
    where("popular", "==", true),
    limit(safeLimit)
  );

  return onSnapshot(
    popularQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache) {
        onError?.(new Error("Popular catalog snapshot not confirmed by Firestore server."));
        return;
      }
      onData?.(
        snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        }))
      );
    },
    (error) => onError?.(error)
  );
}

export async function fetchActiveCatalogItemById(iconId) {
  const safeId = String(iconId || "").trim();
  if (!safeId) return null;
  const snapshot = await getDocFromServer(doc(db, ICONS_COLLECTION, safeId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() || {};
  if (normalizeToken(data.status) !== "active") return null;
  return {
    id: snapshot.id,
    ...data,
  };
}

export async function requestIconCatalogRevalidation(iconId) {
  const safeId = String(iconId || "").trim();
  if (!safeId) return;
  await updateDoc(doc(db, ICONS_COLLECTION, safeId), {
    status: "processing",
    actualizadoEn: serverTimestamp(),
  });
}
