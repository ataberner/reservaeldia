// components/CanvasEditor.jsx
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Stage, Layer, Line, Rect, Text, Transformer, Image as KonvaImage, Group , Circle} from "react-konva";
import { doc, getDoc, updateDoc, serverTimestamp, addDoc, collection } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import ElementoCanvas from "./ElementoCanvas";
import ReactDOMServer from "react-dom/server";
import { convertirAlturaVH, calcularOffsetY } from "../utils/layout";
import { crearSeccion } from "@/models/estructuraInicial";
import usePlantillasDeSeccion from "@/hooks/usePlantillasDeSeccion";
import { useImperativeObjects } from '@/hooks/useImperativeObjects';
import SelectionBounds from './SelectionBounds';
import HoverIndicator from './HoverIndicator';
import useImage from "use-image";
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




const iconoRotacion = ReactDOMServer.renderToStaticMarkup(<RotateCcw color="black" />);
const urlData = "data:image/svg+xml;base64," + btoa(iconoRotacion);


export default function CanvasEditor({ slug, zoom = 1, onHistorialChange, onFuturosChange, userId }) {
  const [objetos, setObjetos] = useState([]);
  const [secciones, setSecciones] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [futuros, setFuturos] = useState([]);
   const [elementosSeleccionados, setElementosSeleccionados] = useState([]);
    const [modoEdicion, setModoEdicion] = useState(false);
    const [cargado, setCargado] = useState(false);
    const stageRef = useRef(null);
    const dragStartPos = useRef(null);
    const hasDragged = useRef(false);
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
    const [guiaLineas, setGuiaLineas] = useState([]);
    const [scale, setScale] = useState(1);
    const [seccionesAnimando, setSeccionesAnimando] = useState([]);
    const { refrescar: refrescarPlantillasDeSeccion } = usePlantillasDeSeccion();
   const [mostrarSubmenuCapa, setMostrarSubmenuCapa] = useState(false);
    const [elementoCopiado, setElementoCopiado] = useState(null);
    const elementRefs = useRef({});
    const contenedorRef = useRef(null);
    const ignoreNextUpdateRef = useRef(false);
    
    const [anchoStage, setAnchoStage] = useState(800);
    const [mostrarSelectorFuente, setMostrarSelectorFuente] = useState(false);
    const fuentesLocales = [
  { nombre: "Arial", valor: "Arial, sans-serif" },
  { nombre: "Helvetica", valor: "Helvetica, sans-serif" },
  { nombre: "Verdana", valor: "Verdana, sans-serif" },
  { nombre: "Tahoma", valor: "Tahoma, sans-serif" },
  { nombre: "Trebuchet MS", valor: "'Trebuchet MS', sans-serif" },
  { nombre: "Georgia", valor: "Georgia, serif" },
  { nombre: "Times New Roman", valor: "'Times New Roman', serif" },
  { nombre: "Courier New", valor: "'Courier New', monospace" },
  { nombre: "Lucida Console", valor: "'Lucida Console', monospace" },
  { nombre: "Comic Sans MS", valor: "'Comic Sans MS', cursive" },
  { nombre: "Impact", valor: "Impact, sans-serif" },
  { nombre: "sans-serif", valor: "sans-serif" },
  { nombre: "serif", valor: "serif" },
  { nombre: "monospace", valor: "monospace" },
];
const fuentesGoogle = [
  { nombre: "Poppins", valor: "Poppins" },
  { nombre: "Raleway", valor: "Raleway" },
  { nombre: "Playfair Display", valor: "Playfair Display" },
  { nombre: "Roboto", valor: "Roboto" },
  { nombre: "Lobster", valor: "Lobster" },
];
      const [mostrarSelectorTamaño, setMostrarSelectorTamaño] = useState(false);
      const tamaniosDisponibles = Array.from({ length: (120 - 6) / 2 + 1 }, (_, i) => 6 + i * 2);
      const [icono] = useImage(urlData);
      const nuevoTextoRef = useRef(null);



 const registerRef = useCallback((id, node) => {
  
  elementRefs.current[id] = node;
  imperativeObjects.registerObject(id, node);
}, [imperativeObjects]);

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
    

    // 🔒 Validación de sección activa
    if (!seccionActivaId) {
      alert("⚠️ Primero seleccioná una sección para insertar el elemento.");
      return;
    }

    const nuevoConSeccion = {
      ...nuevo,
      seccionId: seccionActivaId,
    };

    // ✅ Insertar el nuevo objeto con sección asignada
    setObjetos((prev) => [...prev, nuevoConSeccion]);

    // ✅ Seleccionarlo automáticamente
    setElementosSeleccionados([nuevoConSeccion.id]);
  };

  window.addEventListener("insertar-elemento", handler);
  return () => window.removeEventListener("insertar-elemento", handler);
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
  if (onHistorialChange) onHistorialChange(historial);
}, [historial]);

useEffect(() => {
  if (onFuturosChange) onFuturosChange(futuros);
}, [futuros]);





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
  console.log("📊 Estado selección cambió:", {
    seleccionActiva,
    areaSeleccion,
    inicioSeleccion
  });
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


