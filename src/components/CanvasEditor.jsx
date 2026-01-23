// components/CanvasEditor.jsx
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Stage, Layer, Line, Rect, Text, Transformer, Image as KonvaImage, Group, Circle } from "react-konva";
import { doc, getDoc, updateDoc, serverTimestamp, addDoc, collection } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import ElementoCanvas from "./ElementoCanvas";
import LineControls from "./LineControls";
import ReactDOMServer from "react-dom/server";
import { calcularOffsetY, convertirAbsARel, determinarNuevaSeccion } from "@/utils/layout";
import { crearSeccion } from "@/models/estructuraInicial";
import usePlantillasDeSeccion from "@/hooks/usePlantillasDeSeccion";
import { useImperativeObjects } from '@/hooks/useImperativeObjects';
import SelectionBounds from './SelectionBounds';
import HoverIndicator from './HoverIndicator';
import LineToolbar from "./LineToolbar";
import useImage from "use-image";
import useKeyboardShortcuts from '@/hooks/useKeyboardShortcuts';
import { fontManager } from '../utils/fontManager';
import useInlineEditor from "@/hooks/useInlineEditor";
import ShapeToolbar from './ShapeToolbar';
import useEditorHandlers from '@/hooks/useEditorHandlers';
import InlineTextEditor from "./InlineTextEditor";
import FontSelector from './FontSelector';
import { guardarThumbnailDesdeStage } from "@/utils/guardarThumbnail";
import { reemplazarFondoSeccion as reemplazarFondo } from "@/utils/accionesFondo";
import { desanclarImagenDeFondo as desanclarFondo } from "@/utils/accionesFondo";
import { borrarSeccion as borrarSeccionExternal } from "@/utils/editorSecciones";
import { moverSeccion as moverSeccionExternal } from "@/utils/editorSecciones";
import { validarPuntosLinea, detectarInterseccionLinea } from "@/components/editor/selection/selectionUtils";
import { guardarSeccionComoPlantilla } from "@/utils/plantillas";
import GaleriaKonva from "@/components/editor/GaleriaKonva";
import FondoSeccion from './editor/FondoSeccion';
import MenuOpcionesElemento from "./MenuOpcionesElemento";
import { calcGalleryLayout } from "@/utils/calcGrid";
import CountdownKonva from "@/components/editor/countdown/CountdownKonva";
import useGuiasCentrado from '@/hooks/useGuiasCentrado';
import FloatingTextToolbar from "@/components/editor/toolbar/FloatingTextToolbar";
import SelectorColorSeccion from "./SelectorColorSeccion";
import Konva from "konva";
import { ALL_FONTS } from '../config/fonts';
import { useAuthClaims } from "@/hooks/useAuthClaims";
import {
  Check,
  RotateCcw,
  Copy,
  Trash2,
  Layers,
  ArrowDown,
  ArrowUp,
  MoveUp,
  MoveDown,
  PlusCircle,
  ClipboardPaste,
} from "lucide-react";


Konva.dragDistance = 4;

// 🛠️ FUNCIÓN HELPER PARA LIMPIAR UNDEFINED
const limpiarObjetoUndefined = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(limpiarObjetoUndefined);
  }

  if (obj !== null && typeof obj === 'object') {
    const objLimpio = {};
    Object.keys(obj).forEach(key => {
      const valor = obj[key];
      if (valor !== undefined) {
        objLimpio[key] = limpiarObjetoUndefined(valor);
      }
    });
    return objLimpio;
  }

  return obj;
};


const iconoRotacion = ReactDOMServer.renderToStaticMarkup(<RotateCcw color="black" />);
const urlData = "data:image/svg+xml;base64," + btoa(iconoRotacion);


// Utils de cursor global (arriba del componente)
function setGlobalCursor(cursor = '', stageRef = null) {
  try {
    document.body.style.cursor = cursor || '';
    // 💡 limpiamos también el contenedor del Stage si existe
    const stage = stageRef?.current?.container?.() || null;
    if (stage) stage.style.cursor = cursor || '';
    // fallback: canvas principal
    const canvas = document.querySelector('canvas');
    if (canvas && canvas.parentElement) canvas.parentElement.style.cursor = cursor || '';
  } catch { }
}

function clearGlobalCursor(stageRef = null) {
  setGlobalCursor('', stageRef);
}




