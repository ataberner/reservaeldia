// src/components/editor/events/useEditorEvents.js
import { useEffect } from "react";
import computeInsertDefaults from "./computeInsertDefaults";

const COUNTDOWN_STYLE_KEYS = [
  "fontFamily",
  "fontSize",
  "color",
  "labelColor",
  "showLabels",
  "boxBg",
  "boxBorder",
  "boxRadius",
  "boxShadow",
  "separator",
  "gap",
  "paddingX",
  "paddingY",
  "chipWidth",
  "labelSize",
  "padZero",
  "layout",
  "background",
];

function pickCountdownStylePatch(source = {}) {
  return COUNTDOWN_STYLE_KEYS.reduce((acc, key) => {
    acc[key] = source[key];
    return acc;
  }, {});
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

  secciones,
  seccionActivaId,

  setElementosSeleccionados,

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
    window.asignarImagenACelda = (mediaUrl, fit = "cover", bg) => {
      if (!celdaGaleriaActiva) return false; // no hay slot activo
      const { objId, index } = celdaGaleriaActiva;
      const indexActual = Number(index);
      let nextActiveCell = null;

      const hayImagenNueva = typeof mediaUrl === "string" && mediaUrl.trim().length > 0;
      if (hayImagenNueva && Number.isFinite(indexActual)) {
        const objetosActuales = Array.isArray(window._objetosActuales)
          ? window._objetosActuales
          : [];
        const galeriaActual = objetosActuales.find(
          (o) => o?.id === objId && o?.tipo === "galeria"
        );
        const cellsActuales = Array.isArray(galeriaActual?.cells) ? galeriaActual.cells : [];

        if (cellsActuales.length > 1) {
          const projectedCells = [...cellsActuales];
          projectedCells[indexActual] = {
            ...(projectedCells[indexActual] || {}),
            mediaUrl,
          };

          let siguienteVacia = -1;
          for (let step = 1; step < projectedCells.length; step += 1) {
            const candidate = (indexActual + step) % projectedCells.length;
            if (!projectedCells[candidate]?.mediaUrl) {
              siguienteVacia = candidate;
              break;
            }
          }

          if (siguienteVacia === -1) {
            siguienteVacia = (indexActual + 1) % projectedCells.length;
          }

          if (siguienteVacia !== indexActual) {
            nextActiveCell = { objId, index: siguienteVacia };
          }
        }
      }

      setObjetos((prev) => {
        const i = prev.findIndex((o) => o.id === objId);
        if (i === -1) return prev;

        const obj = prev[i];
        if (obj.tipo !== "galeria") return prev;

        const next = [...prev];
        const cells = Array.isArray(obj.cells) ? [...obj.cells] : [];
        const prevCell = cells[index] || {};
        cells[index] = {
          ...prevCell,
          mediaUrl,
          fit: fit || prevCell.fit || "cover",
          bg: bg ?? prevCell.bg ?? "#f3f4f6",
        };

        next[i] = { ...obj, cells };
        return next;
      });

      setCeldaGaleriaActiva(nextActiveCell);
      return true;
    };

    return () => {
      if (window.asignarImagenACelda) delete window.asignarImagenACelda;
    };
  }, [celdaGaleriaActiva, setObjetos, setCeldaGaleriaActiva]);

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

      const nuevoConSeccion = computeInsertDefaults({
        payload: nuevo,
        targetSeccionId,
        secciones,
        normalizarAltoModo,
        ALTURA_PANTALLA_EDITOR,
      });

      const existingCountdownId =
        nuevoConSeccion?.tipo === "countdown"
          ? (Array.isArray(window._objetosActuales)
            ? window._objetosActuales.find((o) => o?.tipo === "countdown")?.id
            : null)
          : null;

      setObjetos((prev) => {
        if (nuevoConSeccion?.tipo !== "countdown") {
          return [...prev, nuevoConSeccion];
        }

        const countdownIndexes = [];
        for (let i = 0; i < prev.length; i += 1) {
          if (prev[i]?.tipo === "countdown") countdownIndexes.push(i);
        }

        if (countdownIndexes.length === 0) {
          return [...prev, nuevoConSeccion];
        }

        const primaryIndex = countdownIndexes[0];
        const existingCountdown = prev[primaryIndex];
        const stylePatch = pickCountdownStylePatch(nuevoConSeccion);

        const nextCountdown = {
          ...existingCountdown,
          ...stylePatch,
          fechaObjetivo: nuevoConSeccion.fechaObjetivo ?? existingCountdown.fechaObjetivo,
          presetId: nuevoConSeccion.presetId,
        };

        // Enforce global uniqueness: mantenemos solo un countdown por borrador.
        const next = prev.filter(
          (obj, index) => obj?.tipo !== "countdown" || index === primaryIndex
        );
        next[primaryIndex] = nextCountdown;
        return next;
      });

      setElementosSeleccionados([existingCountdownId || nuevoConSeccion.id]);
    };

    window.addEventListener("insertar-elemento", handler);
    return () => window.removeEventListener("insertar-elemento", handler);
  }, [
    seccionActivaId,
    secciones,
    setObjetos,
    setElementosSeleccionados,
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

      const targetId = id || (window._elementosSeleccionados?.[0] ?? null);
      if (!targetId) return;

      setObjetos((prev) => {
        const i = prev.findIndex((o) => o.id === targetId);
        if (i === -1) return prev;

        const next = [...prev];
        next[i] = { ...next[i], ...cambios };

        if (next[i]?.tipo === "countdown") {
          return next.filter((obj, index) => obj?.tipo !== "countdown" || index === i);
        }

        return next;
      });

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
  }, [setObjetos]);

  // ------------------------------------------------------------
  // 4) Evento global: agregar-cuadro-texto
  // ------------------------------------------------------------
  useEffect(() => {
    const handler = () => {
      if (!seccionActivaId) {
        alert("Seleccioná una sección antes de agregar un cuadro de texto.");
        return;
      }

      const nuevo = {
        id: `texto-${Date.now()}`,
        tipo: "texto",
        texto: "Texto",
        x: 100,
        y: 100,
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

