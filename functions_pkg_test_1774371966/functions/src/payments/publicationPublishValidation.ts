import {
  normalizeDraftRenderState,
  type DraftRenderState,
} from "../drafts/sourceOfTruth";
import { normalizeGiftConfig, type GiftsConfig } from "../gifts/config";
import { normalizeRsvpConfig, type RSVPConfig } from "../rsvp/config";
import { normalizePublishRenderStateAssets } from "../utils/publishAssetNormalization";
import { resolvePublishImageCropState } from "../utils/publishImageCrop";
const {
  resolveGalleryCellMediaUrl,
  resolveObjectPrimaryAssetUrl,
  resolveSectionDecorationAssetUrl,
} = require("../../shared/renderAssetContract.cjs");

type UnknownRecord = Record<string, unknown>;
const ALTURA_EDITOR_PANTALLA = 500;
const PANTALLA_Y_DRIFT_WARNING_PX = 6;
const GIFT_BANK_FIELD_LABELS: Record<string, string> = Object.freeze({
  holder: "Titular",
  bank: "Banco",
  alias: "Alias",
  cbu: "CBU / CVU",
  cuit: "CUIT",
});

export type PublicationPublishValidationSeverity = "blocking" | "warning";

export type PublicationPublishValidationIssue = {
  severity: PublicationPublishValidationSeverity;
  code: string;
  message: string;
  objectId: string | null;
  sectionId: string | null;
  fieldPath: string | null;
};

export type PublicationPublishValidationResult = {
  canPublish: boolean;
  blockers: PublicationPublishValidationIssue[];
  warnings: PublicationPublishValidationIssue[];
  summary: {
    blockerCount: number;
    warningCount: number;
    blockingMessage: string;
    warningMessage: string;
  };
};

