// src/components/editor/events/useEditorEvents.js
import { useEffect } from "react";
import computeInsertDefaults from "./computeInsertDefaults";
import {
  createDefaultRsvpConfig,
  isRsvpConfigV2,
  normalizeRsvpConfig,
} from "@/domain/rsvp/config";
import {
  createDefaultGiftConfig,
  isGiftConfigV1,
  normalizeGiftConfig,
} from "@/domain/gifts/config";
import {
  applyGlobalMotionPreset,
  applyGlobalMotionPresetToSections,
  clearAllMotionEffects,
  CLEAR_ALL_MOTION_PRESET_ID,
  sanitizeMotionEffect,
} from "@/domain/motionEffects";
import { normalizeSectionBackgroundModel } from "@/domain/sections/backgrounds";
import {
  findFunctionalCtaButtonByType,
  isFunctionalCtaButton,
} from "@/domain/functionalCtaButtons";
import {
  canEditObject,
  canEditObjectById,
  canInsertIntoSection,
  canMutateSection,
} from "@/domain/editor/protectedSections";
import {
  applyObjectUpdateById,
} from "@/components/editor/canvasEditor/objectUpdateUtils";
import {
  findRenderObjectById,
  updateRenderObjectById,
} from "@/domain/editor/renderObjectTree";
import { applyCountdownPresetToExisting } from "@/domain/countdownPresets/applyToExisting";
import { isEventGoogleMapVisible } from "@/domain/eventDetails/location";
import {
  buildDynamicGalleryObjectPatch,
  buildFixedGalleryObjectPatch,
  buildGalleryLayoutBlueprintFromObject,
} from "@/domain/templates/galleryDynamicMedia";
import {
  assignGalleryPhotoToCell,
  getGalleryPhotos,
  getGallerySlots,
  resolveGalleryPhotoMediaUrl,
} from "@/domain/gallery/galleryMutations";
import {
  readEditorObjectById,
  readEditorObjectByType,
  readEditorSelectionSnapshot,
} from "@/lib/editorRuntimeBridge";
import { collectGalleryMediaUrls } from "../../../../shared/templates/galleryDynamicLayout.js";

const GALLERY_STRUCTURAL_KEYS = new Set([
  "rows",
  "cols",
  "gap",
  "ratio",
  "width",
  "height",
  "widthPct",
]);

function hasGalleryStructuralChanges(changes = {}) {
  return Object.keys(changes).some((key) => GALLERY_STRUCTURAL_KEYS.has(key));
}

/**
 * Hook que concentra los eventos globales del editor y utilidades expuestas en window:
 * - window.asignarImagenACelda
 * - window.addEventListener("insertar-elemento")
 * - window.addEventListener("actualizar-elemento")
 * - window.addEventListener("agregar-cuadro-texto")
 * - window.addEventListener("crear-seccion")  (NO acá: ya está en useSectionsManager)
 *
 * ⚠️ Importante: no cambia lógica, solo mueve lo que ya existía en CanvasEditor.
 */