export default function CanvasEditor({ slug, zoom = 1, onHistorialChange, onFuturosChange, userId }) {
  const [objetos, setObjetos] = useState([]);
  const [celdaGaleriaActiva, setCeldaGaleriaActiva] = useState(null);
  const [secciones, setSecciones] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [futuros, setFuturos] = useState([]);
  const [elementosSeleccionados, setElementosSeleccionados] = useState([]);
  const [cargado, setCargado] = useState(false);
  const stageRef = useRef(null);
  const dragStartPos = useRef(null);
  const hasDragged = useRef(false);
  const [controlandoAltura, setControlandoAltura] = useState(false);
  const [alturaInicial, setAlturaInicial] = useState(0);
  const [posicionInicialMouse, setPosicionInicialMouse] = useState(0);
  const imperativeObjects = useImperativeObjects();
  const [animandoSeccion, setAnimandoSeccion] = useState(null);
  const [seccionActivaId, setSeccionActivaId] = useState(null);
  const [seleccionActiva, setSeleccionActiva] = useState(false);
  const [inicioSeleccion, setInicioSeleccion] = useState(null);
  const [areaSeleccion, setAreaSeleccion] = useState(null);
  const [elementosPreSeleccionados, setElementosPreSeleccionados] = useState([]);
  const guiaLayerRef = useRef(null);
  const [hoverId, setHoverId] = useState(null);
  const altoCanvas = secciones.reduce((acc, s) => acc + s.altura, 0) || 800;
  const [scale, setScale] = useState(1);
  const [seccionesAnimando, setSeccionesAnimando] = useState([]);
  const { refrescar: refrescarPlantillasDeSeccion } = usePlantillasDeSeccion();
  const [elementoCopiado, setElementoCopiado] = useState(null);
  const elementRefs = useRef({});
  const contenedorRef = useRef(null);
  const ignoreNextUpdateRef = useRef(false);
  const [anchoStage, setAnchoStage] = useState(800);
  const [mostrarSelectorFuente, setMostrarSelectorFuente] = useState(false);
  const [mostrarSubmenuCapa, setMostrarSubmenuCapa] = useState(false);
  const fuentesDisponibles = ALL_FONTS;
  const { esAdmin, loadingClaims } = useAuthClaims();


  const {
    editing,      // { id, value }
    startEdit,    // (id, initial)
    updateEdit,   // (nuevoValor)
    finishEdit    // () => void
  } = useInlineEditor();


  const cerrarMenusFlotantes = useCallback(() => {
    setMostrarPanelZ(false);
    setMostrarSubmenuCapa(false);
    setMostrarSelectorFuente(false);
    setMostrarSelectorTamaño(false);
    setHoverId(null);
  }, []);



  // 🆕 Elemento actualmente seleccionado (o null)
  const objetoSeleccionado =
    elementosSeleccionados.length === 1
      ? objetos.find(o => o.id === elementosSeleccionados[0])
      : null;

  const [mostrarSelectorTamaño, setMostrarSelectorTamaño] = useState(false);
  const tamaniosDisponibles = Array.from({ length: (120 - 6) / 2 + 1 }, (_, i) => 6 + i * 2);
  const [icono] = useImage(urlData);
  const nuevoTextoRef = useRef(null);
  const botonOpcionesRef = useRef(null);


  const registerRef = useCallback((id, node) => {
    elementRefs.current[id] = node;
    imperativeObjects.registerObject(id, node);
  }, [imperativeObjects]);




  useEffect(() => {
    // ✅ EXPONER ESTADO DE EDICIÓN GLOBALMENTE
    window.editing = editing;

    return () => {
      if (window.editing && window.editing.id === editing.id) {
        delete window.editing;
      }
    };
  }, [editing.id, editing.value]);


  // 🎨 Función para actualizar offsets de imagen de fondo (SIN UNDEFINED)
  const actualizarOffsetFondo = useCallback((seccionId, nuevosOffsets, esPreview = false) => {
    setSecciones(prev =>
      prev.map(s => {
        if (s.id !== seccionId) return s;

        // 🔥 CREAR OBJETO LIMPIO
        const seccionActualizada = { ...s };

        // 🔥 SOLO AGREGAR CAMPOS SI TIENEN VALORES VÁLIDOS
        if (nuevosOffsets.offsetX !== undefined && nuevosOffsets.offsetX !== null) {
          seccionActualizada.fondoImagenOffsetX = nuevosOffsets.offsetX;
        }
        if (nuevosOffsets.offsetY !== undefined && nuevosOffsets.offsetY !== null) {
          seccionActualizada.fondoImagenOffsetY = nuevosOffsets.offsetY;
        }

        return seccionActualizada;
      })
    );
  }, [setSecciones]);

  // Asigna una imagen (por URL) a la celda activa
  function asignarImagenAGaleria(url) {
    setObjetos((prev) => {
      if (!celdaGaleriaActiva) return prev;
      const { objId, index } = celdaGaleriaActiva;
      const i = prev.findIndex(o => o.id === objId && o.tipo === "galeria");
      if (i === -1) return prev;

      const copia = structuredClone(prev);
      const g = copia[i];
      // Seguridad: que exista y que haya cells[index]
      if (!g?.cells || !g.cells[index]) return prev;

      g.cells[index] = {
        ...(g.cells[index] ?? {}),
        mediaUrl: url,
        fit: g.cells[index]?.fit ?? "cover",
        bg: g.cells[index]?.bg ?? "#eee",
      };
      return copia;
    });
  }


  // ✅ Recordar la última sección válida para usarla como fallback
  useEffect(() => {
    if (seccionActivaId) {
      window._lastSeccionActivaId = seccionActivaId;
    }
  }, [seccionActivaId]);


  // CanvasEditor.jsx (dentro del componente, después de declarar estados)
  useEffect(() => {
    // expone una función global segura para asignar imagen a la celda activa
    window.asignarImagenACelda = (mediaUrl, fit = "cover", bg) => {
      if (!celdaGaleriaActiva) return false; // no hay slot activo
      const { objId, index } = celdaGaleriaActiva;

      setObjetos(prev => {
        const i = prev.findIndex(o => o.id === objId);
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

      // opcional: desactivar el slot activo después de asignar
      setCeldaGaleriaActiva(null);
      return true;
    };

    // cleanup opcional
    return () => { if (window.asignarImagenACelda) delete window.asignarImagenACelda; };
  }, [celdaGaleriaActiva, setObjetos]);



  useEffect(() => {
    // Limpiar flag de resize al montar el componente
    window._resizeData = null;
  }, []);

  const [mostrarPanelZ, setMostrarPanelZ] = useState(false);

  const moverElemento = (accion) => {
    const index = objetos.findIndex((o) => o.id === elementosSeleccionados[0]);
    if (index === -1) return;

    const nuevos = [...objetos];
    const [elemento] = nuevos.splice(index, 1);

    if (accion === "al-frente") {
      nuevos.push(elemento);
    } else if (accion === "al-fondo") {
      nuevos.unshift(elemento);
    } else if (accion === "subir" && index < objetos.length - 1) {
      nuevos.splice(index + 1, 0, elemento);
    } else if (accion === "bajar" && index > 0) {
      nuevos.splice(index - 1, 0, elemento);
    } else {
      nuevos.splice(index, 0, elemento); // sin cambios
    }

    setObjetos(nuevos);
    setMostrarPanelZ(false);
  };




  const {
    onDeshacer,
    onRehacer,
    onDuplicar,
    onEliminar,
    onCopiar,
    onPegar,
    onCambiarAlineacion
  } = useEditorHandlers({
    objetos,
    setObjetos,
    elementosSeleccionados,
    setElementosSeleccionados,
    historial,
    setHistorial,
    futuros,
    setFuturos,
    setSecciones,
    ignoreNextUpdateRef,
    setMostrarPanelZ
  });


  useEffect(() => {
    const handler = (e) => {
      handleCrearSeccion(e.detail);
    };

    window.addEventListener("crear-seccion", handler);
    return () => window.removeEventListener("crear-seccion", handler);
  }, []);



  useEffect(() => {
    const handler = (e) => {
      const nuevo = e.detail;
      console.log("[Canvas] insertar-elemento recibido:", nuevo);

      const fallbackId =
        window._lastSeccionActivaId ||
        (Array.isArray(secciones) && secciones[0]?.id) ||
        null;

      const targetSeccionId = seccionActivaId || fallbackId;
      console.log("[Canvas] seccionActivaId:", seccionActivaId, "fallbackId:", fallbackId, "→ targetSeccionId:", targetSeccionId);

      if (!targetSeccionId) {
        alert("⚠️ No hay secciones aún. Creá una sección para insertar el elemento.");
        return;
      }

      const nuevoConSeccion = { ...nuevo, seccionId: targetSeccionId };

      setObjetos((prev) => {
        const next = [...prev, nuevoConSeccion];
        console.log("[Canvas] Insertado tipo:", nuevoConSeccion.tipo, "id:", nuevoConSeccion.id, "objs:", prev.length, "→", next.length);
        return next;
      });

      setElementosSeleccionados([nuevoConSeccion.id]);
    };

    window.addEventListener("insertar-elemento", handler);
    return () => window.removeEventListener("insertar-elemento", handler);
  }, [seccionActivaId, secciones]);

  // Recordar última sección activa
  useEffect(() => {
    if (seccionActivaId) window._lastSeccionActivaId = seccionActivaId;
  }, [seccionActivaId]);





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
        seccionId: seccionActivaId
      };

      nuevoTextoRef.current = nuevo.id;
      setObjetos((prev) => [...prev, nuevo]);
    };

    window.addEventListener("agregar-cuadro-texto", handler);
    return () => window.removeEventListener("agregar-cuadro-texto", handler);
  }, [seccionActivaId]);




  useEffect(() => {
    if (!nuevoTextoRef.current) return;

    const obj = objetos.find((o) => o.id === nuevoTextoRef.current);
    if (obj) {
      setElementosSeleccionados([obj.id]);
      // NO iniciar edición automáticamente - solo seleccionar
      nuevoTextoRef.current = null;
    }
  }, [objetos]);




  useEffect(() => {
    const handleClickFuera = (e) => {
      if (!e.target.closest(".popup-fuente")) {
        setMostrarSelectorFuente(false);
      }
    };
    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, []);




  useEffect(() => {
    if (onHistorialChange) {

      onHistorialChange(historial);
    }
  }, [historial, onHistorialChange]);

  useEffect(() => {
    if (onFuturosChange) {

      onFuturosChange(futuros);
    }
  }, [futuros, onFuturosChange]);





  useEffect(() => {
    if (!contenedorRef.current || zoom !== 1) return;

    const actualizarEscala = () => {
      const anchoContenedor = contenedorRef.current.offsetWidth;
      const escala = anchoContenedor / 800;
      setScale(escala);
    };

    actualizarEscala();

    const observer = new ResizeObserver(actualizarEscala);
    observer.observe(contenedorRef.current);

    return () => observer.disconnect();
  }, [zoom]);



  useEffect(() => {
    // Pre-cargar fuentes populares al iniciar
    fontManager.preloadPopularFonts();

    // Escuchar evento de fuentes cargadas para redibujar
    const handleFontsLoaded = () => {
      if (stageRef.current) {
        stageRef.current.batchDraw();
      }
    };

    window.addEventListener('fonts-loaded', handleFontsLoaded);

    return () => {
      window.removeEventListener('fonts-loaded', handleFontsLoaded);
    };
  }, []);

  // Cargar fuentes usadas en objetos existentes
  useEffect(() => {
    const fuentesUsadas = objetos
      .filter(obj => obj.tipo === 'texto' && obj.fontFamily)
      .map(obj => obj.fontFamily);

    const fuentesUnicas = [...new Set(fuentesUsadas)];

    if (fuentesUnicas.length > 0) {
      fontManager.loadFonts(fuentesUnicas);
    }
  }, [objetos]);



  useEffect(() => {

  }, [seleccionActiva, areaSeleccion, inicioSeleccion]);

  useEffect(() => {
    const cargar = async () => {
      const ref = doc(db, "borradores", slug);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setObjetos(data.objetos || []);
        setSecciones(data.secciones || []);

        // ✅ Setea la primera sección como activa si hay
        if (!seccionActivaId && data.secciones && data.secciones.length > 0) {
          setSeccionActivaId(data.secciones[0].id);
        }
      }
      setCargado(true);
    };
    cargar();
  }, [slug]);


  // 📚 Sistema de historial completo (objetos + secciones)
  useEffect(() => {
    if (!cargado) return;

    if (ignoreNextUpdateRef.current) {
      ignoreNextUpdateRef.current = false;
      return;
    }

    // 🎯 No guardar historial durante transformaciones
    if (window._resizeData?.isResizing) {
      return;
    }

    // 🔥 Crear estado completo con objetos y secciones
    const estadoCompleto = {
      objetos: objetos,
      secciones: secciones,
      timestamp: Date.now()
    };

    const estadoStringified = JSON.stringify(estadoCompleto);

    setHistorial((prev) => {
      const ultimoStringified = prev.length > 0 ? JSON.stringify(prev[prev.length - 1]) : null;
      if (ultimoStringified !== estadoStringified) {
        const nuevoHistorial = [...prev.slice(-19), estadoCompleto]; // Limitar a 20 elementos

        return nuevoHistorial;
      }
      return prev;
    });

    // Limpiar futuros cuando hay nuevos cambios
    setFuturos([]);

    const timeoutId = setTimeout(async () => {
      try {
        // 🔥 FUNCIÓN PARA LIMPIAR UNDEFINED RECURSIVAMENTE
        const limpiarUndefined = (obj) => {
          if (Array.isArray(obj)) {
            return obj.map(limpiarUndefined);
          }

          if (obj !== null && typeof obj === 'object') {
            const objLimpio = {};
            Object.keys(obj).forEach(key => {
              const valor = obj[key];
              if (valor !== undefined) {
                objLimpio[key] = limpiarUndefined(valor);
              }
            });
            return objLimpio;
          }

          return obj;
        };

        // 🎯 NUEVA VALIDACIÓN: Asegurar que las líneas tengan puntos válidos
        const objetosValidados = objetos.map(obj => {
          // Si es una línea, validar y corregir puntos
          if (obj.tipo === 'forma' && obj.figura === 'line') {
            return validarPuntosLinea(obj);
          }

          // ✅ Si es texto, normalizamos propiedades visuales para HTML
          if (obj.tipo === 'texto') {
            return {
              ...obj,
              // 🔹 Mapeo de color principal
              color: obj.colorTexto || obj.color || obj.fill || "#000000",
              // 🔹 Stroke y sombras opcionales
              stroke: obj.stroke || null,
              strokeWidth: obj.strokeWidth || 0,
              shadowColor: obj.shadowColor || null,
              shadowBlur: obj.shadowBlur || 0,
              shadowOffsetX: obj.shadowOffsetX || 0,
              shadowOffsetY: obj.shadowOffsetY || 0,
            };
          }

          // Para otros objetos, devolver sin cambios
          return obj;
        });



        // 🔥 LIMPIAR DATOS ANTES DE ENVIAR A FIREBASE
        const seccionesLimpias = limpiarUndefined(secciones);
        const objetosLimpios = limpiarUndefined(objetosValidados);

        // 📊 LOG DE DEPURACIÓN (quitar en producción)
        const lineasEncontradas = objetosLimpios.filter(o => o.tipo === 'forma' && o.figura === 'line');
        if (lineasEncontradas.length > 0) {
          console.log("💾 Guardando líneas en Firebase:", {
            cantidad: lineasEncontradas.length,
            detalles: lineasEncontradas.map(l => ({
              id: l.id,
              points: l.points,
              x: l.x,
              y: l.y
            }))
          });
        }

        const ref = doc(db, "borradores", slug);
        await updateDoc(ref, {
          objetos: objetosLimpios,
          secciones: seccionesLimpias,
          ultimaEdicion: serverTimestamp(),
        });

        // 🔥 NUEVO: Generar y subir thumbnail
        if (stageRef?.current && userId && slug) {
          const { guardarThumbnailDesdeStage } = await import("@/utils/guardarThumbnail");
          await guardarThumbnailDesdeStage({
            stageRef,
            uid: userId,
            slug,
          });
        }


      } catch (error) {
        console.error("❌ Error guardando en Firebase:", error);

        // Opcional: Mostrar notificación al usuario
        // toast.error("Error al guardar cambios");
      }
    }, 500);


    return () => clearTimeout(timeoutId);
  }, [objetos, secciones, cargado, slug]); // 🔥 Incluir secciones en dependencias

  const actualizarObjeto = (index, nuevo) => {
    const nuevos = [...objetos];
    const { fromTransform, ...cleanNuevo } = nuevo;

    // Preservar datos específicos según el tipo de objeto
    if (nuevos[index].tipo === 'forma' && nuevos[index].figura === 'line') {
      // Para líneas, asegurar que los puntos se preserven
      nuevos[index] = {
        ...nuevos[index],
        ...cleanNuevo,
        points: cleanNuevo.points || nuevos[index].points || [0, 0, 100, 0]
      };
    } else {
      nuevos[index] = { ...nuevos[index], ...cleanNuevo };
    }

    setObjetos(nuevos);
  };


  const actualizarObjetoPorId = (id, cambios) => {
    const index = objetos.findIndex((o) => o.id === id);
    if (index === -1) return console.warn("❌ No se encontró el objeto con ID:", id);
    actualizarObjeto(index, cambios);
  };


  // sirve para escribir al tener una forma seleccionada y agregarle el texto
  useEffect(() => {
    const handleKeyDown = (e) => {
      // No editar si hay múltiples seleccionados
      if (!elementosSeleccionados || elementosSeleccionados.length !== 1) return;

      const objSeleccionado = elementosSeleccionados[0];
      if (objSeleccionado.tipo !== "forma") return;

      const index = objetos.findIndex((o) => o.id === objSeleccionado.id);
      if (index === -1) return;

      // No hacer nada si ya está en modo edición
      if (editing?.id) return;

      // Solo activar si es una letra o número
      if (e.key.length === 1) {
        // 🟣 Entrar en modo edición
        setEditing({
          id: objSeleccionado.id,
          value: objSeleccionado.texto || "",
          tipo: "forma",
          index: index,
        });

        // Guardamos el primer caracter tecleado para agregarlo al iniciar
        setTimeout(() => {
          window._preFillChar = e.key;
        }, 0);

        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [elementosSeleccionados, objetos, editing]);



  const actualizarLinea = (lineId, nuevaData) => {
    const index = objetos.findIndex(obj => obj.id === lineId);

    if (index === -1) {
      return;
    }

    if (nuevaData.isPreview) {
      // Preview: Solo actualización visual sin historial
      setObjetos(prev => {
        const nuevos = [...prev];
        const { isPreview, ...cleanData } = nuevaData;

        // Asegurar que los puntos siempre sean un array válido
        if (cleanData.points) {
          cleanData.points = cleanData.points.map(p => parseFloat(p) || 0);
        }

        // 🔥 PRESERVAR strokeWidth si existe
        if (cleanData.strokeWidth !== undefined) {
          cleanData.strokeWidth = parseInt(cleanData.strokeWidth) || 2;
        }

        nuevos[index] = { ...nuevos[index], ...cleanData };
        return nuevos;
      });
    } else if (nuevaData.isFinal) {
      // Final: Guardar en historial
      setObjetos(prev => {
        const nuevos = [...prev];
        const { isFinal, ...cleanData } = nuevaData;

        // Asegurar que los puntos siempre sean un array válido
        if (cleanData.points) {
          cleanData.points = cleanData.points.map(p => parseFloat(p) || 0);
        }

        // 🔥 PRESERVAR strokeWidth si existe
        if (cleanData.strokeWidth !== undefined) {
          cleanData.strokeWidth = parseInt(cleanData.strokeWidth) || 2;
        }

        nuevos[index] = { ...nuevos[index], ...cleanData };
        return nuevos;
      });
    }
  };


  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();

        if (editing.id) {
          finishEdit(); // 🔥 Guardamos primero
        }

        if (elementosSeleccionados.length > 0) {
          console.log("🔓 Deseleccionando elementos con ESC");
          setElementosSeleccionados([]);
          setMostrarPanelZ(false);
          setMostrarSubmenuCapa(false);
          setMostrarSelectorFuente(false);
          setMostrarSelectorTamaño(false);
          setHoverId(null);
        }
      }
    };


    document.addEventListener("keydown", handleKeyDown, false);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, false);
    };
  }, [elementosSeleccionados]);




  // 🔥 Helper para obtener métricas precisas del texto
  const obtenerMetricasTexto = (texto, fontSize, fontFamily) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontSize}px ${fontFamily}`;

    const metrics = ctx.measureText(texto);
    return {
      width: metrics.width,
      height: fontSize * 1.2, // Aproximación de altura basada en line-height
      actualBoundingBoxAscent: metrics.actualBoundingBoxAscent || fontSize * 0.8,
      actualBoundingBoxDescent: metrics.actualBoundingBoxDescent || fontSize * 0.2
    };
  };




  const iniciarControlAltura = (e, seccionId) => {
    e.evt.stopPropagation();

    const seccion = secciones.find(s => s.id === seccionId);
    if (!seccion) return;

    setControlandoAltura(seccionId);
    setAlturaInicial(seccion.altura);
    setPosicionInicialMouse(e.evt.clientY);

    // Evitar selección de texto y fijar cursor
    document.body.style.userSelect = 'none';
    setGlobalCursor('ns-resize');

    // Capturá el puntero si está disponible (mejora confiabilidad)
    const target = e.target?.getStage?.()?.content || e.target?.getStage?.()?.container?.();
    if (target && target.setPointerCapture && e.evt.pointerId != null) {
      try { target.setPointerCapture(e.evt.pointerId); } catch { }
    }
  };


  const manejarControlAltura = useCallback((e) => {
    if (!controlandoAltura) return;

    // 🔥 THROTTLE MÁS SUAVE: Solo 8ms (120fps)
    if (window._alturaResizeThrottle) return;
    window._alturaResizeThrottle = true;

    requestAnimationFrame(() => {
      const posicionActualMouse = e.clientY;
      const deltaY = posicionActualMouse - posicionInicialMouse;
      const nuevaAltura = Math.max(50, Math.round(alturaInicial + deltaY)); // Redondear para pixeles exactos

      // Actualizar altura en tiempo real
      setSecciones(prev =>
        prev.map(s =>
          s.id === controlandoAltura
            ? { ...s, altura: nuevaAltura }
            : s
        )
      );

      // Limpiar throttle después de la actualización
      setTimeout(() => {
        window._alturaResizeThrottle = false;
      }, 8);
    });
  }, [controlandoAltura, posicionInicialMouse, alturaInicial]);


  const finalizarControlAltura = useCallback(async () => {
    if (!controlandoAltura) return;

    // SIEMPRE limpiar estados visuales, pase lo que pase
    try {
      document.body.style.userSelect = '';
    } catch { }
    clearGlobalCursor();

    // limpiar throttle
    if (window._alturaResizeThrottle) {
      window._alturaResizeThrottle = false;
    }

    const seccionId = controlandoAltura;
    setControlandoAltura(false);
    setAlturaInicial(0);
    setPosicionInicialMouse(0);

    // Guardado con debounce (igual que antes)
    if (window._saveAlturaTimeout) clearTimeout(window._saveAlturaTimeout);
    window._saveAlturaTimeout = setTimeout(async () => {
      try {
        const ref = doc(db, "borradores", slug);
        await updateDoc(ref, {
          secciones: secciones,
          ultimaEdicion: serverTimestamp(),
        });
        console.log("✅ Altura guardada:", seccionId);
      } catch (error) {
        console.error("❌ Error guardando altura:", error);
      }
    }, 300);
  }, [controlandoAltura, secciones, slug]);



  useEffect(() => {
    if (controlandoAltura) {
      document.addEventListener('mousemove', manejarControlAltura, { passive: true });
      document.addEventListener('mouseup', finalizarControlAltura);

      return () => {
        document.removeEventListener('mousemove', manejarControlAltura);
        document.removeEventListener('mouseup', finalizarControlAltura);

        // Cleanup
        if (window._alturaResizeThrottle) {
          window._alturaResizeThrottle = false;
        }
      };
    }
  }, [controlandoAltura, manejarControlAltura, finalizarControlAltura]);


  useEffect(() => {
    if (!controlandoAltura) return;
    const end = () => finalizarControlAltura();

    const handlePointerUp = end;
    const handlePointerCancel = end;
    const handleMouseLeave = (ev) => { if (ev.relatedTarget === null) end(); };
    const handleBlur = end;
    const handleVisibility = () => { if (document.visibilityState !== 'visible') end(); };
    const handleKeyDown = (e) => { if (e.key === 'Escape') end(); };

    window.addEventListener('pointerup', handlePointerUp, { capture: true });
    window.addEventListener('pointercancel', handlePointerCancel, { capture: true });
    window.addEventListener('mouseleave', handleMouseLeave, { capture: true });
    window.addEventListener('blur', handleBlur, { capture: true });
    document.addEventListener('visibilitychange', handleVisibility, { capture: true });
    document.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('pointerup', handlePointerUp, { capture: true });
      window.removeEventListener('pointercancel', handlePointerCancel, { capture: true });
      window.removeEventListener('mouseleave', handleMouseLeave, { capture: true });
      window.removeEventListener('blur', handleBlur, { capture: true });
      document.removeEventListener('visibilitychange', handleVisibility, { capture: true });
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [controlandoAltura, finalizarControlAltura]);


  useEffect(() => {
    if (!controlandoAltura) {
      clearGlobalCursor(stageRef);
      try { document.body.style.userSelect = ''; } catch { }
    }
  }, [controlandoAltura]);


  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest(".menu-z-index")) {
        setMostrarPanelZ(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);



  const actualizarFondoSeccion = (id, nuevoFondo) => {
    setSecciones((prev) =>
      prev.map((s) => s.id === id ? { ...s, fondo: nuevoFondo } : s)
    );
  };




  useKeyboardShortcuts({
    onDeshacer,
    onRehacer,
    onDuplicar,
    onEliminar,
    onDeseleccionar: () => {
      if (elementosSeleccionados.length > 0) {
        setElementosSeleccionados([]);
        setMostrarPanelZ(false);
        setMostrarSubmenuCapa(false);
        setMostrarSelectorFuente(false);
        setMostrarSelectorTamaño(false);
        setHoverId(null);
      }
    },
    onCopiar,
    onPegar,
    onCambiarAlineacion,
    isEditing: !!editing.id,
    tieneSeleccion: elementosSeleccionados.length > 0
  });



  // CanvasEditor.jsx
  const cambiarColorFondoSeccion = useCallback((seccionId, nuevoColor) => {
    console.log("🎨 Cambiando color de fondo:", { seccionId, nuevoColor });

    setSecciones(prev =>
      prev.map(s => {
        if (s.id !== seccionId) return s;
        return { ...s, fondo: nuevoColor };
      })
    );
  }, [setSecciones]);

  // ✅ Exponer inmediatamente (no solo en useEffect)
  window.canvasEditor = {
    ...(window.canvasEditor || {}),
    cambiarColorFondoSeccion
  };


  // 🔥 Exponer globalmente (en cada render actualizamos la ref)
  useEffect(() => {
    window.canvasEditor = {
      ...(window.canvasEditor || {}),
      cambiarColorFondoSeccion,
      seccionActivaId,
      secciones
    };
  }, [cambiarColorFondoSeccion, seccionActivaId, secciones]);




  // ✅ Exponer al window para usarlo en DashboardHeader
  useEffect(() => {
    window.canvasEditor = {
      ...(window.canvasEditor || {}),
      cambiarColorFondoSeccion
    };
  }, [cambiarColorFondoSeccion]);



  const seccionesOrdenadas = [...secciones].sort((a, b) => a.orden - b.orden);
  const escalaActiva = zoom === 1 ? scale : zoom;
  const escalaVisual = zoom === 1 ? scale : (zoom * 1.15);
  const altoCanvasDinamico = seccionesOrdenadas.reduce((acc, s) => acc + s.altura, 0) || 800;

  // 1) Exponer info de secciones (top/height) para centrar correctamente
  useEffect(() => {
    window.__getSeccionInfo = (id) => {
      try {
        const idx = seccionesOrdenadas.findIndex(s => s.id === id);
        if (idx === -1) return null;
        const height = Number(seccionesOrdenadas[idx]?.altura ?? seccionesOrdenadas[idx]?.height ?? 400);
        const top = calcularOffsetY(seccionesOrdenadas, idx); // tu helper actual
        return { idx, top, height };
      } catch { return null; }
    };
    return () => { delete window.__getSeccionInfo; };
  }, [seccionesOrdenadas]);

  // 2) Exponer un getter de objetos por id (fallback cuando hay elementos seleccionados)
  useEffect(() => {
    window.__getObjById = (id) => (objetos || []).find(o => o.id === id) || null;
    return () => { delete window.__getObjById; };
  }, [objetos]);

  // 3) Cada vez que el usuario selecciona una sección, actualizamos global y notificamos
  const onSelectSeccion = (id) => {
    try {
      // si ya tenés un setSeccionActivaId, llamalo acá:
      setSeccionActivaId(id);

      window._seccionActivaId = id;
      window.dispatchEvent(new CustomEvent("seccion-activa", { detail: { id } }));
    } catch (e) {
      console.warn("No pude emitir seccion-activa:", e);
    }
  };

  // Ejemplo de uso: en el handler de click de la sección
  // <Rect onClick={() => onSelectSeccion(seccion.id)} ... />





  // 🆕 NUEVO HOOK PARA GUÍAS
  const {
    guiaLineas,
    mostrarGuias,
    limpiarGuias,
    configurarDragEnd
  } = useGuiasCentrado({
    anchoCanvas: 800,
    altoCanvas: altoCanvasDinamico,
    // 👇 Tweaks de experiencia
    margenSensibilidad: 8,   // dibuja líneas cercanas
    magnetRadius: 18,        // 🔥 captura más fuerte
    hysteresis: 10,          // 🔥 suelta recién lejos
    snapStrength: 1,         // 1 = fijación exacta (probalo en 0.5 si querés “tracción suave”)
    snapToEdges: true,
    snapToCenters: true,
    seccionesOrdenadas
  });

  // 🚀 Función para actualizar posición del botón SIN re-render
  const actualizarPosicionBotonOpciones = useCallback(() => {
    if (!botonOpcionesRef.current || elementosSeleccionados.length !== 1) return;

    const nodeRef = elementRefs.current[elementosSeleccionados[0]];
    const stage = stageRef.current;
    const contenedor = contenedorRef.current;

    if (!nodeRef || !stage || !contenedor) return;

    try {
      // 🔥 OBTENER POSICIÓN REAL DEL ELEMENTO EN EL STAGE (coordenadas locales)
      const box = nodeRef.getClientRect();

      // 🔥 OBTENER POSICIÓN DEL STAGE EN EL VIEWPORT
      const stageContainer = stage.container();
      const stageRect = stageContainer.getBoundingClientRect();

      // 🔥 OBTENER SCROLL Y OFFSET DEL CONTENEDOR PRINCIPAL
      const contenedorRect = contenedor.getBoundingClientRect();
      const scrollTop = contenedor.scrollTop || 0;
      const scrollLeft = contenedor.scrollLeft || 0;

      // 🎯 CÁLCULO CORRECTO: Posición absoluta en viewport
      const elementoX = stageRect.left + (box.x * escalaVisual);
      const elementoY = stageRect.top + (box.y * escalaVisual);
      const anchoElemento = box.width * escalaVisual;

      // 🔥 POSICIÓN FINAL: Esquina superior derecha del elemento
      const botonX = elementoX + anchoElemento; // -12px (mitad del botón)
      const botonY = elementoY - 24; // -12px (mitad del botón)

      // 🔥 VALIDACIÓN: Solo mostrar si está dentro del viewport visible
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (botonX >= 0 && botonX <= viewportWidth && botonY >= 0 && botonY <= viewportHeight) {
        botonOpcionesRef.current.style.left = `${botonX}px`;
        botonOpcionesRef.current.style.top = `${botonY}px`;
        botonOpcionesRef.current.style.display = 'flex';
      } else {
        // Ocultar si está fuera del viewport
        botonOpcionesRef.current.style.display = 'none';
      }

    } catch (error) {
      console.warn("Error actualizando posición del botón:", error);
      // En caso de error, ocultar el botón
      if (botonOpcionesRef.current) {
        botonOpcionesRef.current.style.display = 'none';
      }
    }
  }, [elementosSeleccionados, escalaVisual, elementRefs]);


  // 🔄 Actualizar posición del botón cuando cambia la selección o escala
  useEffect(() => {
    if (elementosSeleccionados.length === 1) {
      // Pequeño delay para que el elemento esté renderizado
      setTimeout(() => {
        actualizarPosicionBotonOpciones();
      }, 50);
    }
  }, [elementosSeleccionados, escalaActiva, actualizarPosicionBotonOpciones]);

  // 🔄 Actualizar posición en scroll/resize
  useEffect(() => {
    const handleScrollResize = () => {
      if (elementosSeleccionados.length === 1) {
        actualizarPosicionBotonOpciones();
      }
    };

    window.addEventListener('scroll', handleScrollResize, true);
    window.addEventListener('resize', handleScrollResize);

    return () => {
      window.removeEventListener('scroll', handleScrollResize, true);
      window.removeEventListener('resize', handleScrollResize);
    };
  }, [elementosSeleccionados, actualizarPosicionBotonOpciones]);



  // dentro de CanvasEditor (función)
  useEffect(() => {
    const onDragStartGlobal = () => {
      // limpiar hover inmediatamente para que no quede “pegado”
      setHoverId(null);
    };
    const onDragEndGlobal = () => {
      // nada por ahora; si quisieras, podrías recalcular algo acá
    };

    window.addEventListener("dragging-start", onDragStartGlobal);
    window.addEventListener("dragging-end", onDragEndGlobal);
    return () => {
      window.removeEventListener("dragging-start", onDragStartGlobal);
      window.removeEventListener("dragging-end", onDragEndGlobal);
    };
  }, []);




  // 🔥 OPTIMIZACIÓN: Limpiar cache de intersección al cambiar selección
  useEffect(() => {
    // Limpiar cache cuando cambia la selección
    if (window._lineIntersectionCache) {
      window._lineIntersectionCache = {};
    }
  }, [elementosSeleccionados.length]);

  // 🔥 OPTIMIZACIÓN: Forzar actualización de líneas después de drag grupal
  useEffect(() => {
    if (!window._grupoLider && elementosSeleccionados.length > 0) {
      // Verificar si hay líneas seleccionadas
      const hayLineas = objetos.some(obj =>
        elementosSeleccionados.includes(obj.id) &&
        obj.tipo === 'forma' &&
        obj.figura === 'line'
      );

      if (hayLineas) {
        // Forzar re-render de las líneas
        const timer = setTimeout(() => {
          elementosSeleccionados.forEach(id => {
            const node = elementRefs.current[id];
            if (node && node.getLayer) {
              node.getLayer()?.batchDraw();
            }
          });
        }, 50);

        return () => clearTimeout(timer);
      }
    }
  }, [window._grupoLider, elementosSeleccionados, objetos]);


  useEffect(() => {
    window.canvasEditor = {
      deshacer: onDeshacer,
      rehacer: onRehacer,
      stageRef: stageRef.current, // ✅ ahora sí
      getHistorial: () => ({ historial: historial.length, futuros: futuros.length }),
    };

    return () => {
      delete window.canvasEditor;
    };
  }, [onDeshacer, onRehacer, historial.length, futuros.length, stageRef]);



  const detectarInterseccionLinea = useMemo(() => {
    return (lineObj, area, stage) => {
      try {
        console.log("🔍 [DETECCIÓN LÍNEA] Analizando:", {
          lineId: lineObj.id,
          area,
          lineObj: {
            x: lineObj.x,
            y: lineObj.y,
            points: lineObj.points
          }
        });

        if (!lineObj || !area || !lineObj.points) return false;

        let points = lineObj.points;
        if (!Array.isArray(points) || points.length < 4) {
          points = [0, 0, 100, 0];
        }

        const puntosLimpios = [
          parseFloat(points[0]) || 0,
          parseFloat(points[1]) || 0,
          parseFloat(points[2]) || 100,
          parseFloat(points[3]) || 0
        ];

        // 🔥 USAR LA POSICIÓN DEL NODO REAL EN EL STAGE
        const node = window._elementRefs?.[lineObj.id];
        const lineX = node ? node.x() : (lineObj.x || 0);
        const lineY = node ? node.y() : (lineObj.y || 0);

        // Coordenadas absolutas de los puntos
        const startX = lineX + puntosLimpios[0];
        const startY = lineY + puntosLimpios[1];
        const endX = lineX + puntosLimpios[2];
        const endY = lineY + puntosLimpios[3];

        console.log("📏 [DETECCIÓN LÍNEA] Coordenadas calculadas:", {
          linePos: { x: lineX, y: lineY },
          puntos: { startX, startY, endX, endY },
          area
        });

        // 🔥 MÉTODO 1: Verificar si algún punto está dentro del área
        const startDentro = (
          startX >= area.x && startX <= area.x + area.width &&
          startY >= area.y && startY <= area.y + area.height
        );

        const endDentro = (
          endX >= area.x && endX <= area.x + area.width &&
          endY >= area.y && endY <= area.y + area.height
        );

        console.log("🎯 [DETECCIÓN LÍNEA] Puntos dentro:", { startDentro, endDentro });

        if (startDentro || endDentro) {
          console.log("✅ [DETECCIÓN LÍNEA] Línea seleccionada por punto dentro");
          return true;
        }

        // 🔥 MÉTODO 2: Verificar intersección línea-rectángulo
        const intersecta = lineIntersectsRect(
          startX, startY, endX, endY,
          area.x, area.y, area.x + area.width, area.y + area.height
        );

        console.log("🔄 [DETECCIÓN LÍNEA] ¿Intersecta con área?", intersecta);

        if (intersecta) {
          console.log("✅ [DETECCIÓN LÍNEA] Línea seleccionada por intersección");
          return true;
        }

        console.log("❌ [DETECCIÓN LÍNEA] Línea NO seleccionada");
        return false;

      } catch (error) {
        console.error("❌ [DETECCIÓN LÍNEA] Error:", error);
        return false;
      }
    };
  }, []);

  // Función auxiliar para verificar intersección línea-rectángulo
  function lineIntersectsRect(x1, y1, x2, y2, rectLeft, rectTop, rectRight, rectBottom) {
    // Verificar si la línea intersecta con alguno de los 4 lados del rectángulo
    return (
      lineIntersectsLine(x1, y1, x2, y2, rectLeft, rectTop, rectRight, rectTop) || // Top
      lineIntersectsLine(x1, y1, x2, y2, rectRight, rectTop, rectRight, rectBottom) || // Right
      lineIntersectsLine(x1, y1, x2, y2, rectLeft, rectBottom, rectRight, rectBottom) || // Bottom
      lineIntersectsLine(x1, y1, x2, y2, rectLeft, rectTop, rectLeft, rectBottom) // Left
    );
  }

  // Función auxiliar para verificar intersección línea-línea
  function lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return false;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }






  const handleCrearSeccion = async (datos) => {
    const ref = doc(db, "borradores", slug);

    setSecciones((prevSecciones) => {
      const nueva = crearSeccion(datos, prevSecciones);

      let objetosDesdePlantilla = [];

      if (datos.desdePlantilla && Array.isArray(datos.objetos)) {
        objetosDesdePlantilla = datos.objetos.map((obj) => ({
          ...obj,
          id: "obj-" + Date.now() + Math.random().toString(36).substring(2, 6),
          seccionId: nueva.id,
        }));
      }

      const nuevasSecciones = [...prevSecciones, nueva];

      setObjetos((prevObjetos) => {
        const nuevosObjetos = [...prevObjetos, ...objetosDesdePlantilla];

        // 🔥 LIMPIAR ANTES DE GUARDAR
        const seccionesLimpias = limpiarObjetoUndefined(nuevasSecciones);
        const objetosLimpios = limpiarObjetoUndefined(nuevosObjetos);

        updateDoc(ref, {
          secciones: seccionesLimpias,
          objetos: objetosLimpios,
        })
          .then(() => {
            console.log("✅ Sección agregada:", nueva);
          })
          .catch((error) => {
            console.error("❌ Error al guardar sección", error);
          });

        return nuevosObjetos;
      });

      return nuevasSecciones;
    });
  };



  // 🔄 Ajustar el transformer cuando cambia el texto inline
  useEffect(() => {
    if (!editing.id || !elementRefs.current[editing.id]) return;

    const node = elementRefs.current[editing.id];

    // ✅ Solo actualizamos el contenido si es un nodo de texto
    if (node.getClassName && node.getClassName() === "Text") {
      node.text(editing.value); // 🔁 Actualizar el contenido en tiempo real
      node.getLayer()?.batchDraw(); // 🔁 Forzar re-render del nodo
    }

    // 🔁 Actualizar el transformer si está presente
    const transformer = node.getStage()?.findOne('Transformer');
    if (transformer && transformer.nodes && transformer.nodes().includes(node)) {
      transformer.forceUpdate(); // Actualiza manualmente el transformer
      transformer.getLayer()?.batchDraw(); // Redibuja
    }
  }, [editing.value]);




  useEffect(() => {
    window._elementosSeleccionados = elementosSeleccionados;
    window._objetosActuales = objetos;
    // 🔥 NUEVO: Exponer elementRefs para actualización directa
    window._elementRefs = elementRefs.current;

    // 🔥 NUEVO: Exponer secciones y altura total
    window._seccionesOrdenadas = [...secciones].sort((a, b) => a.orden - b.orden);
    window._altoCanvas = altoCanvas;
  }, [elementosSeleccionados, objetos, secciones, altoCanvas]);



  // Cleanup del sistema imperativo
  useEffect(() => {
    return () => {
      imperativeObjects.cleanup();
    };
  }, []);


  return (
    <div
      className="flex justify-center"
      style={{
        marginTop: "50px", // ✅ MÁS ESPACIO PARA LA BARRA SUPERIOR
        height: "calc(100vh - 100px)", // ✅ AJUSTAR ALTURA
        overflowY: "auto",
        overflowX: "hidden", // ✅ EVITAR SCROLL HORIZONTAL
      }}
    >

      <div
        ref={contenedorRef}
        style={{
          width: "100%",
          maxWidth: "1200px",
          backgroundColor: "#f5f5f5",
          display: "flex",
          justifyContent: "center",
          paddingTop: "20px", // ✅ MENOS PADDING INTERNO
          paddingBottom: "40px", // ✅ ESPACIO INFERIOR
        }}
      >

        <div
          style={{
            transform: `scale(${escalaVisual})`,
            transformOrigin: 'top center',
            width: zoom === 0.8 ? "1220px" : "1000px", // ✅ 920px canvas + 150px cada lado
            position: "relative",
          }}
        >

          <div
            className="relative"
            style={{
              width: zoom === 0.8 ? "1220px" : "1000px", // ✅ AJUSTAR SEGÚN ZOOM
              display: "flex",
              justifyContent: "center",
            }}
          >

            {/* Botones de orden de sección */}
            {seccionActivaId && seccionesOrdenadas.map((seccion, index) => {
              if (seccion.id !== seccionActivaId) return null;

              const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
              const esPrimera = index === 0;
              const esUltima = index === seccionesOrdenadas.length - 1;
              const estaAnimando = seccionesAnimando.includes(seccion.id);

              return (
                <div
                  key={`orden-${seccion.id}`}
                  className="absolute flex flex-col gap-2"
                  style={{
                    top: offsetY * zoom + 50,
                    right: -150,
                    zIndex: 25,
                  }}
                >
                  {/* Botón Subir */}
                  <button
                    onClick={() =>
                      moverSeccionExternal({
                        seccionId: seccion.id,
                        direccion: "subir",
                        secciones,
                        slug,
                        setSecciones,
                        setSeccionesAnimando,
                      })
                    }
                    disabled={esPrimera || estaAnimando}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${esPrimera || estaAnimando
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-purple-600 text-white hover:bg-purple-700 hover:scale-105 shadow-md hover:shadow-lg'
                      } ${estaAnimando ? 'animate-pulse shadow-xl' : ''}`}
                    title={esPrimera ? 'Ya es la primera sección' : 'Subir sección'}
                  >
                    ↑ Subir
                  </button>

                  {/* Botón Guardar como plantilla */}
                  {!loadingClaims && esAdmin && (
                  <button
                    onClick={() =>
                      guardarSeccionComoPlantilla({
                        seccionId: seccion.id,
                        secciones,
                        objetos,
                        refrescarPlantillasDeSeccion,
                      })
                    }
                    disabled={estaAnimando}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${estaAnimando
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700 hover:scale-105 shadow-md hover:shadow-lg'
                      } ${estaAnimando ? 'animate-pulse shadow-xl' : ''}`}
                    title="Guardar esta sección como plantilla"
                  >
                    💾 Plantilla
                  </button>
                  )}


                  {/* Botón Desanclar fondo (solo si tiene imagen de fondo) */}
                  {seccion.fondoTipo === "imagen" && (
                    <button
                      onClick={() =>
                        desanclarFondo({
                          seccionId: seccion.id,
                          secciones,
                          objetos,
                          setSecciones,
                          setObjetos,
                          setElementosSeleccionados,
                        })
                      }
                    >
                      🔄 Desanclar fondo
                    </button>
                  )}
                  {/* Botón Borrar sección */}
                  <button
                    onClick={() =>
                      borrarSeccionExternal({
                        seccionId: seccion.id,
                        secciones,
                        objetos,
                        slug,
                        seccionActivaId,
                        setSecciones,
                        setObjetos,
                        setSeccionActivaId,
                      })
                    }
                    disabled={estaAnimando}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${estaAnimando
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-red-600 text-white hover:bg-red-700 hover:scale-105 shadow-md hover:shadow-lg'
                      } ${estaAnimando ? 'animate-pulse shadow-xl' : ''}`}
                    title="Borrar esta sección y todos sus elementos"
                  >
                    🗑️ Borrar
                  </button>


                  {/* Botón Bajar */}
                  <button
                    onClick={() =>
                      moverSeccionExternal({
                        seccionId: seccion.id,
                        direccion: "bajar",
                        secciones,
                        slug,
                        setSecciones,
                        setSeccionesAnimando,
                      })
                    }
                    disabled={esUltima || estaAnimando}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${esUltima || estaAnimando
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-purple-600 text-white hover:bg-purple-700 hover:scale-105 shadow-md hover:shadow-lg'
                      } ${estaAnimando ? 'animate-pulse shadow-xl' : ''}`}
                    title={esUltima ? 'Ya es la última sección' : 'Bajar sección'}
                  >
                    ↓ Bajar
                  </button>

                  {/* Botón Añadir sección */}
                  <button
                    onClick={handleCrearSeccion}
                    disabled={estaAnimando}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200
    ${estaAnimando
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed animate-pulse shadow-xl'
                        : 'bg-purple-600 text-white hover:bg-purple-700 hover:scale-105 shadow-md hover:shadow-lg'
                      }`}
                    title="Añadir una nueva sección debajo"
                  >
                    Añadir sección
                  </button>


                </div>
              );
            })}

            <Stage
              ref={stageRef}
              width={800}
              height={altoCanvasDinamico}
              perfectDrawEnabled={false}
              listening={true}
              imageSmoothingEnabled={false}
              hitGraphEnabled={true}
              style={{
                background: "white",
                overflow: "visible",
                position: "relative",
                boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
              }}


              onMouseDown={(e) => {
                console.log("🖱️ [STAGE] Mouse down:", {
                  target: e.target?.getClassName ? e.target.getClassName() : 'unknown',
                  shiftKey: e.evt?.shiftKey,
                  seleccionActual: elementosSeleccionados
                });
                const stage = e.target.getStage();
                if (!stage) return;

                // ⛔️ NO usar comparaciones directas contra e.target
                // const clickEnElemento = Object.values(elementRefs.current).some(node => node === e.target);

                // ✅ Usar findAncestor: ¿el target pertenece a algún "nodo raíz" registrado?
                const roots = Object.values(elementRefs.current || {});
                const rootHit = e.target.findAncestor((n) => roots.includes(n), true); // includeSelf=true

                if (rootHit) {
                  // Clic adentro de un elemento: NO inicies selección por lazo
                  // Dejá que el drag del elemento maneje el movimiento
                  return;
                }



                const clickedOnStage = e.target === stage;

                // Salir de modo mover fondo si no clickeaste una imagen de fondo
                if (!clickedOnStage && e.target.getClassName() !== "Image") {
                  window.dispatchEvent(new Event("salir-modo-mover-fondo"));
                }

                const esStage = clickedOnStage;
                const esSeccion = e.target.attrs?.id && secciones.some(s => s.id === e.target.attrs?.id);

                dragStartPos.current = stage.getPointerPosition();
                hasDragged.current = false;

                // Ignorar Transformer/anchors
                const esTransformer = e.target.getClassName?.() === 'Transformer' ||
                  e.target.parent?.getClassName?.() === 'Transformer' ||
                  e.target.attrs?.name?.includes('_anchor');
                if (esTransformer) return;

                // Si clic en un elemento registrado, no arrancar selección
                const clickEnElemento = Object.values(elementRefs.current).some(node => node === e.target);
                if (clickEnElemento) return;

                const esImagenFondo = e.target.getClassName() === "Image";

                if (esStage || esSeccion || esImagenFondo) {
                  setElementosSeleccionados([]);
                  setMostrarPanelZ(false);
                  setMostrarSubmenuCapa(false);
                  setMostrarSelectorFuente(false);   // 👈 extra
                  setMostrarSelectorTamaño(false);   // 👈 extra
                  setHoverId(null);                  // 👈 extra

                  if (esStage) {
                    setSeccionActivaId(null);
                  } else {
                    const idSeccion = e.target.attrs?.id
                      || secciones.find(s => s.id === e.target.parent?.attrs?.id)?.id
                      || secciones[0]?.id;
                    if (idSeccion) setSeccionActivaId(idSeccion);
                  }

                  const pos = stage.getPointerPosition();
                  setInicioSeleccion({ x: pos.x, y: pos.y });
                  setAreaSeleccion({ x: pos.x, y: pos.y, width: 0, height: 0 });
                  setSeleccionActiva(true);
                }
              }}

              onMouseMove={(e) => {


                // 🔥 RESTO DE LA LÓGICA (selección de área)
                if (!seleccionActiva || !inicioSeleccion) return;

                if (window._mouseMoveThrottle) return;
                window._mouseMoveThrottle = true;

                requestAnimationFrame(() => {
                  window._mouseMoveThrottle = false;

                  const stage = e.target.getStage();
                  const pos = stage.getPointerPosition();
                  if (!pos) return;

                  const area = {
                    x: Math.min(inicioSeleccion.x, pos.x),
                    y: Math.min(inicioSeleccion.y, pos.y),
                    width: Math.abs(pos.x - inicioSeleccion.x),
                    height: Math.abs(pos.y - inicioSeleccion.y),
                  };

                  setAreaSeleccion(area);

                  if (Math.abs(area.width) > 5 || Math.abs(area.height) > 5) {
                    if (window._selectionThrottle) return;
                    window._selectionThrottle = true;

                    requestAnimationFrame(() => {
                      const ids = objetos.filter((obj) => {
                        const node = elementRefs.current[obj.id];
                        if (!node) return false;

                        if (obj.tipo === 'forma' && obj.figura === 'line') {
                          return detectarInterseccionLinea(obj, area, stage);
                        }

                        const box = node.getClientRect({ relativeTo: stage });
                        return (
                          box.x + box.width >= area.x &&
                          box.x <= area.x + area.width &&
                          box.y + box.height >= area.y &&
                          box.y <= area.y + area.height
                        );
                      }).map((obj) => obj.id);

                      setElementosPreSeleccionados(ids);
                      window._selectionThrottle = false;
                    });
                  }
                });
              }}

              onMouseUp={(e) => {

                const stage = e.target.getStage();


                // Solo verificar si hay drag grupal activo para no procesar selección
                if (window._grupoLider) {
                  console.log("🎯 Drag grupal activo, esperando onDragEnd...");
                  return; // No hacer nada más, dejar que ElementoCanvas maneje todo
                }

                // El resto del código de selección por área continúa igual...
                if (!seleccionActiva || !areaSeleccion) return;

                const nuevaSeleccion = objetos.filter((obj) => {
                  const node = elementRefs.current[obj.id];
                  if (!node) {
                    console.log(`⚠️ [SELECCIÓN ÁREA] No se encontró node para ${obj.id}`);

                    return false;
                  }

                  // 🔥 MANEJO ESPECIAL PARA LÍNEAS
                  if (obj.tipo === 'forma' && obj.figura === 'line') {
                    console.log(`📏 [SELECCIÓN ÁREA] Detectando línea ${obj.id} en área`);

                    return detectarInterseccionLinea(obj, areaSeleccion, stage);
                  }


                  // 🔄 LÓGICA PARA ELEMENTOS NORMALES
                  try {
                    const box = node.getClientRect();
                    return (
                      box.x + box.width >= areaSeleccion.x &&
                      box.x <= areaSeleccion.x + areaSeleccion.width &&
                      box.y + box.height >= areaSeleccion.y &&
                      box.y <= areaSeleccion.y + areaSeleccion.height
                    );
                    if (intersecta) {
                      console.log(`✅ [SELECCIÓN ÁREA] Elemento ${obj.id} intersecta con área`);
                    }

                    return intersecta;
                  } catch (error) {
                    console.warn(`❌ [SELECCIÓN ÁREA] Error detectando ${obj.id}:`, error);

                    return false;
                  }
                });


                setElementosSeleccionados(nuevaSeleccion.map(obj => obj.id));
                setElementosPreSeleccionados([]);
                setSeleccionActiva(false);
                setAreaSeleccion(null);

                // 🔥 LIMPIAR THROTTLES Y CACHE
                if (window._selectionThrottle) {
                  window._selectionThrottle = false;
                }
                if (window._boundsUpdateThrottle) {
                  window._boundsUpdateThrottle = false;
                }
                window._lineIntersectionCache = {};
              }}
            >
              <Layer>

                {seccionesOrdenadas.flatMap((seccion, index) => {
                  const alturaPx = seccion.altura;
                  const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
                  const esActiva = seccion.id === seccionActivaId;
                  const estaAnimando = seccionesAnimando.includes(seccion.id);

                  if (estaAnimando) {
                    console.log("🎭 SECCIÓN ANIMANDO:", seccion.id);
                  }

                  const elementos = [
                    // Fondo de sección - puede ser color o imagen
                    seccion.fondoTipo === "imagen" ? (
                      <FondoSeccion
                        key={`fondo-${seccion.id}`}
                        seccion={seccion}
                        offsetY={offsetY}
                        alturaPx={alturaPx}
                        onSelect={() => setSeccionActivaId(seccion.id)}
                        onUpdateFondoOffset={actualizarOffsetFondo}
                      />
                    ) : (
                      <Rect
                        key={`seccion-${seccion.id}`}
                        id={seccion.id}
                        x={0}
                        y={offsetY}
                        width={800}
                        height={alturaPx}
                        fill={seccion.fondo || "#ffffff"}
                        stroke="transparent"
                        strokeWidth={0}
                        listening={true}
                        onClick={() => setSeccionActivaId(seccion.id)}
                      />
                    )
                  ];

                  if (esActiva) {
                    elementos.push(
                      // Borde principal - justo en el margen de la sección, sin bordes redondeados
                      <Rect
                        key={`border-principal-${seccion.id}`}
                        x={0}
                        y={offsetY}
                        width={800}
                        height={alturaPx}
                        fill="transparent"
                        stroke="#773dbe"
                        strokeWidth={estaAnimando ? 4 : 3}
                        cornerRadius={0} // ✅ SIN BORDES REDONDEADOS
                        shadowColor={estaAnimando ? "rgba(119, 61, 190, 0.4)" : "rgba(119, 61, 190, 0.25)"}
                        shadowBlur={estaAnimando ? 16 : 12}
                        shadowOffset={{ x: 0, y: estaAnimando ? 4 : 3 }}
                        listening={false}
                      />
                    );
                  }

                  return elementos;
                })}


                {/* Control de altura para sección activa */}
                {seccionActivaId && seccionesOrdenadas.map((seccion, index) => {
                  if (seccion.id !== seccionActivaId) return null;

                  const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
                  const controlY = offsetY + seccion.altura - 5; // 5px antes del final

                  return (
                    <Group key={`control-altura-${seccion.id}`}>
                      {/* Línea indicadora */}
                      <Line
                        points={[50, controlY, 750, controlY]}
                        stroke="#773dbe"
                        strokeWidth={2}
                        dash={[5, 5]}
                        listening={false}
                      />

                      {/* Control central mejorado */}
                      <Group
                        x={400}
                        y={controlY}
                        onMouseDown={(e) => iniciarControlAltura(e, seccion.id)}
                        onMouseEnter={() => {
                          // solo mostrar ns-resize si no estás arrastrando
                          if (!controlandoAltura) setGlobalCursor('ns-resize', stageRef);
                        }}
                        onMouseLeave={() => {
                          // no limpies el cursor si estás arrastrando (lo limpia finalizarControlAltura)
                          if (!controlandoAltura) clearGlobalCursor(stageRef);
                        }}

                        draggable={false}
                      >
                        {/* Área de detección */}
                        <Rect
                          x={-35}
                          y={-12}
                          width={70}
                          height={24}
                          fill="transparent"
                          listening={true}
                        />

                        {/* Fondo del control con estado activo */}
                        <Rect
                          x={-25}
                          y={-6}
                          width={50}
                          height={12}
                          fill={controlandoAltura === seccion.id ? "#773dbe" : "rgba(119, 61, 190, 0.9)"}
                          cornerRadius={6}
                          shadowColor="rgba(0,0,0,0.3)"
                          shadowBlur={controlandoAltura === seccion.id ? 8 : 6}
                          shadowOffset={{ x: 0, y: controlandoAltura === seccion.id ? 4 : 3 }}
                          listening={false}
                        />

                        {/* Animación de pulso durante el control */}
                        {controlandoAltura === seccion.id && (
                          <Rect
                            x={-30}
                            y={-8}
                            width={60}
                            height={16}
                            fill="transparent"
                            stroke="#773dbe"
                            strokeWidth={2}
                            cornerRadius={8}
                            opacity={0.6}
                            listening={false}
                          />
                        )}

                        {/* Indicador visual */}
                        <Text
                          x={-6}
                          y={-3}
                          text="⋮⋮"
                          fontSize={10}
                          fill="white"
                          fontFamily="Arial"
                          listening={false}
                        />

                        {/* Puntos de agarre */}
                        <Circle x={-15} y={0} radius={1.5} fill="rgba(255,255,255,0.8)" listening={false} />
                        <Circle x={-10} y={0} radius={1.5} fill="rgba(255,255,255,0.8)" listening={false} />
                        <Circle x={10} y={0} radius={1.5} fill="rgba(255,255,255,0.8)" listening={false} />
                        <Circle x={15} y={0} radius={1.5} fill="rgba(255,255,255,0.8)" listening={false} />
                      </Group>


                      {/* Fondo del indicador */}
                      <Rect
                        x={755}
                        y={controlY - 10}
                        width={40}
                        height={20}
                        fill="rgba(119, 61, 190, 0.1)"
                        stroke="rgba(119, 61, 190, 0.3)"
                        strokeWidth={1}
                        cornerRadius={4}
                        listening={false}
                      />

                      {/* Texto del indicador */}
                      <Text
                        x={760}
                        y={controlY - 6}
                        text={`${Math.round(seccion.altura)}px`}
                        fontSize={11}
                        fill="#773dbe"
                        fontFamily="Arial"
                        fontWeight="bold"
                        listening={false}
                      />
                    </Group>
                  );
                })}

                {/* Overlay mejorado durante control de altura */}
                {controlandoAltura && (
                  <Group>
                    {/* Overlay sutil */}
                    <Rect
                      x={0}
                      y={0}
                      width={800}
                      height={altoCanvasDinamico}
                      fill="rgba(119, 61, 190, 0.05)"
                      listening={false}
                    />

                    {/* Indicador de la sección que se está modificando */}
                    {seccionesOrdenadas.map((seccion, index) => {
                      const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);

                      return (
                        <Group key={seccion.id}>
                          {/* Rect “fondo” clickeable */}
                          <Rect
                            x={0}
                            y={offsetY}
                            width={800}
                            height={seccion.altura}
                            fill={seccion.fondo || "transparent"} // podés poner blanco u otro color
                            onClick={() => onSelectSeccion(seccion.id)}   // 👈 dispara el evento
                          />

                          {/* Rect highlight si estás controlando la altura */}
                          {seccion.id === controlandoAltura && (
                            <Rect
                              x={0}
                              y={offsetY}
                              width={800}
                              height={seccion.altura}
                              fill="transparent"
                              stroke="#773dbe"
                              strokeWidth={3}
                              dash={[8, 4]}
                              listening={false}
                            />
                          )}
                        </Group>
                      );
                    })}

                  </Group>
                )}



                {objetos.map((obj, i) => {
                  // 🎯 Determinar si está en modo edición
                  const isInEditMode = editing.id === obj.id && elementosSeleccionados[0] === obj.id;

                  // 🖼️ Caso especial: la galería la renderizamos acá (no usa ElementoCanvas)
                  if (obj.tipo === "galeria") {

                    return (
                      <GaleriaKonva
                        key={obj.id}
                        obj={obj}
                        registerRef={registerRef}
                        isSelected={elementosSeleccionados.includes(obj.id)}
                        celdaGaleriaActiva={celdaGaleriaActiva}
                        onPickCell={(info) => setCeldaGaleriaActiva(info)}
                        seccionesOrdenadas={seccionesOrdenadas}
                        altoCanvas={altoCanvas}
                        onSelect={(id, e) => {
                          e?.evt && (e.evt.cancelBubble = true);
                          setElementosSeleccionados([id]);
                        }}
                        onDragMovePersonalizado={(pos, id) => {
                          window._isDragging = true;
                          requestAnimationFrame(() => {
                            if (typeof actualizarPosicionBotonOpciones === "function") {
                              actualizarPosicionBotonOpciones();
                            }
                          });
                        }}
                        onDragStartPersonalizado={() => {
                          window._isDragging = true;
                        }}
                        onDragEndPersonalizado={() => {
                          window._isDragging = false;
                          limpiarGuias();
                          if (typeof actualizarPosicionBotonOpciones === "function") {
                            actualizarPosicionBotonOpciones();
                          }
                        }}
                        onChange={(id, nuevo) => {
                          setObjetos((prev) => {
                            const i = prev.findIndex((o) => o.id === id);
                            if (i === -1) return prev;
                            const updated = [...prev];
                            updated[i] = { ...updated[i], ...nuevo };
                            return updated;
                          });
                        }}
                      />

                    );
                  }


                  if (obj.tipo === "countdown") {
                    return (
                      <CountdownKonva
                        key={obj.id}
                        obj={obj}
                        registerRef={registerRef}
                        isSelected={elementosSeleccionados.includes(obj.id)}
                        seccionesOrdenadas={seccionesOrdenadas}
                        altoCanvas={altoCanvas}

                        // ✅ selección
                        onSelect={(id, e) => {
                          e?.evt && (e.evt.cancelBubble = true);
                          setElementosSeleccionados([id]);
                        }}

                        // ✅ PREVIEW liviano (no tocar estado del objeto para que no haya lag)
                        onDragMovePersonalizado={(pos, id) => {
                          window._isDragging = true;
                          requestAnimationFrame(() => {
                            if (typeof actualizarPosicionBotonOpciones === "function") {
                              actualizarPosicionBotonOpciones();
                            }
                          });
                        }}

                        // ✅ FIN de drag: limpiar guías / UI auxiliar
                        onDragEndPersonalizado={() => {
                          window._isDragging = false;
                          limpiarGuias();
                          if (typeof actualizarPosicionBotonOpciones === "function") {
                            actualizarPosicionBotonOpciones();
                          }
                        }}

                        // ✅ refs para el motor de drag
                        dragStartPos={dragStartPos}
                        hasDragged={hasDragged}

                        // ✅ ¡Clave! Al finalizar, tratamos x/y absolutas como en ElementoCanvas:
                        onChange={(id, cambios) => {
                          setObjetos(prev => {
                            const i = prev.findIndex(o => o.id === id);
                            if (i === -1) return prev;

                            const objOriginal = prev[i];

                            // 🟣 Si no es final de drag, mergeamos sin más (no tocar coords)
                            if (!cambios.finalizoDrag) {
                              const updated = [...prev];
                              updated[i] = { ...updated[i], ...cambios };
                              return updated;
                            }

                            // 🟣 Final de drag: 'cambios.y' viene ABSOLUTA (Stage coords)
                            const { nuevaSeccion, coordenadasAjustadas } = determinarNuevaSeccion(
                              cambios.y,
                              objOriginal.seccionId,
                              seccionesOrdenadas
                            );

                            let next = { ...cambios };
                            delete next.finalizoDrag;

                            if (nuevaSeccion) {
                              next = { ...next, ...coordenadasAjustadas, seccionId: nuevaSeccion };
                            } else {
                              // convertir y absoluta → y relativa a la sección actual
                              next.y = convertirAbsARel(cambios.y, objOriginal.seccionId, seccionesOrdenadas);
                            }

                            const updated = [...prev];
                            updated[i] = { ...updated[i], ...next };
                            return updated;
                          });
                        }}
                      />
                    );
                  }





                  return (
                    <ElementoCanvas
                      key={obj.id}
                      obj={{
                        ...obj,
                        y: obj.y + calcularOffsetY(
                          seccionesOrdenadas,
                          seccionesOrdenadas.findIndex(s => s.id === obj.seccionId)
                        ),
                      }}
                      anchoCanvas={800}
                      isSelected={!isInEditMode && elementosSeleccionados.includes(obj.id)}
                      preSeleccionado={!isInEditMode && elementosPreSeleccionados.includes(obj.id)}
                      isInEditMode={isInEditMode} // 🔥 NUEVA PROP
                      onHover={isInEditMode ? null : setHoverId}
                      registerRef={registerRef}
                      onStartTextEdit={isInEditMode ? null : (id, texto) => {
                        startEdit(id, texto);
                        const node = elementRefs.current[id];
                        node?.draggable(false);
                      }}
                      finishInlineEdit={finishEdit}
                      onSelect={isInEditMode ? null : (id, obj, e) => {
                        console.log("🎯 [CANVAS EDITOR] onSelect disparado:", {
                          id,
                          tipo: obj?.tipo,
                          figura: obj?.figura,
                          shiftKey: e?.evt?.shiftKey,
                          seleccionActual: elementosSeleccionados
                        });

                        if (obj.tipo === "rsvp-boton") {
                          console.log("🟣 Click en botón RSVP");
                          return;
                        }

                        if (editing.id && editing.id !== id) {
                          finishEdit();
                        }

                        e?.evt && (e.evt.cancelBubble = true);

                        const esShift = e?.evt?.shiftKey;

                        setElementosSeleccionados((prev) => {

                          if (esShift) {
                            console.log("➕ [CANVAS EDITOR] Modo Shift: agregando/quitando elemento");

                            if (prev.includes(id)) {
                              const nueva = prev.filter((x) => x !== id);
                              console.log("➖ [CANVAS EDITOR] Elemento removido. Nueva selección:", nueva);
                              return nueva;
                            } else {
                              const nueva = [...prev, id];
                              return nueva;
                            }
                          } else {
                            return [id];
                          }
                        });
                      }}


                      onChange={(id, nuevo) => {


                        // 🔥 NUEVO: Manejar preview inmediato de drag grupal
                        if (nuevo.isDragPreview) {

                          setObjetos(prev => {
                            const index = prev.findIndex(o => o.id === id);
                            if (index === -1) return prev;

                            const updated = [...prev];
                            const { isDragPreview, skipHistorial, ...cleanNuevo } = nuevo;
                            updated[index] = { ...updated[index], ...cleanNuevo };
                            return updated;
                          });
                          return;
                        }

                        // 🔥 MANEJAR SOLO batch update final de drag grupal
                        if (nuevo.isBatchUpdateFinal && id === 'BATCH_UPDATE_GROUP_FINAL') {

                          const { elementos, dragInicial, deltaX, deltaY } = nuevo;

                          setObjetos(prev => {
                            return prev.map(objeto => {
                              if (elementos.includes(objeto.id)) {
                                if (dragInicial && dragInicial[objeto.id]) {
                                  const posInicial = dragInicial[objeto.id];
                                  return {
                                    ...objeto,
                                    x: posInicial.x + deltaX,
                                    y: posInicial.y + deltaY
                                  };
                                }
                              }
                              return objeto;
                            });
                          });
                          return;
                        }

                        // 🔥 NO procesar si viene del Transform
                        if (nuevo.fromTransform) {

                          return;
                        }

                        const objOriginal = objetos.find((o) => o.id === id);
                        if (!objOriginal) return;

                        // 🔥 Para drag final, procesar inmediatamente
                        if (nuevo.finalizoDrag) {

                          const { nuevaSeccion, coordenadasAjustadas } = determinarNuevaSeccion(
                            nuevo.y,
                            objOriginal.seccionId,
                            seccionesOrdenadas
                          );

                          let coordenadasFinales = { ...nuevo };
                          delete coordenadasFinales.finalizoDrag;

                          if (nuevaSeccion) {
                            coordenadasFinales = {
                              ...coordenadasFinales,
                              ...coordenadasAjustadas,
                              seccionId: nuevaSeccion
                            };
                          } else {
                            coordenadasFinales.y = convertirAbsARel(
                              nuevo.y,
                              objOriginal.seccionId,
                              seccionesOrdenadas
                            );
                          }


                          // Actualizar inmediatamente
                          setObjetos(prev => {
                            const index = prev.findIndex(o => o.id === id);
                            if (index === -1) return prev;

                            const updated = [...prev];
                            updated[index] = { ...updated[index], ...coordenadasFinales };
                            return updated;
                          });

                          return;
                        }

                        // 🔥 Para otros cambios (transform, etc.)
                        const hayDiferencias = Object.keys(nuevo).some(key => {
                          const valorAnterior = objOriginal[key];
                          const valorNuevo = nuevo[key];

                          if (typeof valorAnterior === 'number' && typeof valorNuevo === 'number') {
                            return Math.abs(valorAnterior - valorNuevo) > 0.01;
                          }

                          return valorAnterior !== valorNuevo;
                        });

                        if (!hayDiferencias) return;

                        const seccionId = nuevo.seccionId || objOriginal.seccionId;
                        const seccion = seccionesOrdenadas.find((s) => s.id === seccionId);
                        if (!seccion) return;

                        setObjetos(prev => {
                          const index = prev.findIndex(o => o.id === id);
                          if (index === -1) return prev;

                          const updated = [...prev];
                          updated[index] = { ...updated[index], ...nuevo };
                          return updated;
                        });
                      }}

                      onDragMovePersonalizado={isInEditMode ? null : (pos, elementId) => {
                        // 🔥 NO mostrar guías durante drag grupal
                        if (!window._grupoLider) {
                          mostrarGuias(pos, elementId, objetos, elementRefs);
                        }
                        if (elementosSeleccionados.includes(elementId)) {
                          requestAnimationFrame(() => {
                            if (typeof actualizarPosicionBotonOpciones === 'function') {
                              actualizarPosicionBotonOpciones();
                            }
                          });
                        }
                      }}
                      onDragEndPersonalizado={isInEditMode ? null : () => configurarDragEnd([])}
                      dragStartPos={dragStartPos}
                      hasDragged={hasDragged}
                    />
                  );
                })}



                {seleccionActiva && areaSeleccion && (
                  <Rect
                    x={areaSeleccion.x}
                    y={areaSeleccion.y}
                    width={areaSeleccion.width}
                    height={areaSeleccion.height}
                    fill="rgba(119, 61, 190, 0.1)" // violeta claro
                    stroke="#773dbe"
                    strokeWidth={1}
                    dash={[4, 4]}
                  />
                )}


                {elementosSeleccionados.length > 0 && !editing.id && (() => {
                  // 🔒 Si la selección incluye al menos una galería, no mostramos Transformer
                  const hayGaleriaSeleccionada = elementosSeleccionados.some(id => {
                    const o = objetos.find(x => x.id === id);
                    return o?.tipo === "galeria";
                  });
                  if (hayGaleriaSeleccionada) return null;

                  return (
                    <SelectionBounds
                      key={`selection-${elementosSeleccionados.join('-')}`}
                      selectedElements={elementosSeleccionados}
                      elementRefs={elementRefs}
                      objetos={objetos}
                      onTransform={(newAttrs) => {
                        console.log("🔧 Transform detectado:", newAttrs);

                        if (elementosSeleccionados.length === 1) {
                          const id = elementosSeleccionados[0];
                          const objIndex = objetos.findIndex(o => o.id === id); // 🔥 DEFINIR PRIMERO

                          // 🔥 MOVER EL LOG AQUÍ (después de definir objIndex)
                          if (newAttrs.isFinal) {
                            console.log("🎯 FINAL TRANSFORM:", {
                              originalY: newAttrs.y,
                              elementIndex: objIndex,
                              elementId: elementosSeleccionados[0]
                            });
                          }

                          if (objIndex !== -1) {

                            if (newAttrs.isPreview) {
                              // Preview: actualización sin historial
                              setObjetos(prev => {
                                const nuevos = [...prev];
                                const elemento = nuevos[objIndex];

                                const updatedElement = {
                                  ...elemento,
                                  // 🔥 NO actualizar X,Y durante preview - solo dimensiones
                                  rotation: newAttrs.rotation || elemento.rotation || 0
                                };

                                if (elemento.tipo === 'texto' && newAttrs.fontSize) {
                                  updatedElement.fontSize = newAttrs.fontSize;
                                  updatedElement.scaleX = 1;
                                  updatedElement.scaleY = 1;
                                } else {
                                  if (newAttrs.width !== undefined) updatedElement.width = newAttrs.width;
                                  if (newAttrs.height !== undefined) updatedElement.height = newAttrs.height;
                                  if (newAttrs.radius !== undefined) updatedElement.radius = newAttrs.radius;
                                  updatedElement.scaleX = 1;
                                  updatedElement.scaleY = 1;
                                }

                                nuevos[objIndex] = updatedElement;
                                return nuevos;
                              });

                              // 🔥 ACTUALIZAR POSICIÓN DEL BOTÓN DURANTE TRANSFORM
                              requestAnimationFrame(() => {
                                if (typeof actualizarPosicionBotonOpciones === 'function') {
                                  actualizarPosicionBotonOpciones();
                                }
                              });

                            } else if (newAttrs.isFinal) {
                              // Final: actualización completa
                              console.log('🎯 Guardando estado final para historial');
                              window._resizeData = { isResizing: false };

                              const { isPreview, isFinal, ...cleanAttrs } = newAttrs;

                              // 🔥 CONVERTIR coordenadas absolutas a relativas ANTES de guardar
                              const objOriginal = objetos[objIndex];
                              const finalAttrs = {
                                ...cleanAttrs,
                                y: convertirAbsARel(cleanAttrs.y, objOriginal.seccionId, seccionesOrdenadas),
                                fromTransform: true
                              };


                              console.log("🔧 Convirtiendo coordenadas:", {
                                yAbsoluta: cleanAttrs.y,
                                offsetY: offsetY,
                                yRelativa: finalAttrs.y
                              });

                              setTimeout(() => {
                                actualizarObjeto(objIndex, finalAttrs);
                              }, 50);
                            }
                          }
                        }
                      }}
                    />
                  );
                })()}


                {/* No mostrar hover durante drag/resize/edición NI cuando hay líder de grupo */}
                {!window._resizeData?.isResizing && !window._isDragging && !window._grupoLider && !editing.id && (
                  <HoverIndicator hoveredElement={hoverId} elementRefs={elementRefs} />
                )}



                {/* 🎯 Controles especiales para líneas seleccionadas */}
                {elementosSeleccionados.length === 1 && (() => {
                  const elementoSeleccionado = objetos.find(obj => obj.id === elementosSeleccionados[0]);
                  if (elementoSeleccionado?.tipo === 'forma' && elementoSeleccionado?.figura === 'line') {
                    return (
                      <LineControls
                        key={`line-controls-${elementoSeleccionado.id}-${JSON.stringify(elementoSeleccionado.points)}`}
                        lineElement={elementoSeleccionado}
                        elementRefs={elementRefs}
                        onUpdateLine={actualizarLinea}
                        altoCanvas={altoCanvasDinamico}
                        // 🔥 NUEVA PROP: Pasar información sobre drag grupal
                        isDragGrupalActive={window._grupoLider !== null}
                        elementosSeleccionados={elementosSeleccionados}
                      />
                    );
                  }
                  return null;
                })()}





                {/* Líneas de guía dinámicas mejoradas */}
                {guiaLineas.map((linea, i) => {
                  // Determinar el estilo visual según el tipo
                  const esLineaSeccion = linea.priority === 'seccion';

                  return (
                    <Line
                      key={`${linea.type}-${i}`}
                      points={linea.points}
                      stroke={esLineaSeccion ? "#773dbe" : "#9333ea"} // Violeta más intenso para sección
                      strokeWidth={esLineaSeccion ? 2 : 1} // Líneas de sección más gruesas
                      dash={linea.style === 'dashed' ? [8, 6] : undefined} // Punteado para elementos
                      opacity={esLineaSeccion ? 0.9 : 0.7} // Líneas de sección más opacas
                      listening={false}
                      perfectDrawEnabled={false}
                      // Efecto sutil de resplandor para líneas de sección
                      shadowColor={esLineaSeccion ? "rgba(119, 61, 190, 0.3)" : undefined}
                      shadowBlur={esLineaSeccion ? 4 : 0}
                      shadowEnabled={esLineaSeccion}
                    />
                  );
                })}


              </Layer>

            </Stage>


            {editing.id && elementRefs.current[editing.id] && (() => {
              const objetoEnEdicion = objetos.find(o => o.id === editing.id);

              return (
                <InlineTextEditor
                  node={elementRefs.current[editing.id]}
                  value={editing.value}
                  textAlign={objetoEnEdicion?.align || 'left'} // 🆕 Solo pasar alineación
                  onChange={updateEdit}
                  onFinish={() => {
                    const textoNuevo = editing.value.trim();
                    const index = objetos.findIndex(o => o.id === editing.id);
                    const objeto = objetos[index];


                    if (index === -1) {
                      console.warn("❌ El objeto ya no existe. Cancelando guardado.");
                      finishEdit();
                      return;
                    }

                    // ⚠️ Podés permitir texto vacío en formas si querés (yo lo permitiría)
                    if (textoNuevo === "" && objeto.tipo === "texto") {
                      console.warn("⚠️ El texto está vacío. No se actualiza.");
                      finishEdit();
                      return;
                    }

                    const actualizado = [...objetos];

                    actualizado[index] = {
                      ...actualizado[index],
                      texto: textoNuevo
                    };

                    setObjetos(actualizado);
                    finishEdit();
                  }}
                  scaleVisual={escalaVisual}

                />
              );
            })()}




            {/* 🔥 STAGE ADICIONAL SOLO PARA LÍNEAS DIVISORIAS */}
            {zoom === 0.8 && (
              <Stage
                width={1220} // ✅ 920px canvas + 150px cada lado
                height={altoCanvasDinamico}
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%", // Centrar el Stage secundario
                  transform: "translateX(-50%)", // Centrar exactamente
                  pointerEvents: "none",
                  zIndex: 10,
                }}
              >
                <Layer>
                  {seccionesOrdenadas.slice(0, -1).map((seccion, index) => {
                    let alturaAcumulada = 0;
                    for (let i = 0; i <= index; i++) {
                      alturaAcumulada += seccionesOrdenadas[i].altura;
                    }

                    return (
                      <Group key={`dividers-secondary-${seccion.id}`}>
                        {/* Línea izquierda - PEGADA al borde izquierdo del canvas */}
                        <Line
                          points={[210, alturaAcumulada, 10, alturaAcumulada]} // ✅ DESDE X=210 (borde real del canvas) HACIA X=10
                          stroke="#999999"
                          strokeWidth={1}
                          opacity={0.6}
                          dash={[3, 3]} // ✅ PUNTOS CORTOS
                          listening={false}
                        />

                        {/* Línea derecha - PEGADA al borde derecho del canvas */}
                        <Line
                          points={[1010, alturaAcumulada, 1210, alturaAcumulada]} // ✅ DESDE X=1010 (borde real del canvas) HACIA X=1210
                          stroke="#999999"
                          strokeWidth={1}
                          opacity={0.6}
                          dash={[3, 3]} // ✅ PUNTOS CORTOS
                          listening={false}
                        />

                        {/* ✨ Conectores sutiles eliminados - ya no son necesarios */}
                      </Group>


                    );
                  })}
                </Layer>
              </Stage>
            )}




          </div>


        </div>


      </div>



      {/* ✅ Botón de opciones PEGADO a la esquina superior derecha del elemento */}
      {elementosSeleccionados.length === 1 && !editing.id && (() => {
        const elementoSeleccionado = objetos.find(o => o.id === elementosSeleccionados[0]);
        const nodeRef = elementRefs.current[elementosSeleccionados[0]];

        if (!nodeRef || !elementoSeleccionado) return null;

        const contenedor = contenedorRef.current;
        const stage = stageRef.current;
        if (!contenedor || !stage) return null;

        // 🔥 OBTENER POSICIÓN REAL DEL ELEMENTO EN EL STAGE
        const box = nodeRef.getClientRect();

        // 🔥 OBTENER COORDENADAS DEL STAGE RELATIVAS AL VIEWPORT
        const stageContainer = stage.container();
        const stageRect = stageContainer.getBoundingClientRect();

        // 🔥 CALCULAR POSICIÓN EXACTA DEL ELEMENTO EN PANTALLA
        const elementoEnPantallaX = stageRect.left + (box.x * escalaActiva);
        const elementoEnPantallaY = stageRect.top + (box.y * escalaActiva);
        const anchoElemento = box.width * escalaActiva;

        // 🎯 POSICIÓN MUY CERCA: Esquina superior derecha pegada al elemento
        const botonX = elementoEnPantallaX + anchoElemento - 8; // Solo -8px para que se superponga un poco
        const botonY = elementoEnPantallaY - 8; // -8px arriba del elemento

        return (
          <div
            ref={botonOpcionesRef}
            className="fixed z-50 bg-white border-2 border-purple-500 rounded-full shadow-lg hover:shadow-xl transition-shadow duration-200"
            style={{
              left: "0px", // 🔥 POSICIÓN INICIAL - será actualizada por la función
              top: "0px",
              width: "24px",
              height: "24px",
              display: "none",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto",
              transition: "none",
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(4px)",
              border: "2px solid #773dbe",
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMostrarPanelZ((prev) => !prev);
              }}
              className="hover:bg-purple-50 w-full h-full rounded-full flex items-center justify-center transition-colors text-xs"
              title="Opciones del elemento"
            >
              ⚙️
            </button>
          </div>
        );
      })()}



      {mostrarPanelZ && (
        <MenuOpcionesElemento
          isOpen={mostrarPanelZ}
          botonOpcionesRef={botonOpcionesRef}
          elementoSeleccionado={objetos.find(o => o.id === elementosSeleccionados[0])}
          onCopiar={onCopiar}
          onPegar={onPegar}
          onDuplicar={onDuplicar}
          onEliminar={onEliminar}
          moverElemento={moverElemento}
          onCerrar={() => setMostrarPanelZ(false)}
          reemplazarFondo={reemplazarFondo}
          secciones={secciones}
          objetos={objetos}
          setSecciones={setSecciones}
          setObjetos={setObjetos}
          setElementosSeleccionados={setElementosSeleccionados}
        />
      )}


      <FloatingTextToolbar
        objetoSeleccionado={objetoSeleccionado}
        setObjetos={setObjetos}
        elementosSeleccionados={elementosSeleccionados}
        mostrarSelectorFuente={mostrarSelectorFuente}
        setMostrarSelectorFuente={setMostrarSelectorFuente}
        mostrarSelectorTamaño={mostrarSelectorTamaño}
        setMostrarSelectorTamaño={setMostrarSelectorTamaño}
        ALL_FONTS={ALL_FONTS}
        fontManager={fontManager}
        tamaniosDisponibles={tamaniosDisponibles}
        onCambiarAlineacion={onCambiarAlineacion}
      />



    </div>
  );

}