// REEMPLAZAR ESTE useEffect:
useEffect(() => {
  if (!cargado) return;

  if (ignoreNextUpdateRef.current) {
    ignoreNextUpdateRef.current = false;
    return;
  }

  // 🎯 NUEVO: No guardar historial durante transformaciones
  if (window._resizeData?.isResizing) {
    return;
  }

  // 🔥 Usar un ref para comparar el estado anterior
  const objetosStringified = JSON.stringify(objetos);
  
  setHistorial((prev) => {
    const ultimoStringified = prev.length > 0 ? JSON.stringify(prev[prev.length - 1]) : null;
    if (ultimoStringified !== objetosStringified) {
      return [...prev.slice(-19), objetos]; // 🔥 Limitar historial a 20 elementos
    }
    return prev;
  });

  setFuturos([]);
  
  // 💾 Guardado con debounce más largo
  const timeoutId = setTimeout(async () => {
    try {
      const ref = doc(db, "borradores", slug);
      await updateDoc(ref, {
        objetos,
        ultimaEdicion: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error guardando:", error);
    }
  }, 500); // 🔥 Aumentar debounce a 500ms

  return () => clearTimeout(timeoutId);
}, [objetos, cargado, slug]); // 🔥 Agregar slug como dependencia explícita



const actualizarObjeto = (index, nuevo) => {
   
  
  const nuevos = [...objetos];
  // 🔥 REMOVER el flag antes de aplicar
  const { fromTransform, ...cleanNuevo } = nuevo;
  nuevos[index] = { ...nuevos[index], ...cleanNuevo };
  
   
  setObjetos(nuevos);
};

useEffect(() => {
  const handleKeyDown = (e) => {
    const ctrl = e.ctrlKey || e.metaKey;

    // Atajos de teclado para elementos seleccionados
    if (elementosSeleccionados.length > 0) {
      // Copiar (Ctrl + C)
      if (ctrl && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copiarElemento();
        return;
      }

      // Pegar (Ctrl + V)
      if (ctrl && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pegarElemento();
        return;
      }

      // Duplicar (Ctrl + D)
      if (ctrl && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicarElemento();
        return;
      }

// Eliminar (Delete o Backspace)
if (e.key === "Delete" || e.key === "Backspace") {
  e.preventDefault();
  e.stopPropagation();
  
  const idsAEliminar = [...elementosSeleccionados];
  
  // 🔥 LIMPIAR HOVER STATE
  setHoverId(null);
  
  // 🔥 LIMPIAR SELECCIÓN Y ESTADOS
  setModoEdicion(false);
  setElementosSeleccionados([]);
  setMostrarPanelZ(false);
  
  setTimeout(() => {
    setObjetos(prev => {
      const filtrados = prev.filter((o) => !idsAEliminar.includes(o.id));
      return filtrados;
    });
  }, 50);

  return;
}
    }
  };

  document.addEventListener("keydown", handleKeyDown, false);
  
  return () => {
    document.removeEventListener("keydown", handleKeyDown, false);
  };
}, [elementosSeleccionados]);


useEffect(() => {
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (historial.length > 1) {
        setHistorial((prev) => {
          const nuevoHistorial = [...prev];
          const actual = nuevoHistorial.pop();
          const anterior = nuevoHistorial[nuevoHistorial.length - 1];
          ignoreNextUpdateRef.current = true;
            setObjetos(anterior);

            setElementosSeleccionados([]); // ✅ Evita error si ya no existe
            setModoEdicion(false);         // ✅ Cierra edición inline si estaba activa

          setFuturos((f) => [actual, ...f]); // guarda para rehacer
          return nuevoHistorial;
        });
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      if (futuros.length > 0) {
        const siguiente = futuros[0];
        ignoreNextUpdateRef.current = true;
        setObjetos(siguiente);

        setFuturos((f) => f.slice(1)); // eliminamos el que usamos
        setHistorial((h) => [...h, siguiente]); // lo agregamos al historial
      }
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [historial, futuros]);




const iniciarEdicionInline = (obj, seleccionarTodo = false) => {
    console.log("🚨 === iniciarEdicionInline ===");
  console.log("🚨 obj.id:", obj.id);
  console.log("🚨 seleccionarTodo:", seleccionarTodo);
  console.log("🚨 elementosSeleccionados actuales:", elementosSeleccionados);
  const id = obj.id;
  const textNode = elementRefs.current[id];
  
  if (elementosSeleccionados.length > 1) return;
  // Verificar que el nodo y el stage existan
  if (!textNode || !stageRef.current) {
    console.warn('El nodo o el stage no están listos');
    return;
  }

  const stage = stageRef.current;
  const container = stage.container();
  const box = textNode.getClientRect({ relativeTo: stage });

  

  const fontFamily = obj.fontFamily || "inherit";

  const area = document.createElement("textarea");
  document.body.appendChild(area);

  area.value = obj.texto;
  area.style.position = "absolute";
  const escala = zoom === 1 ? scale : zoom;

    // 🔥 box.y ya viene con coordenadas absolutas del canvas (con offset aplicado)
    // No necesitamos restar offsetY porque textNode ya está posicionado correctamente

  area.style.top = `${
    container.getBoundingClientRect().top + box.y * escala
  }px`;


  area.style.left = `${container.getBoundingClientRect().left + box.x * escala}px`;
  area.style.width = `${box.width}px`;
  area.style.height = "auto";
  area.style.fontSize = `${(obj.fontSize || 24) * escala}px`;
  area.style.fontFamily = fontFamily;
  area.style.color = obj.color || "#000";
  area.style.border = "none";
  area.style.padding = "0px";
  area.style.lineHeight = "1";
  area.style.boxSizing = "border-box";
  area.style.margin = "0";
  area.style.background = "transparent";
  area.style.outline = "none";
  area.style.resize = "none";
  area.style.overflow = "hidden";
  area.style.transform = `scale(${escala}) rotate(${obj.rotation || 0}deg)`;
  area.style.zIndex = 1000;
  area.style.fontWeight = obj.fontWeight || "normal";
  area.style.fontStyle = obj.fontStyle || "normal";
  area.style.textDecoration = obj.textDecoration || "none";

  // Asegurarnos de que el área de texto esté visible
  setTimeout(() => {
    area.focus();
    if (seleccionarTodo) {
      area.select();
    }
  }, 100);

  let yaFinalizado = false;

  const finalizar = () => {
    if (yaFinalizado) return;
    yaFinalizado = true;

    const textoNuevo = area.value;
    const index = objetos.findIndex((o) => o.id === id);

    if (index === -1) {
      console.warn("No se pudo guardar: el objeto fue eliminado o deshecho");
      if (area && area.parentNode) area.remove();
      setModoEdicion(false);
      return;
    }

    const actualizado = [...objetos];
actualizado[index] = {
  ...actualizado[index],
  texto: textoNuevo,
  // 🔥 NO tocar x, y aquí - mantener las coordenadas que ya tiene
};
    setObjetos(actualizado);

    setModoEdicion(false);

    if (area && area.parentNode) area.remove();
    window.modoEdicionCanvas = false;
  };

  area.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finalizar();
    }
  });

  area.addEventListener("blur", finalizar);
  area.addEventListener("input", () => {
    area.style.height = "auto";
    area.style.height = area.scrollHeight + "px";
  });

  setModoEdicion(true);
  window.modoEdicionCanvas = true;
};



const finalizarEdicionInline = () => {
  return new Promise((resolve) => {
    if (!modoEdicion || !nuevoTextoRef.current) return resolve();

    const id = nuevoTextoRef.current;
    const textNode = elementRefs.current[id];

    const textarea = document.querySelector("textarea");
    if (!textarea) return resolve();

    const textoNuevo = textarea.value;
    const index = objetos.findIndex((o) => o.id === id);

    if (index === -1) {
      console.warn("No se pudo guardar: el objeto fue eliminado o deshecho");
      textarea.remove();
      setModoEdicion(false);
      return resolve();
    }

    const actualizado = [...objetos];
    actualizado[index] = {
      ...actualizado[index],
      texto: textoNuevo,
      // 👇 NO tocar x, y aquí
    };

    setObjetos(actualizado);
    setModoEdicion(false);
    if (textarea && textarea.parentNode) textarea.remove();
    nuevoTextoRef.current = null;
    resolve();
  });
};





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



const handleGuardarComoPlantilla = async (seccionId) => {
  const seccion = secciones.find((s) => s.id === seccionId);
  if (!seccion) return;




  const objetosDeEsaSeccion = objetos.filter((obj) => obj.seccionId === seccionId);


  const user = getAuth().currentUser;
  if (!user) {
    alert("⚠️ No estás logueado. No se puede guardar la plantilla.");
    return;
  }

  const objetosFinales = await Promise.all(
    objetosDeEsaSeccion.map(async (obj) => {
      if (obj.tipo === "imagen" && obj.src && obj.src.startsWith("user_uploads/")) {
        const nuevaUrl = await subirImagenPublica(obj.src);
        return { ...obj, src: nuevaUrl };
      }
      return obj;
    })
  );

  const nombre = prompt("Nombre de la plantilla:");
  if (!nombre) return;

  const plantilla = {
    nombre,
    altura: seccion.altura,
    fondo: seccion.fondo,
    tipo: seccion.tipo,
    objetos: objetosFinales,
  };



  const ref = collection(db, "plantillas_secciones");
  await addDoc(ref, plantilla);
await refrescarPlantillasDeSeccion();


  alert("✅ Plantilla guardada correctamente");
};




const fuentesDisponibles = [...fuentesLocales, ...fuentesGoogle];
const objetoSeleccionado = objetos.find((o) => o.id === elementosSeleccionados[0]);


const mostrarGuias = (pos, idActual) => {
  const lineas = [];
  const margen = 5;
  const anchoCanvas = 800;
  const altoCanvas = 1400;

  const centroCanvasX = anchoCanvas / 2;
  const centroCanvasY = altoCanvas / 2;

  const nodeActual = elementRefs.current[idActual];
  if (!nodeActual) return;

  const boxActual = nodeActual.getClientRect();
  const centerX = boxActual.x + boxActual.width / 2;
  const centerY = boxActual.y + boxActual.height / 2;

  const top = boxActual.y;
  const bottom = boxActual.y + boxActual.height;
  const left = boxActual.x;
  const right = boxActual.x + boxActual.width;

  // Centrales del canvas
  if (Math.abs(centerX - centroCanvasX) < margen) {
    lineas.push({ points: [centroCanvasX, 0, centroCanvasX, altoCanvas] });
    nodeActual.x(nodeActual.x() + (centroCanvasX - centerX));
  }
  if (Math.abs(centerY - centroCanvasY) < margen) {
    lineas.push({ points: [0, centroCanvasY, anchoCanvas, centroCanvasY] });
    nodeActual.y(nodeActual.y() + (centroCanvasY - centerY));
  }

  objetos.forEach((obj) => {
    if (obj.id === idActual) return;
    const node = elementRefs.current[obj.id];
    if (!node) return;

    const box = node.getClientRect();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const t = box.y;
    const b = box.y + box.height;
    const l = box.x;
    const r = box.x + box.width;

    // Centrado con otro objeto
    if (Math.abs(centerX - cx) < margen) {
      lineas.push({ points: [cx, 0, cx, altoCanvas] });
      nodeActual.x(nodeActual.x() + (cx - centerX));
    }
    if (Math.abs(centerY - cy) < margen) {
      lineas.push({ points: [0, cy, anchoCanvas, cy] });
      nodeActual.y(nodeActual.y() + (cy - centerY));
    }

    // BORDES
    if (Math.abs(left - l) < margen) {
      lineas.push({ points: [l, 0, l, altoCanvas] });
      nodeActual.x(nodeActual.x() + (l - left));
    }
    if (Math.abs(right - r) < margen) {
      lineas.push({ points: [r, 0, r, altoCanvas] });
      nodeActual.x(nodeActual.x() + (r - right));
    }
    if (Math.abs(top - t) < margen) {
      lineas.push({ points: [0, t, anchoCanvas, t] });
      nodeActual.y(nodeActual.y() + (t - top));
    }
    if (Math.abs(bottom - b) < margen) {
      lineas.push({ points: [0, b, anchoCanvas, b] });
      nodeActual.y(nodeActual.y() + (b - bottom));
    }
  });

  setGuiaLineas(lineas);
};




// 🧠 Copiar el objeto seleccionado
const copiarElemento = () => {
  const seleccionados = objetos.filter((o) => elementosSeleccionados.includes(o.id));
  if (seleccionados.length > 0) {
    // Guardamos todos los seleccionados sin los IDs
    window._objetosCopiados = seleccionados.map((o) => ({ ...o, id: undefined }));
  }
};


// 🧠 Pegar el objeto copiado
const pegarElemento = () => {
  const copiados = window._objetosCopiados || [];
  const nuevos = copiados.map((c, i) => ({
    ...c,
    id: `obj-${Date.now()}-${i}`,
    x: (c.x || 100) + 30 * (i + 1),
    y: (c.y || 100) + 30 * (i + 1),
  }));

  setObjetos((prev) => [...prev, ...nuevos]);
  setElementosSeleccionados(nuevos.map((n) => n.id));
};


// 🧠 Duplicar el objeto seleccionado
const duplicarElemento = () => {
  const seleccionados = objetos.filter((o) => elementosSeleccionados.includes(o.id));
  const duplicados = seleccionados.map((original, i) => ({
    ...original,
    id: `obj-${Date.now()}-${i}`,
    x: original.x + 20,
    y: original.y + 20,
  }));
  setObjetos((prev) => [...prev, ...duplicados]);
  setElementosSeleccionados(duplicados.map((d) => d.id));
};


// 🧠 Eliminar el objeto seleccionado
// 🧠 Eliminar el objeto seleccionado
const eliminarElemento = () => {
  if (elementosSeleccionados.length === 0) return;

  // 🔥 NUEVO: Guardar IDs antes de limpiar selección
  const idsAEliminar = [...elementosSeleccionados];
  
  // Limpiar selección primero
  setElementosSeleccionados([]);
  setMostrarPanelZ(false);
  setModoEdicion(false);
  
  // Eliminar objetos con delay
  setTimeout(() => {
    setObjetos((prev) => prev.filter((o) => !idsAEliminar.includes(o.id)));
  }, 10);
};



// Agregar esta función después de la línea 724 (después de finalizarEdicionInline)

const handleStartTextEdit = async (id, obj) => {
  console.log("🚨 handleStartTextEdit llamado para:", id);
  console.trace("🔍 Stack trace de handleStartTextEdit");
  
  // ✅ Si ya estamos en modo edición, finalizar primero
  if (modoEdicion) {
    await finalizarEdicionInline();
  }
  
  // ✅ Asegurar que el elemento esté seleccionado
  if (!elementosSeleccionados.includes(id)) {
    setElementosSeleccionados([id]);
  }
  
  // ✅ Iniciar edición inline con un pequeño delay para asegurar que el estado se actualizó
  setTimeout(() => {
    iniciarEdicionInline(obj);
  }, 50);
};



const borrarSeccion = async (seccionId) => {
  const seccion = secciones.find((s) => s.id === seccionId);
  if (!seccion) return;

  // 🚨 Confirmación
  const confirmar = confirm(
    `¿Estás seguro de que querés borrar la sección "${seccion.tipo || 'sin nombre'}"?\n\n` +
    "Se eliminarán todos los elementos que contiene.\n" +
    "Esta acción no se puede deshacer."
  );
  
  if (!confirmar) return;

  try {
    // 🗑️ Eliminar objetos de la sección
    const objetosFiltrados = objetos.filter(obj => obj.seccionId !== seccionId);
    
    // 🗑️ Eliminar la sección
    const seccionesFiltradas = secciones.filter(s => s.id !== seccionId);
    
    // 📱 Actualizar estados
    setObjetos(objetosFiltrados);
    setSecciones(seccionesFiltradas);
    
    // 🔄 Si era la sección activa, deseleccionar
    if (seccionActivaId === seccionId) {
      setSeccionActivaId(null);
    }
    
    // 💾 Guardar en Firebase
    const ref = doc(db, "borradores", slug);
    await updateDoc(ref, {
      secciones: seccionesFiltradas,
      objetos: objetosFiltrados,
      ultimaEdicion: serverTimestamp(),
    });
    
    
    
  } catch (error) {
    console.error("❌ Error al borrar sección:", error);
    alert("Ocurrió un error al borrar la sección. Inténtalo de nuevo.");
  }
};


const determinarNuevaSeccion = (yRelativaConOffset, seccionActualId) => {
  // yRelativaConOffset viene de ElementoCanvas con el offset ya aplicado
  // Necesitamos convertirla a Y absoluta real del canvas
  
  const seccionActual = seccionesOrdenadas.find(s => s.id === seccionActualId);
  if (!seccionActual) return { nuevaSeccion: null, coordenadasAjustadas: {} };
  
  // yRelativaConOffset ya es la Y real en el canvas (viene con offset aplicado)
  const yAbsolutaReal = yRelativaConOffset;
  
  
  // Determinar nueva sección basada en Y absoluta real
  let acumulado = 0;
  for (const seccion of seccionesOrdenadas) {
    if (yAbsolutaReal >= acumulado && yAbsolutaReal < acumulado + seccion.altura) {
      if (seccion.id === seccionActualId) {
        // No cambió de sección
        return { nuevaSeccion: null, coordenadasAjustadas: {} };
      }
      
      // Cambió de sección - calcular nueva Y relativa
      const nuevaY = yAbsolutaReal - acumulado;
    

      
      return { 
        nuevaSeccion: seccion.id, 
        coordenadasAjustadas: { y: nuevaY } 
      };
    }
    acumulado += seccion.altura;
  }
  
  // Está fuera de todas las secciones - mover a la más cercana
  if (yAbsolutaReal < 0) {
    // Arriba de todo - primera sección
  
    return { 
      nuevaSeccion: seccionesOrdenadas[0].id, 
      coordenadasAjustadas: { y: 0 } 
    };
  } else {
    // Abajo de todo - última sección
    
    const ultimaSeccion = seccionesOrdenadas[seccionesOrdenadas.length - 1];
    return { 
      nuevaSeccion: ultimaSeccion.id, 
      coordenadasAjustadas: { y: ultimaSeccion.altura - 50 } 
    };
  }
};



const handleCrearSeccion = async (datos) => {
  const ref = doc(db, "borradores", slug);

  setSecciones((prevSecciones) => {
    const nueva = crearSeccion(datos, prevSecciones); // ✅ usar el estado actual

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

      updateDoc(ref, {
        secciones: nuevasSecciones,
        objetos: nuevosObjetos,
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



const moverSeccion = async (seccionId, direccion) => {
  console.log("🚀 INICIANDO ANIMACIÓN - Sección:", seccionId, "Dirección:", direccion);
  
  const indiceActual = seccionesOrdenadas.findIndex(s => s.id === seccionId);
  
  // Validar límites
  if (direccion === 'subir' && indiceActual === 0) {
    console.log("❌ No se puede subir - ya es la primera");
    return;
  }
  if (direccion === 'bajar' && indiceActual === seccionesOrdenadas.length - 1) {
    console.log("❌ No se puede bajar - ya es la última");
    return;
  }
  
  const indiceDestino = direccion === 'subir' ? indiceActual - 1 : indiceActual + 1;
  const seccionActual = seccionesOrdenadas[indiceActual];
  const seccionDestino = seccionesOrdenadas[indiceDestino];
  
  console.log("🔄 Intercambiando:", seccionActual.id, "con", seccionDestino.id);
  
  // Marcar secciones como animando (ARRAY en lugar de Set)
  setSeccionesAnimando([seccionActual.id, seccionDestino.id]);
  console.log("🎬 ARRAY ANIMANDO:", [seccionActual.id, seccionDestino.id]);
  
  // Intercambiar órdenes
  const nuevasSecciones = secciones.map(s => {
    if (s.id === seccionActual.id) {
      return { ...s, orden: seccionDestino.orden };
    }
    if (s.id === seccionDestino.id) {
      return { ...s, orden: seccionActual.orden };
    }
    return s;
  });
  
  // Actualizar estado
  setSecciones(nuevasSecciones);
  
  // Terminar animación después de 500ms
  setTimeout(() => {
    console.log("🏁 LIMPIANDO ANIMACIÓN");
    setSeccionesAnimando([]);
  }, 500);
  
  // Guardar en Firebase
  try {
    const ref = doc(db, "borradores", slug);
    await updateDoc(ref, {
      secciones: nuevasSecciones,
      ultimaEdicion: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error guardando orden de secciones:", error);
  }
};




const seccionesOrdenadas = [...secciones].sort((a, b) => a.orden - b.orden);


const escalaActiva = zoom === 1 ? scale : zoom;
const escalaVisual = zoom === 1 ? scale : (zoom * 1.15); // ✅ 800px × 1.15 = 920px visuales

const altoCanvasDinamico = seccionesOrdenadas.reduce((acc, s) => acc + s.altura, 0) || 800;



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
        right: -130,
        zIndex: 25,
      }}
    >
      {/* Botón Subir */}
      <button
        onClick={() => moverSeccion(seccion.id, 'subir')}
        disabled={esPrimera || estaAnimando}
        className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
          esPrimera || estaAnimando
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-purple-600 text-white hover:bg-purple-700 hover:scale-105 shadow-md hover:shadow-lg'
        } ${estaAnimando ? 'animate-pulse shadow-xl' : ''}`}
        title={esPrimera ? 'Ya es la primera sección' : 'Subir sección'}
      >
        ↑ Subir
      </button>
      
      {/* Botón Guardar como plantilla */}
      <button
        onClick={() => handleGuardarComoPlantilla(seccion.id)}
        disabled={estaAnimando}
        className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
          estaAnimando
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-green-600 text-white hover:bg-green-700 hover:scale-105 shadow-md hover:shadow-lg'
        } ${estaAnimando ? 'animate-pulse shadow-xl' : ''}`}
        title="Guardar esta sección como plantilla"
      >
        💾 Plantilla
      </button>
      
      {/* Botón Borrar sección */}
      <button
        onClick={() => borrarSeccion(seccion.id)}
        disabled={estaAnimando}
        className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
          estaAnimando
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-red-600 text-white hover:bg-red-700 hover:scale-105 shadow-md hover:shadow-lg'
        } ${estaAnimando ? 'animate-pulse shadow-xl' : ''}`}
        title="Borrar esta sección y todos sus elementos"
      >
        🗑️ Borrar
      </button>
      
      {/* Botón Bajar */}
      <button
        onClick={() => moverSeccion(seccion.id, 'bajar')}
        disabled={esUltima || estaAnimando}
        className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
          esUltima || estaAnimando
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-purple-600 text-white hover:bg-purple-700 hover:scale-105 shadow-md hover:shadow-lg'
        } ${estaAnimando ? 'animate-pulse shadow-xl' : ''}`}
        title={esUltima ? 'Ya es la última sección' : 'Bajar sección'}
      >
        ↓ Bajar
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
  hitGraphEnabled={false}
  clipFunc={() => {}}
    style={{
    background: "white",
    overflow: "visible",
    position: "relative",
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)", // ✅ SOMBRA PARA DESTACAR
    clipPath: "none",
  }}
    

onMouseDown={(e) => {
  const stage = e.target.getStage();
  const pointerPos = stage.getPointerPosition();
  
     
  const esStage = e.target === stage;
  const esSeccion = e.target.attrs?.id && secciones.some(s => s.id === e.target.attrs?.id);

 
  dragStartPos.current = stage.getPointerPosition();
  hasDragged.current = false;

  // 🔒 EXCLUIR CLICKS EN TRANSFORMER
  const esTransformer = e.target.getClassName?.() === 'Transformer' || 
                      e.target.parent?.getClassName?.() === 'Transformer' ||
                      e.target.attrs?.name?.includes('_anchor');

  if (esTransformer) {
    return;
  }

  // 🔥 NUEVO: Verificar si el click fue en un elemento arrastrable
  const clickEnElemento = Object.values(elementRefs.current).some((node) => {
    return node === e.target;
  });

  if (clickEnElemento) {
    return;
  }

  if (esStage || esSeccion) {
    setElementosSeleccionados([]);
    setModoEdicion(false);
    setMostrarPanelZ(false);
    setMostrarSubmenuCapa(false);

    if (esStage) {
      setSeccionActivaId(null);
    }

    const pos = stage.getPointerPosition(); // 🔧 SOLO UNA DECLARACIÓN
    setInicioSeleccion({ x: pos.x, y: pos.y });
    setAreaSeleccion({ x: pos.x, y: pos.y, width: 0, height: 0 });
    setSeleccionActiva(true);

    }
}}


onMouseMove={(e) => {
   
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
      const ids = objetos.filter((obj) => {
        const node = elementRefs.current[obj.id];
        if (!node) return false;
        
        // 🔧 SOLUCIÓN: Usar getClientRect con relativeTo stage
        const box = node.getClientRect({ relativeTo: stage });

        return (
          box.x + box.width >= area.x &&
          box.x <= area.x + area.width &&
          box.y + box.height >= area.y &&
          box.y <= area.y + area.height
        );
      }).map((obj) => obj.id);

      setElementosPreSeleccionados(ids);
    }
  });
}}