export default function useEditorEvents({
  // estado/props necesarios
  celdaGaleriaActiva,
  setCeldaGaleriaActiva,
  setObjetos,
  setSecciones,

  secciones,
  seccionActivaId,

  setElementosSeleccionados,
  rsvpConfig,
  setRsvpConfig,
  giftsConfig,
  setGiftsConfig,
  onRequestRsvpSetup,
  onRequestGiftSetup,

  normalizarAltoModo,
  ALTURA_PANTALLA_EDITOR,

  // refs existentes
  nuevoTextoRef,

  // setSeccionActivaId NO lo usamos acá (solo lo usa el canvas en otros handlers)
}) {
  // ------------------------------------------------------------
  // 1) Exponer función global: asignar imagen a la celda activa
  // ------------------------------------------------------------
  useEffect(() => {
    const resolveNextActiveCell = (galleryObject, indexActual, photoInput) => {
      const hayImagenNueva = Boolean(resolveGalleryPhotoMediaUrl(photoInput));
      if (!hayImagenNueva || !Number.isFinite(indexActual)) return null;

      const isDynamicGallery =
        String(galleryObject?.galleryLayoutMode || "").trim().toLowerCase() === "dynamic_media";

      if (isDynamicGallery) {
        const photos = getGalleryPhotos(galleryObject);
        if (photos.length <= 1) return null;
        const nextIndex = (indexActual + 1) % photos.length;
        return nextIndex !== indexActual ? { objId: galleryObject.id, index: nextIndex } : null;
      }

      const rows = Math.max(1, Number(galleryObject?.rows) || 1);
      const cols = Math.max(1, Number(galleryObject?.cols) || 1);
      const total = rows * cols;
      if (total <= 1) return null;

      const occupiedIndexes = new Set(
        getGalleryPhotos(galleryObject).map((photo) => Number(photo.sourceIndex))
      );
      occupiedIndexes.add(indexActual);

      for (let step = 1; step < total; step += 1) {
        const candidate = (indexActual + step) % total;
        if (!occupiedIndexes.has(candidate)) {
          return { objId: galleryObject.id, index: candidate };
        }
      }

      const nextIndex = (indexActual + 1) % total;
      return nextIndex !== indexActual ? { objId: galleryObject.id, index: nextIndex } : null;
    };

    window.asignarImagenACelda = (mediaInput, fit = "cover", bg) => {
      if (!celdaGaleriaActiva) return false; // no hay slot activo
      const { objId, index } = celdaGaleriaActiva;
      const indexActual = Number(index);
      if (!Number.isFinite(indexActual)) return false;

      const photoInput = resolveGalleryPhotoMediaUrl(mediaInput)
        ? {
            ...(mediaInput && typeof mediaInput === "object" ? mediaInput : { mediaUrl: mediaInput }),
            fit,
            bg,
          }
        : null;
      const galeriaActual = readEditorObjectById(objId);
      if (!galeriaActual || galeriaActual.tipo !== "galeria") return false;
      if (!canEditObject(galeriaActual, { secciones })) return false;
      const hasValidTargetCell = getGallerySlots(galeriaActual, { visibleOnly: true }).some(
        (slot) => Number(slot?.sourceIndex) === indexActual
      );
      if (!hasValidTargetCell) return false;

      const previewMutation = assignGalleryPhotoToCell(
        galeriaActual,
        { index: indexActual },
        photoInput,
        { clear: !photoInput }
      );
      if (!previewMutation.changed) return false;

      const nextActiveCell = resolveNextActiveCell(galeriaActual, indexActual, photoInput);

      setObjetos((prev) => {
        const i = prev.findIndex((o) => o.id === objId);
        if (i === -1) return prev;

        const obj = prev[i];
        if (obj.tipo !== "galeria") return prev;
        if (!canEditObject(obj, { secciones })) return prev;
        const targetCellStillValid = getGallerySlots(obj, { visibleOnly: true }).some(
          (slot) => Number(slot?.sourceIndex) === indexActual
        );
        if (!targetCellStillValid) return prev;

        const mutation = assignGalleryPhotoToCell(
          obj,
          { index: indexActual },
          photoInput,
          { clear: !photoInput }
        );
        if (!mutation.changed) return prev;

        const next = [...prev];
        next[i] = mutation.gallery;
        return next;
      });

      setCeldaGaleriaActiva(nextActiveCell);
      return true;
    };

    return () => {
      if (window.asignarImagenACelda) delete window.asignarImagenACelda;
    };
  }, [celdaGaleriaActiva, secciones, setObjetos, setCeldaGaleriaActiva]);

  // ------------------------------------------------------------
  // 2) Evento global: insertar-elemento
  // ------------------------------------------------------------
  useEffect(() => {
    const handler = (e) => {
      const nuevo = e.detail || {};

      const fallbackId =
        window._lastSeccionActivaId ||
        (Array.isArray(secciones) && secciones[0]?.id) ||
        null;

      const targetSeccionId = seccionActivaId || fallbackId;

      if (!targetSeccionId) {
        alert("⚠️ No hay secciones aún. Creá una sección para insertar el elemento.");
        return;
      }

      if (!canInsertIntoSection(targetSeccionId, secciones)) {
        return;
      }

      const nuevoConSeccion = computeInsertDefaults({
        payload: nuevo,
        targetSeccionId,
        secciones,
        normalizarAltoModo,
        ALTURA_PANTALLA_EDITOR,
      });

      const existingCountdownObject =
        nuevoConSeccion?.tipo === "countdown"
          ? readEditorObjectByType("countdown")
          : null;
      if (existingCountdownObject && !canEditObject(existingCountdownObject, { secciones })) {
        return;
      }
      const existingRsvpObject =
        nuevoConSeccion?.tipo === "rsvp-boton"
          ? readEditorObjectByType("rsvp-boton")
          : null;
      if (existingRsvpObject && !canEditObject(existingRsvpObject, { secciones })) {
        return;
      }
      const existingGiftObject =
        nuevoConSeccion?.tipo === "regalo-boton"
          ? readEditorObjectByType("regalo-boton")
          : null;
      if (existingGiftObject && !canEditObject(existingGiftObject, { secciones })) {
        return;
      }
      const existingCountdownId = existingCountdownObject?.id || null;
      const existingRsvpId = existingRsvpObject?.id || null;
      const existingGiftId = existingGiftObject?.id || null;

      setObjetos((prev) => {
        if (nuevoConSeccion?.tipo !== "countdown") {
          if (isFunctionalCtaButton(nuevoConSeccion)) {
            if (findFunctionalCtaButtonByType(prev, nuevoConSeccion?.tipo)) {
              return prev;
            }
          }
          return [...prev, nuevoConSeccion];
        }

        const countdownIndexes = [];
        for (let i = 0; i < prev.length; i += 1) {
          if (prev[i]?.tipo === "countdown") countdownIndexes.push(i);
        }

        const countdownFromRuntime = existingCountdownId
          ? findRenderObjectById(prev, existingCountdownId)
          : null;
        const existingCountdown =
          countdownFromRuntime?.tipo === "countdown"
            ? countdownFromRuntime
            : countdownIndexes.length > 0
              ? prev[countdownIndexes[0]]
              : null;

        if (!existingCountdown) {
          return [...prev, nuevoConSeccion];
        }

        if (!canEditObject(existingCountdown, { secciones })) {
          return prev;
        }
        const mutation = updateRenderObjectById(
          prev,
          existingCountdown.id,
          (currentObject) =>
            applyCountdownPresetToExisting(currentObject, nuevoConSeccion)
        );
        if (!mutation.changed) return prev;

        const primaryIndex = countdownIndexes[0];
        if (primaryIndex < 0 || prev[primaryIndex]?.id !== existingCountdown.id) {
          return mutation.objetos;
        }

        // Enforce global uniqueness: mantenemos solo un countdown por borrador.
        return mutation.objetos.filter(
          (obj, index) => obj?.tipo !== "countdown" || index === primaryIndex
        );
      });

      const selectedId =
        existingCountdownId || existingRsvpId || existingGiftId || nuevoConSeccion.id;
      const shouldSelectInsertedElement =
        nuevoConSeccion?.tipo !== "mapa-google" ||
        isEventGoogleMapVisible(nuevoConSeccion);
      if (shouldSelectInsertedElement) {
        setElementosSeleccionados([selectedId]);
      }

      if (nuevoConSeccion?.tipo === "rsvp-boton" && !existingRsvpId && typeof setRsvpConfig === "function") {
        const hasConfig = isRsvpConfigV2(rsvpConfig);
        const baseConfig = hasConfig
          ? normalizeRsvpConfig(rsvpConfig, { forceEnabled: false })
          : createDefaultRsvpConfig("minimal");

        setRsvpConfig(baseConfig);
        if (typeof onRequestRsvpSetup === "function") {
          onRequestRsvpSetup({
            forcePresetSelection: !hasConfig,
            source: "insert-rsvp-button",
          });
        }
      }

      if (nuevoConSeccion?.tipo === "regalo-boton" && !existingGiftId && typeof setGiftsConfig === "function") {
        const hasConfig = isGiftConfigV1(giftsConfig);
        const baseConfig = hasConfig
          ? normalizeGiftConfig(giftsConfig, { forceEnabled: false })
          : createDefaultGiftConfig();

        setGiftsConfig(baseConfig);
        if (typeof onRequestGiftSetup === "function") {
          onRequestGiftSetup({
            source: "insert-gift-button",
          });
        }
      }
    };

    window.addEventListener("insertar-elemento", handler);
    return () => window.removeEventListener("insertar-elemento", handler);
  }, [
    seccionActivaId,
    secciones,
    setObjetos,
    setElementosSeleccionados,
    rsvpConfig,
    setRsvpConfig,
    giftsConfig,
    setGiftsConfig,
    onRequestRsvpSetup,
    onRequestGiftSetup,
    normalizarAltoModo,
    ALTURA_PANTALLA_EDITOR,
  ]);

  // ------------------------------------------------------------
  // 3) Evento global: actualizar-elemento
  // ------------------------------------------------------------
  useEffect(() => {
    const handler = (e) => {
      const { id, cambios } = e.detail || {};
      if (!cambios) return;

      const targetId =
        id || (readEditorSelectionSnapshot().selectedIds?.[0] ?? null);
      if (!targetId) return;

      setObjetos((prev) => {
        const i = prev.findIndex((o) => o.id === targetId);
        if (i === -1) {
          if (!canEditObjectById(targetId, { objetos: prev, secciones })) return prev;
          return applyObjectUpdateById(prev, targetId, cambios);
        }

        const next = [...prev];
        const currentObject = next[i];
        if (!canEditObject(currentObject, { secciones })) return prev;
        const mergedObject = { ...currentObject, ...cambios };

        if (mergedObject?.tipo === "galeria" && hasGalleryStructuralChanges(cambios)) {
          const isDynamicGallery =
            String(mergedObject?.galleryLayoutMode || "").trim().toLowerCase() === "dynamic_media";

          if (isDynamicGallery) {
            const galleryLayoutBlueprint = buildGalleryLayoutBlueprintFromObject(mergedObject, {
              width: mergedObject.width,
            });
            const dynamicPatch = buildDynamicGalleryObjectPatch({
              galleryObject: {
                ...mergedObject,
                galleryLayoutBlueprint,
              },
              mediaUrls: collectGalleryMediaUrls(mergedObject.cells),
              layoutBlueprint: galleryLayoutBlueprint,
            });

            next[i] = {
              ...currentObject,
              ...cambios,
              ...dynamicPatch,
            };
          } else {
            next[i] = {
              ...currentObject,
              ...cambios,
              ...buildFixedGalleryObjectPatch(mergedObject),
            };
          }
        } else {
          next[i] = mergedObject;
        }

        if (next[i]?.tipo === "countdown") {
          return next.filter((obj, index) => obj?.tipo !== "countdown" || index === i);
        }

        return next;
      });

      if (
        cambios.mostrarCuentaRegresiva === false ||
        cambios.mostrarMapa === false ||
        cambios.hidden === true
      ) {
        setElementosSeleccionados((prev) =>
          Array.isArray(prev)
            ? prev.filter((selectedId) => selectedId !== targetId)
            : prev
        );
      }

      // ✅ NUEVO: avisar a SelectionBounds que reattach el transformer
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.dispatchEvent(
            new CustomEvent("element-ref-registrado", {
              detail: { id: targetId },
            })
          );
        });
      });
    };

    window.addEventListener("actualizar-elemento", handler);
    return () => window.removeEventListener("actualizar-elemento", handler);
  }, [secciones, setElementosSeleccionados, setObjetos]);

  // ------------------------------------------------------------
  // 4) Evento global: aplicar-estilo-efectos
  // ------------------------------------------------------------
  useEffect(() => {
    const handler = (e) => {
      const presetId = e?.detail?.presetId;
      const normalizedPresetId = typeof presetId === "string" ? presetId : "";
      const summary = {
        presetId: normalizedPresetId,
        total: 0,
        changed: 0,
        totalSections: 0,
        changedSections: 0,
      };

      setObjetos((prev) => {
        const current = Array.isArray(prev) ? prev : [];
        const next =
          normalizedPresetId === CLEAR_ALL_MOTION_PRESET_ID
            ? clearAllMotionEffects(current)
            : applyGlobalMotionPreset(current, {
              presetId,
              secciones,
            });
        const protectedAwareNext = next.map((item, index) =>
          canEditObject(current[index], { secciones }) ? item : current[index]
        );

        summary.total = protectedAwareNext.length;
        summary.changed = protectedAwareNext.reduce((acc, item, index) => {
          const beforeEffect = sanitizeMotionEffect(current[index]?.motionEffect);
          return acc + (beforeEffect !== item.motionEffect ? 1 : 0);
        }, 0);
        return protectedAwareNext;
      });

      if (typeof setSecciones === "function") {
        setSecciones((prev) => {
          const currentSections = Array.isArray(prev) ? prev : [];
          const nextSections = applyGlobalMotionPresetToSections(currentSections, {
            presetId: normalizedPresetId,
          }).map((section, index) =>
            canMutateSection(currentSections[index]) ? section : currentSections[index]
          );

          summary.totalSections = currentSections.reduce((acc, section) => {
            const backgroundModel = normalizeSectionBackgroundModel(section, {
              sectionHeight: section?.altura,
            });
            return acc + (backgroundModel.decoraciones.length > 0 ? 1 : 0);
          }, 0);

          summary.changedSections = nextSections.reduce((acc, section, index) => {
            const currentSection = currentSections[index];
            const currentBackgroundModel = normalizeSectionBackgroundModel(currentSection, {
              sectionHeight: currentSection?.altura,
            });

            if (!currentBackgroundModel.decoraciones.length) return acc;

            const nextBackgroundModel = normalizeSectionBackgroundModel(section, {
              sectionHeight: section?.altura,
            });

            return acc + (currentBackgroundModel.parallax !== nextBackgroundModel.parallax ? 1 : 0);
          }, 0);

          return nextSections;
        });
      }

      requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent("motion-effects-applied", {
            detail: summary,
          })
        );
      });
    };

    window.addEventListener("aplicar-estilo-efectos", handler);
    return () => window.removeEventListener("aplicar-estilo-efectos", handler);
  }, [setObjetos, setSecciones, secciones]);

  // ------------------------------------------------------------
  // 5) Evento global: agregar-cuadro-texto
  // ------------------------------------------------------------
  useEffect(() => {
    const handler = () => {
      if (!seccionActivaId) {
        alert("Seleccioná una sección antes de agregar un cuadro de texto.");
        return;
      }

      if (!canInsertIntoSection(seccionActivaId, secciones)) {
        return;
      }

      const nuevo = {
        id: `texto-${Date.now()}`,
        tipo: "texto",
        texto: "Texto",
        x: 100,
        y: 100,
        motionEffect: sanitizeMotionEffect("none"),
        fontSize: 24,
        color: "#000000",
        fontFamily: "sans-serif",
        fontWeight: "normal",
        fontStyle: "normal",
        textDecoration: "none",
        align: "left",
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        seccionId: seccionActivaId,
      };

      // ✅ Si la sección activa es pantalla, inicializamos yNorm
      const secActiva = secciones.find((s) => s.id === seccionActivaId);
      if (normalizarAltoModo(secActiva?.altoModo) === "pantalla") {
        nuevo.yNorm = Math.max(
          0,
          Math.min(1, (Number(nuevo.y) || 0) / ALTURA_PANTALLA_EDITOR)
        );
      }

      // ✅ respeta el comportamiento original
      if (nuevoTextoRef?.current != null) {
        nuevoTextoRef.current = nuevo.id;
      }

      setObjetos((prev) => [...prev, nuevo]);
    };

    window.addEventListener("agregar-cuadro-texto", handler);
    return () => window.removeEventListener("agregar-cuadro-texto", handler);
  }, [
    seccionActivaId,
    secciones,
    setObjetos,
    normalizarAltoModo,
    ALTURA_PANTALLA_EDITOR,
    nuevoTextoRef,
  ]);
}

