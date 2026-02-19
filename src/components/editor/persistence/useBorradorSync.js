// src/components/editor/persistence/useBorradorSync.js
import { useEffect, useRef } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { db, storage } from "@/firebase";
import {
  captureEditorIssue,
  pushEditorBreadcrumb,
} from "@/lib/monitoring/editorIssueReporter";

function parseStorageLocationFromUrl(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return null;

  try {
    const url = new URL(value);

    if (
      url.hostname === "firebasestorage.googleapis.com" ||
      url.hostname.endsWith(".firebasestorage.app")
    ) {
      const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/i);
      if (!match) return null;

      const bucketName = decodeURIComponent(match[1] || "");
      const path = decodeURIComponent(match[2] || "");
      if (!bucketName || !path) return null;
      return { bucketName, path };
    }

    if (url.hostname === "storage.googleapis.com") {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length < 2) return null;

      const bucketName = decodeURIComponent(segments[0] || "");
      const path = decodeURIComponent(segments.slice(1).join("/"));
      if (!bucketName || !path) return null;
      return { bucketName, path };
    }

    return null;
  } catch {
    return null;
  }
}

async function refreshStorageUrl(value, cache) {
  const location = parseStorageLocationFromUrl(value);
  if (!location) return value;

  const cacheKey = `${location.bucketName}/${location.path}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const hasTokenInUrl =
    typeof value === "string" &&
    /[?&]token=/.test(value);
  const isUserPrivatePath = /^usuarios\//i.test(location.path || "");

  // Evita ruido 404 al intentar "refrescar" URLs ya tokenizadas de uploads privados.
  // Si el token sigue vigente, la URL funciona; si vencio, fallara al renderizar sin romper la carga.
  if (isUserPrivatePath && hasTokenInUrl) {
    cache.set(cacheKey, value);
    return value;
  }

  try {
    const gsUrl = `gs://${location.bucketName}/${location.path}`;
    const freshUrl = await getDownloadURL(storageRef(storage, gsUrl));
    cache.set(cacheKey, freshUrl);
    return freshUrl;
  } catch (error) {
    pushEditorBreadcrumb("storage-url-refresh-failed", {
      code: error?.code || null,
      bucketName: location.bucketName,
      path: location.path,
    });
    // Mantener la URL original evita "romper" plantillas compartidas
    // cuando el SDK no puede refrescar el token por reglas/bucket.
    cache.set(cacheKey, value);
    return value;
  }
}

async function refreshUrlsDeep(value, cache) {
  if (typeof value === "string") {
    return refreshStorageUrl(value, cache);
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => refreshUrlsDeep(item, cache)));
  }

  if (value && typeof value === "object") {
    const pairs = await Promise.all(
      Object.entries(value).map(async ([key, nested]) => {
        const refreshed = await refreshUrlsDeep(nested, cache);
        return [key, refreshed];
      })
    );
    return Object.fromEntries(pairs);
  }

  return value;
}

function isMobileRuntime() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) {
    return true;
  }
  const w = Number(window.innerWidth || 0);
  const h = Number(window.innerHeight || 0);
  const minSide = Math.min(w, h);
  return minSide > 0 && minSide <= 1024;
}

/**
 * Hook de sincronizacion Firestore para el borrador (carga + guardado con debounce).
 * Mantiene la logica original de CanvasEditor.
 */
