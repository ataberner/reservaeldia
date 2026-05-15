import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { normalizeInvitationType } from "@/domain/invitationTypes";
import {
  normalizeTemplateCatalogDocument,
  normalizeTemplateDocument,
} from "../../../shared/templates/contract.js";

const TEMPLATE_COLLECTION = "plantillas";
const TEMPLATE_CATALOG_COLLECTION = "plantillas_catalog";

function compareByName(left, right) {
  const leftName = String(left?.nombre || "").trim().toLowerCase();
  const rightName = String(right?.nombre || "").trim().toLowerCase();
  if (leftName < rightName) return -1;
  if (leftName > rightName) return 1;
  return 0;
}

function isTemplatePubliclyVisible(template) {
  return (
    template?.estado !== "archived" &&
    template?.estadoEditorial === "publicada"
  );
}

export async function listTemplates({ tipo } = {}) {
  const normalizedType = normalizeInvitationType(tipo);
  const templatesQuery = query(
    collection(db, TEMPLATE_CATALOG_COLLECTION),
    where("tipo", "==", normalizedType),
    where("estado", "==", "active"),
    where("estadoEditorial", "==", "publicada")
  );
  const snapshot = await getDocs(templatesQuery);

  const items = snapshot.docs
    .map((docSnapshot) => {
      return normalizeTemplateCatalogDocument(
        {
          id: docSnapshot.id,
          ...docSnapshot.data(),
        },
        docSnapshot.id
      );
    })
    .filter((item) => isTemplatePubliclyVisible(item))
    .sort(compareByName);

  return items;
}

export async function getTemplateById(id) {
  const templateId = String(id || "").trim();
  if (!templateId) return null;

  const templateRef = doc(db, TEMPLATE_COLLECTION, templateId);
  const templateSnap = await getDoc(templateRef);
  if (!templateSnap.exists()) return null;

  const normalized = normalizeTemplateDocument(
    {
      id: templateSnap.id,
      ...templateSnap.data(),
    },
    templateSnap.id
  );

  if (!isTemplatePubliclyVisible(normalized)) return null;
  return normalized;
}
