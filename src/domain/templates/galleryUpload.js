import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { storage } from "@/firebase";

function normalizeText(value) {
  return String(value || "").trim();
}

function toPositiveNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function toSafeFileName(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "imagen";
  return normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "imagen";
}

function resolveMaxImages({ field, galleryRules }) {
  const fieldMax = toPositiveNumber(field?.validation?.maxItems);
  const rulesMax = toPositiveNumber(galleryRules?.maxImages);

  if (fieldMax) return fieldMax;
  if (rulesMax) return rulesMax;
  return 12;
}

function resolveMaxFileSizeBytes({ galleryRules }) {
  const maxMb = toPositiveNumber(galleryRules?.maxFileSizeMB);
  if (!maxMb) return null;
  return Math.round(maxMb * 1024 * 1024);
}

function normalizeFiles(files) {
  if (!Array.isArray(files)) return [];
  const hasFileCtor = typeof File === "function";
  return files.filter((file) =>
    hasFileCtor ? file instanceof File : Boolean(file && typeof file === "object")
  );
}

export function validateGalleryFiles({
  files,
  field,
  galleryRules,
}) {
  const safeFiles = normalizeFiles(files);
  const maxImages = resolveMaxImages({ field, galleryRules });
  const maxFileSizeBytes = resolveMaxFileSizeBytes({ galleryRules });

  if (safeFiles.length > maxImages) {
    throw new Error(`Puedes subir hasta ${maxImages} imagenes en este campo.`);
  }

  if (maxFileSizeBytes) {
    const oversized = safeFiles.find((file) => Number(file.size || 0) > maxFileSizeBytes);
    if (oversized) {
      const maxMb = toPositiveNumber(galleryRules?.maxFileSizeMB) || 0;
      throw new Error(
        `La imagen '${oversized.name}' supera el maximo permitido de ${maxMb} MB.`
      );
    }
  }

  return {
    maxImages,
    files: safeFiles,
  };
}

export async function uploadTemplateGalleryFiles({
  userId,
  templateId,
  fieldKey,
  files,
  field,
  galleryRules,
}) {
  const uid = normalizeText(userId);
  const safeTemplateId = normalizeText(templateId);
  const safeFieldKey = normalizeText(fieldKey);

  if (!uid) {
    throw new Error("No se pudo subir la galeria: usuario no autenticado.");
  }
  if (!safeTemplateId || !safeFieldKey) {
    throw new Error("No se pudo subir la galeria: plantilla o campo invalido.");
  }

  const { files: safeFiles } = validateGalleryFiles({
    files,
    field,
    galleryRules,
  });
  if (!safeFiles.length) return [];

  const uploadedUrls = [];

  for (let index = 0; index < safeFiles.length; index += 1) {
    const file = safeFiles[index];
    const safeName = toSafeFileName(file.name);
    const ext =
      normalizeText(safeName.split(".").pop()).toLowerCase() ||
      normalizeText(file.type.split("/").pop()).toLowerCase() ||
      "jpg";
    const fileName = `${Date.now()}-${index + 1}.${ext}`;
    const fullPath = `usuarios/${uid}/imagenes/template-input/${safeTemplateId}/${safeFieldKey}/${fileName}`;
    const fileRef = storageRef(storage, fullPath);

    await uploadBytes(fileRef, file, {
      contentType: file.type || undefined,
      customMetadata: {
        source: "template-input",
        templateId: safeTemplateId,
        fieldKey: safeFieldKey,
        originalName: safeName,
      },
    });

    const downloadUrl = await getDownloadURL(fileRef);
    uploadedUrls.push(downloadUrl);
  }

  return uploadedUrls;
}