export default function useBorradorSync({
  slug,
  userId,

  // estado actual
  objetos,
  secciones,
  cargado,

  // setters
  setObjetos,
  setSecciones,
  setCargado,
  setSeccionActivaId,

  // refs / helpers que ya existen en CanvasEditor
  ignoreNextUpdateRef,
  stageRef,

  // helpers de tu layout actual
  normalizarAltoModo,
  validarPuntosLinea,

  // constantes
  ALTURA_PANTALLA_EDITOR,
}) {
  const skipNextPersistRef = useRef(true);

  // helper: limpiar undefined recursivo
  const limpiarUndefined = (obj) => {
    if (Array.isArray(obj)) return obj.map(limpiarUndefined);

    if (obj !== null && typeof obj === "object") {
      const objLimpio = {};
      Object.keys(obj).forEach((key) => {
        const valor = obj[key];
        if (valor !== undefined) objLimpio[key] = limpiarUndefined(valor);
      });
      return objLimpio;
    }

    return obj;
  };

  // 1) Cargar borrador desde Firestore
  useEffect(() => {
    if (!slug) return;

    // Al cambiar de borrador, evitamos persistir inmediatamente tras hidratar estado.
    skipNextPersistRef.current = true;

    const cargar = async () => {
      pushEditorBreadcrumb("borrador-load-start", { slug });

      try {
        const ref = doc(db, "borradores", slug);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          const seccionesData = data.secciones || [];
          const objetosData = data.objetos || [];

          // Refresca URLs de Firebase Storage por si hay tokens vencidos/revocados.
          const refreshCache = new Map();
          const [seccionesRefrescadas, objetosRefrescados] = await Promise.all([
            refreshUrlsDeep(seccionesData, refreshCache),
            refreshUrlsDeep(objetosData, refreshCache),
          ]);

          // Mantengo tu migracion de yNorm para secciones pantalla
          const objsMigrados = objetosRefrescados.map((o) => {
            if (!o?.seccionId) return o;

            const sec = seccionesRefrescadas.find((s) => s.id === o.seccionId);
            const modo = normalizarAltoModo(sec?.altoModo);

            if (modo === "pantalla") {
              if (!Number.isFinite(o.yNorm)) {
                const yPx = Number.isFinite(o.y) ? o.y : 0;
                const yNorm = Math.max(0, Math.min(1, yPx / ALTURA_PANTALLA_EDITOR));
                return { ...o, yNorm };
              }
            }

            return o;
          });

          setObjetos(objsMigrados);
          setSecciones(seccionesRefrescadas);

          pushEditorBreadcrumb("borrador-load-success", {
            slug,
            objetos: objsMigrados.length,
            secciones: seccionesRefrescadas.length,
          });

          // Setear primera seccion activa si no hay
          if (typeof setSeccionActivaId === "function" && seccionesRefrescadas.length > 0) {
            setSeccionActivaId((prev) => prev || seccionesRefrescadas[0].id);
          }
        } else {
          pushEditorBreadcrumb("borrador-load-missing", { slug });
        }
      } catch (error) {
        captureEditorIssue({
          source: "useBorradorSync.load",
          error,
          detail: { slug },
          severity: "fatal",
        });
      }

      setCargado(true);
    };

    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // 2) Guardar en Firestore con debounce cuando cambian objetos/secciones
  useEffect(() => {
    if (!cargado) return;
    if (!slug) return;

    // Evita write + thumbnail justo al terminar la carga inicial (causa inestabilidad móvil en borradores pesados).
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    if (ignoreNextUpdateRef?.current) {
      requestAnimationFrame(() => {
        ignoreNextUpdateRef.current = Math.max(0, (ignoreNextUpdateRef.current || 0) - 1);
      });
      return;
    }

    // No guardar durante resize (logica actual)
    if (window._resizeData?.isResizing) return;

    const timeoutId = setTimeout(async () => {
      try {
        // Validacion: lineas + normalizacion de textos
        const objetosValidados = (objetos || []).map((obj) => {
          if (obj?.tipo === "forma" && obj?.figura === "line") {
            return validarPuntosLinea(obj);
          }

          if (obj?.tipo === "texto") {
            return {
              ...obj,
              color: obj.colorTexto || obj.color || obj.fill || "#000000",
              stroke: obj.stroke || null,
              strokeWidth: obj.strokeWidth || 0,
              shadowColor: obj.shadowColor || null,
              shadowBlur: obj.shadowBlur || 0,
              shadowOffsetX: obj.shadowOffsetX || 0,
              shadowOffsetY: obj.shadowOffsetY || 0,
            };
          }

          return obj;
        });

        const seccionesLimpias = limpiarUndefined(secciones);
        const objetosLimpios = limpiarUndefined(objetosValidados);

        const ref = doc(db, "borradores", slug);
        await updateDoc(ref, {
          objetos: objetosLimpios,
          secciones: seccionesLimpias,
          ultimaEdicion: serverTimestamp(),
        });

        // Thumbnail (mantengo tu logica con import dinamico)
        if (stageRef?.current && userId && slug) {
          // En mobile pesado, generar thumbnail al vuelo puede tumbar la pestaña.
          if (isMobileRuntime()) return;
          const { guardarThumbnailDesdeStage } = await import("@/utils/guardarThumbnail");
          await guardarThumbnailDesdeStage({ stageRef, uid: userId, slug });
        }
      } catch (error) {
        console.error("Error guardando en Firebase:", error);
        captureEditorIssue({
          source: "useBorradorSync.save",
          error,
          detail: {
            slug,
            objetos: Array.isArray(objetos) ? objetos.length : null,
            secciones: Array.isArray(secciones) ? secciones.length : null,
          },
          severity: "error",
        });
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [objetos, secciones, cargado, slug, userId, ignoreNextUpdateRef, stageRef, validarPuntosLinea]);
}