export type PreparedPublicationRenderState = {
  draftRenderState: DraftRenderState;
  objetosFinales: UnknownRecord[];
  seccionesFinales: UnknownRecord[];
  rsvp: RSVPConfig;
  gifts: GiftsConfig | null;
};

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function asRecordList(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asRecord(entry));
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: unknown): string {
  return getString(value).toLowerCase();
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSectionMode(value: unknown): "pantalla" | "fijo" {
  return normalizeText(value) === "pantalla" ? "pantalla" : "fijo";
}

function isPublishReadyAssetValue(value: unknown): boolean {
  const text = getString(value);
  if (!text) return false;
  if (/^https?:\/\//i.test(text)) return true;
  if (/^data:image\//i.test(text)) return true;
  return false;
}

function isFullBleedObject(rawObject: UnknownRecord): boolean {
  return normalizeText(rawObject.anclaje) === "fullbleed";
}

function getObjectLabel(rawObject: UnknownRecord, index: number): string {
  const type = normalizeText(rawObject.tipo) || "objeto";
  const objectId = getString(rawObject.id);
  return objectId ? `${type} "${objectId}"` : `${type} #${index + 1}`;
}

function getSectionLabel(rawSection: UnknownRecord, index: number): string {
  const sectionId = getString(rawSection.id);
  return sectionId ? `seccion "${sectionId}"` : `seccion #${index + 1}`;
}

function getPrimaryObjectAssetCandidate(source: UnknownRecord): string {
  return resolveObjectPrimaryAssetUrl(source) || getString(source.storagePath);
}

function getGalleryCellAssetCandidate(source: UnknownRecord): string {
  return resolveGalleryCellMediaUrl(source);
}

function hasConfiguredLink(value: unknown): boolean {
  if (typeof value === "string") {
    return getString(value).length > 0;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return getString((value as UnknownRecord).href).length > 0;
}

function getIncompleteGiftModalFields(
  gifts: GiftsConfig | null
): Array<{ fieldPath: string; label: string }> {
  if (!gifts) return [];

  const normalized = normalizeGiftConfig(gifts, { forceEnabled: false });
  const incompleteFields: Array<{ fieldPath: string; label: string }> = [];

  Object.entries(GIFT_BANK_FIELD_LABELS).forEach(([fieldKey, label]) => {
    if (!normalized.visibility[fieldKey as keyof GiftsConfig["visibility"]]) return;
    if (getString(normalized.bank[fieldKey as keyof GiftsConfig["bank"]])) return;

    incompleteFields.push({
      fieldPath: `gifts.bank.${fieldKey}`,
      label,
    });
  });

  if (normalized.visibility.giftListLink && !getString(normalized.giftListUrl)) {
    incompleteFields.push({
      fieldPath: "gifts.giftListUrl",
      label: "Lista externa",
    });
  }

  return incompleteFields;
}

function createIssue(params: {
  severity: PublicationPublishValidationSeverity;
  code: string;
  message: string;
  objectId?: string | null;
  sectionId?: string | null;
  fieldPath?: string | null;
}): PublicationPublishValidationIssue {
  return {
    severity: params.severity,
    code: params.code,
    message: params.message,
    objectId: params.objectId || null,
    sectionId: params.sectionId || null,
    fieldPath: params.fieldPath || null,
  };
}

function buildBlockingMessage(
  blockers: PublicationPublishValidationIssue[]
): string {
  if (!blockers.length) return "";

  const firstMessage =
    blockers[0]?.message ||
    "Hay contratos de render que todavia no son seguros para publicar.";
  const remaining = blockers.length - 1;

  if (remaining <= 0) {
    return `No se puede publicar todavia: ${firstMessage}`;
  }

  return `No se puede publicar todavia: ${firstMessage} Hay ${remaining} incompatibilidades mas.`;
}

function buildWarningMessage(
  warnings: PublicationPublishValidationIssue[]
): string {
  if (!warnings.length) return "";

  if (warnings.length === 1) {
    return warnings[0]?.message || "Se detecto una advertencia de compatibilidad.";
  }

  return `Se detectaron ${warnings.length} advertencias de compatibilidad para revisar antes de publicar.`;
}

function buildValidationResult(params: {
  blockers: PublicationPublishValidationIssue[];
  warnings: PublicationPublishValidationIssue[];
}): PublicationPublishValidationResult {
  const blockers = params.blockers;
  const warnings = params.warnings;

  return {
    canPublish: blockers.length === 0,
    blockers,
    warnings,
    summary: {
      blockerCount: blockers.length,
      warningCount: warnings.length,
      blockingMessage: buildBlockingMessage(blockers),
      warningMessage: buildWarningMessage(warnings),
    },
  };
}

function findFinalRecordByIdOrIndex(
  rawRecord: UnknownRecord,
  index: number,
  lookup: Map<string, UnknownRecord>,
  fallbackList: UnknownRecord[]
): UnknownRecord {
  const recordId = getString(rawRecord.id);
  if (recordId && lookup.has(recordId)) {
    return lookup.get(recordId) as UnknownRecord;
  }
  return asRecord(fallbackList[index]);
}

export async function preparePublicationRenderState(
  draftData: UnknownRecord
): Promise<PreparedPublicationRenderState> {
  const draftRenderState = normalizeDraftRenderState(draftData);
  const normalizedAssets = await normalizePublishRenderStateAssets({
    objetos: draftRenderState.objetos,
    secciones: draftRenderState.secciones,
  });

  const objetosFinales = asRecordList(normalizedAssets.objetos);
  const seccionesFinales = asRecordList(normalizedAssets.secciones);
  const hasGiftButton = objetosFinales.some(
    (object) => normalizeText(object.tipo) === "regalo-boton"
  );

  return {
    draftRenderState,
    objetosFinales,
    seccionesFinales,
    rsvp: normalizeRsvpConfig(draftRenderState.rsvp || {}),
    gifts:
      hasGiftButton || Boolean(draftRenderState.gifts)
        ? normalizeGiftConfig(draftRenderState.gifts || {})
        : null,
  };
}

export function validatePreparedPublicationRenderState(params: {
  rawObjetos: unknown[];
  rawSecciones: unknown[];
  objetosFinales: UnknownRecord[];
  seccionesFinales: UnknownRecord[];
  rsvp?: RSVPConfig | null;
  gifts?: GiftsConfig | null;
}): PublicationPublishValidationResult {
  const rawObjetos = asRecordList(params.rawObjetos);
  const rawSecciones = asRecordList(params.rawSecciones);
  const objetosFinales = asRecordList(params.objetosFinales);
  const seccionesFinales = asRecordList(params.seccionesFinales);
  const rsvp = params.rsvp || null;
  const gifts = params.gifts || null;
  const incompleteGiftModalFields = getIncompleteGiftModalFields(gifts);
  const objectIssues = new Set<string>();
  const blockers: PublicationPublishValidationIssue[] = [];
  const warnings: PublicationPublishValidationIssue[] = [];

  const pushIssue = (issue: PublicationPublishValidationIssue) => {
    const issueKey = [
      issue.severity,
      issue.code,
      issue.objectId || "",
      issue.sectionId || "",
      issue.fieldPath || "",
      issue.message,
    ].join("|");

    if (objectIssues.has(issueKey)) return;
    objectIssues.add(issueKey);

    if (issue.severity === "blocking") {
      blockers.push(issue);
      return;
    }

    warnings.push(issue);
  };

  const finalSectionLookup = new Map<string, UnknownRecord>();
  seccionesFinales.forEach((section) => {
    const sectionId = getString(section.id);
    if (sectionId && !finalSectionLookup.has(sectionId)) {
      finalSectionLookup.set(sectionId, section);
    }
  });

  const rawSectionLookup = new Map<string, UnknownRecord>();
  rawSecciones.forEach((section) => {
    const sectionId = getString(section.id);
    if (sectionId && !rawSectionLookup.has(sectionId)) {
      rawSectionLookup.set(sectionId, section);
    }
  });

  const finalObjectLookup = new Map<string, UnknownRecord>();
  objetosFinales.forEach((object) => {
    const objectId = getString(object.id);
    if (objectId && !finalObjectLookup.has(objectId)) {
      finalObjectLookup.set(objectId, object);
    }
  });

  const validSectionIds = new Set(
    seccionesFinales.map((section) => getString(section.id)).filter(Boolean)
  );

  rawObjetos.forEach((rawObject, index) => {
    const finalObject = findFinalRecordByIdOrIndex(
      rawObject,
      index,
      finalObjectLookup,
      objetosFinales
    );
    const objectId = getString(rawObject.id) || getString(finalObject.id) || null;
    const sectionId =
      getString(rawObject.seccionId) || getString(finalObject.seccionId) || null;
    const objectType = normalizeText(rawObject.tipo) || normalizeText(finalObject.tipo);
    const objectLabel = getObjectLabel(rawObject, index);
    const rawSection = sectionId ? rawSectionLookup.get(sectionId) || null : null;
    const finalSection = sectionId ? finalSectionLookup.get(sectionId) || null : null;
    const sectionMode = normalizeSectionMode(
      rawSection?.altoModo ?? finalSection?.altoModo
    );

    if (!sectionId || !validSectionIds.has(sectionId)) {
      pushIssue(
        createIssue({
          severity: "blocking",
          code: "missing-section-reference",
          message: `${objectLabel} no tiene una seccion valida para publish.`,
          objectId,
          sectionId,
          fieldPath: "seccionId",
        })
      );
    }

    if (objectType === "imagen") {
      const rawAsset = getPrimaryObjectAssetCandidate(rawObject);
      const finalAsset = getPrimaryObjectAssetCandidate(finalObject);
      const imageCropState = resolvePublishImageCropState({
        ...rawObject,
        ...finalObject,
      });

      if (rawAsset && !isPublishReadyAssetValue(finalAsset)) {
        pushIssue(
          createIssue({
            severity: "blocking",
            code: "image-asset-unresolved",
            message: `${objectLabel} no tiene un asset publico resuelto para el HTML final.`,
            objectId,
            sectionId,
            fieldPath: "src",
          })
        );
      }

      if (imageCropState.hasMeaningfulCrop && !imageCropState.canMaterializeCrop) {
        const cropMessage =
          imageCropState.materializationIssue === "missing-source-size"
            ? `${objectLabel} usa crop del canvas pero le faltan ancho/alto de origen para materializar ese crop en el HTML publicado.`
            : imageCropState.materializationIssue === "missing-display-size"
              ? `${objectLabel} usa crop del canvas pero no tiene width/height finales consistentes para publicarlo sin drift.`
              : `${objectLabel} usa crop del canvas y ese crop no se materializa en el HTML publicado.`;
        pushIssue(
          createIssue({
            severity: "blocking",
            code: "image-crop-not-materialized",
            message: cropMessage,
            objectId,
            sectionId,
            fieldPath: "crop",
          })
        );
      }
    }

    if (objectType === "icono" && normalizeText(rawObject.formato) !== "svg") {
      const rawAsset = getPrimaryObjectAssetCandidate(rawObject);
      const finalAsset = getPrimaryObjectAssetCandidate(finalObject);

      if (rawAsset && !isPublishReadyAssetValue(finalAsset)) {
        pushIssue(
          createIssue({
            severity: "blocking",
            code: "icon-asset-unresolved",
            message: `${objectLabel} no tiene un asset publico resuelto para publish.`,
            objectId,
            sectionId,
            fieldPath: "src",
          })
        );
      }
    }

    if (objectType === "galeria") {
      const rawCells = Array.isArray(rawObject.cells) ? rawObject.cells : [];
      const finalCells = Array.isArray(finalObject.cells) ? finalObject.cells : [];

      rawCells.forEach((rawCell, cellIndex) => {
        const safeRawCell = asRecord(rawCell);
        const safeFinalCell = asRecord(finalCells[cellIndex]);
        const rawMedia = getGalleryCellAssetCandidate(safeRawCell);
        const finalMedia = getGalleryCellAssetCandidate(safeFinalCell);

        if (!rawMedia) return;
        if (isPublishReadyAssetValue(finalMedia)) return;

        pushIssue(
          createIssue({
            severity: "blocking",
            code: "gallery-media-unresolved",
            message: `${objectLabel} tiene la celda ${cellIndex + 1} sin mediaUrl publico resuelto para publish.`,
            objectId,
            sectionId,
            fieldPath: `cells[${cellIndex}].mediaUrl`,
          })
        );
      });
    }

    if (objectType === "countdown") {
      const schemaVersion = Number(rawObject.countdownSchemaVersion || 1);
      const rawFrameSvgUrl = getString(rawObject.frameSvgUrl);
      const finalFrameSvgUrl = getString(finalObject.frameSvgUrl);

      if (schemaVersion >= 2 && rawFrameSvgUrl && !isPublishReadyAssetValue(finalFrameSvgUrl)) {
        pushIssue(
          createIssue({
            severity: "blocking",
            code: "countdown-frame-unresolved",
            message: `${objectLabel} usa countdown schema v2 con frameSvgUrl sin resolver para publish.`,
            objectId,
            sectionId,
            fieldPath: "frameSvgUrl",
          })
        );
      }
    }

    if (sectionMode === "pantalla") {
      const yNorm = toFiniteNumber(rawObject.yNorm);
      const y = toFiniteNumber(rawObject.y);

      if (yNorm === null) {
        pushIssue(
          createIssue({
            severity: "warning",
            code: "pantalla-ynorm-missing",
            message: `${objectLabel} esta en una seccion pantalla pero no tiene yNorm persistido; publish puede reubicarlo distinto al canvas.`,
            objectId,
            sectionId,
            fieldPath: "yNorm",
          })
        );
      } else if (y !== null) {
        const expectedY = yNorm * ALTURA_EDITOR_PANTALLA;
        if (Math.abs(y - expectedY) > PANTALLA_Y_DRIFT_WARNING_PX) {
          pushIssue(
            createIssue({
              severity: "warning",
              code: "pantalla-ynorm-drift",
              message: `${objectLabel} esta en una seccion pantalla con y/yNorm desalineados; publish prioriza yNorm y la posicion vertical puede cambiar.`,
              objectId,
              sectionId,
              fieldPath: "yNorm",
            })
          );
        }
      }
    }

    if ((objectType === "rsvp-boton" || objectType === "regalo-boton") && hasConfiguredLink(rawObject.enlace)) {
      pushIssue(
        createIssue({
          severity: "warning",
          code: "functional-cta-link-ignored",
          message: `${objectLabel} define enlace, pero publish ignora enlace en CTA funcionales.`,
          objectId,
          sectionId,
          fieldPath: "enlace",
        })
      );
    }

    if (objectType === "regalo-boton" && incompleteGiftModalFields.length > 0) {
      incompleteGiftModalFields.forEach((field) => {
        pushIssue(
          createIssue({
            severity: "warning",
            code: "gift-modal-field-incomplete",
            message: `${objectLabel} tiene "${field.label}" visible en el modal de regalos, pero ese dato esta incompleto y el HTML publicado no lo mostrara.`,
            objectId,
            sectionId,
            fieldPath: field.fieldPath,
          })
        );
      });
    }

    if (objectType === "rsvp-boton" && rsvp?.enabled === false) {
      pushIssue(
        createIssue({
          severity: "blocking",
          code: "rsvp-disabled-with-button",
          message: `${objectLabel} requiere RSVP habilitado en raiz para que el HTML publicado tenga un modal funcional.`,
          objectId,
          sectionId,
          fieldPath: "rsvp.enabled",
        })
      );
    }

    if (isFullBleedObject(rawObject)) {
      pushIssue(
        createIssue({
          severity: "warning",
          code: "fullbleed-editor-drift",
          message: `${objectLabel} usa fullbleed y el canvas no representa ese contrato igual que el HTML final.`,
          objectId,
          sectionId,
          fieldPath: "anclaje",
        })
      );
    }

  });

  rawSecciones.forEach((rawSection, index) => {
    const finalSection = findFinalRecordByIdOrIndex(
      rawSection,
      index,
      finalSectionLookup,
      seccionesFinales
    );
    const sectionId = getString(rawSection.id) || getString(finalSection.id) || null;
    const sectionLabel = getSectionLabel(rawSection, index);
    const rawBackground = getString(rawSection.fondoImagen);
    const finalBackground = getString(finalSection.fondoImagen);

    if (rawBackground && !isPublishReadyAssetValue(finalBackground)) {
      pushIssue(
        createIssue({
          severity: "blocking",
          code: "section-background-unresolved",
          message: `${sectionLabel} tiene una imagen de fondo sin URL publica resuelta para publish.`,
          sectionId,
          fieldPath: "fondoImagen",
        })
      );
    }

    const decorations =
      finalSection.decoracionesFondo &&
      typeof finalSection.decoracionesFondo === "object" &&
      Array.isArray((finalSection.decoracionesFondo as UnknownRecord).items)
        ? ((finalSection.decoracionesFondo as UnknownRecord).items as unknown[])
        : [];

    decorations.forEach((decoration, decorationIndex) => {
      const safeDecoration = asRecord(decoration);
      const decorationSrc =
        resolveSectionDecorationAssetUrl(safeDecoration) ||
        getString(safeDecoration.storagePath);

      if (!decorationSrc) return;
      if (isPublishReadyAssetValue(decorationSrc)) return;

      pushIssue(
        createIssue({
          severity: "blocking",
          code: "section-decoration-unresolved",
          message: `${sectionLabel} tiene una decoracion de fondo sin URL publica resuelta para publish.`,
          sectionId,
          fieldPath: `decoracionesFondo.items[${decorationIndex}].src`,
        })
      );
    });
  });

  return buildValidationResult({
    blockers,
    warnings,
  });
}

export function buildPublicationValidationBlockingMessage(
  result: PublicationPublishValidationResult
): string {
  return result.summary.blockingMessage;
}