onMouseUp={() => {
  if (!seleccionActiva || !areaSeleccion) return;

 
  const nuevaSeleccion = objetos.filter((obj) => {
    const node = elementRefs.current[obj.id];
    if (!node) {
      console.warn("❌ Ref perdida para:", obj.id);
      return false;
    }
    
    // 🔧 CORRECCIÓN: Obtener stage desde stageRef
    const stage = stageRef.current;
    const box = node.getClientRect();
    
     
    return (
      box.x >= areaSeleccion.x &&
      box.y >= areaSeleccion.y &&
      box.x + box.width <= areaSeleccion.x + areaSeleccion.width &&
      box.y + box.height <= areaSeleccion.y + areaSeleccion.height
    );
  });

  setElementosSeleccionados(elementosPreSeleccionados);
  setElementosPreSeleccionados([]);
  setSeleccionActiva(false);
  setAreaSeleccion(null);
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
    // Fondo principal de la sección
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


        {objetos.map((obj, i) => {
    if (modoEdicion && elementosSeleccionados[0] === obj.id) return null;

    return (
      <ElementoCanvas
        key={obj.id}
        obj={{
              ...obj,
              y: obj.y + calcularOffsetY(
                seccionesOrdenadas,
                seccionesOrdenadas.findIndex((s) => s.id === obj.seccionId),
                altoCanvas
              ),
            }}
        anchoCanvas={800}
        isSelected={elementosSeleccionados.includes(obj.id)}
        preSeleccionado={elementosPreSeleccionados.includes(obj.id)}
        onHover={setHoverId}
        onStartTextEdit={handleStartTextEdit} 
        

        
          registerRef={registerRef}
    


  
// onSelect simple, sin lógica de segundo click
onSelect={async (id, obj, e) => {
  console.log("🎯 onSelect - elemento:", id, "tipo:", obj.tipo);
  
  if (window._resizeData?.isResizing) {
    window._resizeData = null;
  }
  
  e.evt.cancelBubble = true;
  const esShift = e?.evt?.shiftKey;

  if (modoEdicion) {
    await finalizarEdicionInline();
  }

  setElementosSeleccionados((prev) => {
    if (esShift) {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    } else {
      return [id];
    }
  });

  console.log("✅ Elemento seleccionado:", id);
}}


onChange={(id, nuevo) => {
   console.log("🔀 onChange llamado:", { 
    id, 
    fromTransform: nuevo.fromTransform,
    finalizoDrag: nuevo.finalizoDrag,
    y: nuevo.y 
  });

    // 🔥 NO procesar si viene del Transform
  if (nuevo.fromTransform) {
    console.log("🔥 Ignorando onChange porque viene del Transform");
    return;
  }

  const objOriginal = objetos.find((o) => o.id === id);
  if (!objOriginal) return;

  // 🔥 Para drag final, procesar inmediatamente
  if (nuevo.finalizoDrag) {
    const { nuevaSeccion, coordenadasAjustadas } = determinarNuevaSeccion(nuevo.y, objOriginal.seccionId);
    
    let coordenadasFinales = { ...nuevo };
    delete coordenadasFinales.finalizoDrag;
    
    if (nuevaSeccion) {
      console.log(`🔄 Elemento ${id} cambió de sección ${objOriginal.seccionId} → ${nuevaSeccion}`);
      coordenadasFinales = { ...coordenadasFinales, ...coordenadasAjustadas, seccionId: nuevaSeccion };
    } else {
      // Calcular offset para la sección actual
      const seccion = seccionesOrdenadas.find((s) => s.id === objOriginal.seccionId);
      if (seccion) {
        const offsetY = calcularOffsetY(
          seccionesOrdenadas,
          seccionesOrdenadas.findIndex((s) => s.id === seccion.id),
          altoCanvas
        );
        coordenadasFinales.y = nuevo.y - offsetY;
      }
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
      
        onDragMovePersonalizado={mostrarGuias}
        onDragEndPersonalizado={() => setGuiaLineas([])}
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


{elementosSeleccionados.length > 0 && (
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
            
        } else if (newAttrs.isFinal) {
  // Final: actualización completa
  console.log('🎯 Guardando estado final para historial');
  window._resizeData = { isResizing: false };
  
  const { isPreview, isFinal, ...cleanAttrs } = newAttrs;
  
  // 🔥 CONVERTIR coordenadas absolutas a relativas ANTES de guardar
  const objOriginal = objetos[objIndex];
  const seccionIndex = seccionesOrdenadas.findIndex(s => s.id === objOriginal.seccionId);
  const offsetY = calcularOffsetY(seccionesOrdenadas, seccionIndex, altoCanvas);
  
  const finalAttrs = { 
    ...cleanAttrs,
    // Convertir Y absoluta a Y relativa restando el offset
    y: cleanAttrs.y - offsetY,
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
)}


{/* 🔥 OPTIMIZACIÓN: No mostrar hover durante drag/resize */}
{!window._resizeData?.isResizing && !window._isDragging && (
  <HoverIndicator
    hoveredElement={hoverId}
    elementRefs={elementRefs}
  />
)}


{/* Líneas de guía dinámicas */}
{guiaLineas.map((linea, i) => (
  <Line
    key={i}
    points={linea.points}
    stroke="#773dbe"
    strokeWidth={1}
    dash={[4, 4]}
    listening={false}
  />
))}


      </Layer>

     </Stage>


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


    {/* ➕ Botón para añadir nueva sección */}
<button
  onClick={handleCrearSeccion}
  className="fixed bottom-6 right-6 z-50 bg-[#773dbe] text-white px-4 py-2 rounded-full shadow-lg hover:bg-purple-700 transition"
>
  + Añadir sección
</button>

  </div>


</div>



{/* ✅ Botón de orden de capas (para cualquier tipo de objeto) */}
{elementosSeleccionados.length === 1 && (
  <div
    className="fixed z-50 bg-white border rounded shadow p-1 text-sm boton-mini-z"
    style={{
      top: "80px", // Arriba de la barra de texto
      right: "20px", // Esquina derecha
    }}
  >
    <button
      onClick={() => setMostrarPanelZ((prev) => !prev)}
      className="hover:bg-gray-100 px-2 py-1 rounded"
      title="Orden de capa"
    >
      ☰
    </button>
  </div>
)}


{mostrarPanelZ && (
  <div
    className="fixed z-50 bg-white border rounded shadow p-3 text-sm space-y-1 menu-z-index w-64"
    style={{
      top: "110px", // Justo debajo del botón ☰
      right: "20px",
    }}
  >
    <button
    onClick={() => {
    copiarElemento();
    setMostrarPanelZ(false);
  }}
   className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition">
      <Copy className="w-4 h-4" /> Copiar
    </button>

    <button
    onClick={() => {
    pegarElemento();
    setMostrarPanelZ(false);
  }}
   className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition">
      <ClipboardPaste className="w-4 h-4" /> Pegar
    </button>

    <button
    onClick={() => {
    duplicarElemento();
    setMostrarPanelZ(false);
  }}
   className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition">
      <PlusCircle className="w-4 h-4" /> Duplicar
    </button>

    <button
    onClick={() => {
    eliminarElemento();
    setMostrarPanelZ(false);
  }}
  className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition">
      <Trash2 className="w-4 h-4 text-red-500" /> Eliminar
    </button>

    <div className="relative">
      <button
        onClick={() => setMostrarSubmenuCapa((prev) => !prev)}
        className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
      >
        <Layers className="w-4 h-4" /> Orden de capa
      </button>

      {mostrarSubmenuCapa && (
        <div className="absolute top-0 left-full ml-2 w-56 bg-white border rounded shadow p-2 space-y-1 z-50">
          <button
          onClick={() => {
    moverElemento("al-frente");
    setMostrarPanelZ(false);
    setMostrarSubmenuCapa(false);
  }}
   className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition">
            <ArrowUp className="w-4 h-4" /> Traer al frente
          </button>
          <button
          onClick={() => {
            moverElemento("subir");
          setMostrarPanelZ(false);
    setMostrarSubmenuCapa(false);
  }}
   className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition">
            <MoveUp className="w-4 h-4" /> Subir
          </button>
          <button
          onClick={() => {
    moverElemento("bajar");
    setMostrarPanelZ(false);
    setMostrarSubmenuCapa(false);
  }}
   className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition">
            <MoveDown className="w-4 h-4" /> Bajar
          </button>
          <button
          onClick={() => {
    moverElemento("al-fondo");
    setMostrarPanelZ(false);
    setMostrarSubmenuCapa(false);
  }}
   className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition">
            <ArrowDown className="w-4 h-4" /> Enviar al fondo
          </button>
        </div>
      )}
    </div>
  </div>
)}





     {objetoSeleccionado?.tipo === "texto" && (
  <div
    className="fixed z-50 bg-white border rounded shadow p-2 flex gap-2 items-center"
    style={{
      top: "120px", // Justo debajo de la barra superior
      left: "50%",
      transform: "translateX(-50%)", // Centrado horizontalmente
      width: "auto",
      maxWidth: "800px", // Ancho máximo igual al canvas
    }}
  >
    
                <div
                  className={`relative cursor-pointer px-3 py-1 rounded border text-sm transition-all ${
                    mostrarSelectorFuente ? "bg-gray-200" : "hover:bg-gray-100"
                  }`}
                  style={{ fontFamily: objetoSeleccionado?.fontFamily || "sans-serif" }}
                  title="Fuente"
                  onClick={() => setMostrarSelectorFuente(!mostrarSelectorFuente)}
                >

                     {objetoSeleccionado?.fontFamily || "sans-serif"}
                      <div
                      className="absolute popup-fuente z-50"
                      style={{
                        top: "40px",     // más abajo desde el botón
                        left: "-200px",   // más hacia la izquierda desde el botón
                      }}
                    >

    {mostrarSelectorFuente && (
       <div className="bg-white border rounded-2xl shadow-md p-4 w-80 max-h-[500px] overflow-auto popup-fuente">
        <div className="text-xs font-semibold text-gray-600 mb-2">Fuente</div>
        {fuentesDisponibles.map((fuente) => (
          <div
              key={fuente.valor}
              className="flex items-center gap-2 px-2 py-2 hover:bg-gray-100 rounded cursor-pointer"
              style={{ fontFamily: fuente.valor }}
              onClick={(e) => {
              e.stopPropagation();
              setObjetos((prev) =>
                prev.map((o) =>
                  elementosSeleccionados.includes(o.id)
                    ? { ...o, fontFamily: fuente.valor }
                    : o
                )
              );
            }}

            >
          {/* Nombre visible */}
          <span className="text-sm text-gray-700 whitespace-nowrap text-left">{fuente.nombre}</span>

          {/* Ejemplo visual */}
          <span
            className="text-base ml-2 text-gray-400"
            style={{ fontFamily: fuente.valor }}
          >
            AaBbCc
          </span>

          {/* Tilde si está activa */}
          {objetoSeleccionado?.fontFamily === fuente.valor && (
            <Check className="w-4 h-4 text-purple-600 ml-auto" />

          )}
        </div>
        ))}


      </div>
    )}


  </div>
</div>


<div className="relative">
    <div className="flex items-center bg-white border rounded-lg overflow-hidden">
  {/* Botón - */}
<button
  className="px-2 py-1 hover:bg-gray-100 transition"
  onClick={(e) => {
    e.stopPropagation();
    setObjetos((prev) =>
      prev.map((o) => {
        if (!elementosSeleccionados.includes(o.id)) return o;
        const actual = o.fontSize || 24;
        const nuevo = Math.max(6, actual - 2);
        return { ...o, fontSize: nuevo };
      })
    );
  }}
>
  −
</button>


  {/* Número de tamaño */}
  <div
    className={`px-2 py-1 text-sm cursor-pointer transition-all ${
      mostrarSelectorTamaño ? "bg-gray-200" : "hover:bg-gray-100"
    }`}
    onClick={() => setMostrarSelectorTamaño(!mostrarSelectorTamaño)}
  >
    {objetoSeleccionado?.fontSize || 24}
    {/* Popup flotante */}
    {mostrarSelectorTamaño && (
      <div
        className="absolute popup-fuente z-50 bg-white border rounded-2xl shadow-md p-2 w-24 max-h-[300px] overflow-auto"
        style={{ top: "40px", left: "-10px" }}
      >
        {tamaniosDisponibles.map((tam) => (
          <div
            key={tam}
            className="px-2 py-1 text-sm hover:bg-gray-100 rounded cursor-pointer text-center"
            onClick={(e) => {
              e.stopPropagation();
              setObjetos((prev) =>
                prev.map((o) =>
                  elementosSeleccionados.includes(o.id)
                    ? { ...o, fontSize: tam }
                    : o
                )
              );
              setMostrarSelectorTamaño(false);
            }}

          >
            {tam}
          </div>
        ))}
      </div>
    )}
  </div>

  {/* Botón + */}
  <button
    className="px-2 py-1 hover:bg-gray-100 transition"
    onClick={() => {
        setObjetos((prev) =>
          prev.map((o) => {
            if (!elementosSeleccionados.includes(o.id)) return o;
            const nuevo = Math.min(120, (o.fontSize || 24) + 2);
            return { ...o, fontSize: nuevo };
          })
        );
      }}

  >
    +
  </button>
</div>
</div>


    {/* 🎨 Cambiar color */}
    <input
      type="color"
      value={objetoSeleccionado?.color || "#000000"}
      onChange={(e) => {
        const nuevoColor = e.target.value;
        setObjetos((prev) =>
          prev.map((o) =>
            elementosSeleccionados.includes(o.id)
              ? { ...o, color: nuevoColor }
              : o
          )
        );
      }}

    />

   {/* B */}
<button
  className={`px-2 py-1 rounded border text-sm font-bold transition ${
    objetoSeleccionado?.fontWeight === "bold" ? "bg-gray-200" : "hover:bg-gray-100"
  }`}
  onClick={() => {
  setObjetos((prev) =>
    prev.map((o) => {
      if (!elementosSeleccionados.includes(o.id)) return o;
      return {
        ...o,
        fontWeight: o.fontWeight === "bold" ? "normal" : "bold",
      };
    })
  );
}}

>
  B
</button>

{/* I */}
<button
  className={`px-2 py-1 rounded border text-sm italic transition ${
    objetoSeleccionado?.fontStyle === "italic" ? "bg-gray-200" : "hover:bg-gray-100"
  }`}
 onClick={() => {
  setObjetos((prev) =>
    prev.map((o) => {
      if (!elementosSeleccionados.includes(o.id)) return o;
      return {
        ...o,
        fontStyle: o.fontStyle === "italic" ? "normal" : "italic",
      };
    })
  );
}}

>
  I
</button>

{/* S */}
<button
  className={`px-2 py-1 rounded border text-sm transition ${
    objetoSeleccionado?.textDecoration === "underline" ? "bg-gray-200 underline" : "hover:bg-gray-100"
  }`}
 onClick={() => {
  setObjetos((prev) =>
    prev.map((o) => {
      if (!elementosSeleccionados.includes(o.id)) return o;
      return {
        ...o,
        textDecoration: o.textDecoration === "underline" ? "none" : "underline",
      };
    })
  );
}}

>
  S
</button>

    
  </div>
)}

    </div>
  );
}
