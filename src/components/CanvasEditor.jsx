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




// Componente para secciones con fondo de imagen
const SeccionConFondoImagen = ({ seccion, offsetY, alturaPx, onSelect }) => {
  const [fondoImage] = useImage(seccion.fondoImagen);
  
  return (
    <Group>
      {/* Fondo base (fallback si la imagen no carga) */}
      <Rect
        id={seccion.id}
        x={0}
        y={offsetY}
        width={800}
        height={alturaPx}
        fill={seccion.fondo?.startsWith('url(') ? "#f0f0f0" : (seccion.fondo || "#ffffff")}
        listening={true}
        onClick={onSelect}
      />
      
      {/* Imagen de fondo si está cargada */}
      {fondoImage && (
        <KonvaImage
          image={fondoImage}
          x={0}
          y={offsetY}
          width={800}
          height={alturaPx}
          listening={true}
          onClick={onSelect}
          // Ajustar la imagen para cubrir toda la sección
          scaleX={800 / fondoImage.width}
          scaleY={alturaPx / fondoImage.height}
        />
      )}
    </Group>
  );
};

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
      const botonOpcionesRef = useRef(null);


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
  if (onHistorialChange) {
    console.log("📤 Enviando historial al exterior:", historial.length);
    onHistorialChange(historial);
  }
}, [historial, onHistorialChange]);

useEffect(() => {
  if (onFuturosChange) {
    console.log("📤 Enviando futuros al exterior:", futuros.length);
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
      console.log("💾 Guardando en historial:", {
        objetosCount: objetos.length,
        seccionesCount: secciones.length,
        historialSize: nuevoHistorial.length
      });
      return nuevoHistorial;
    }
    return prev;
  });

  // Limpiar futuros cuando hay nuevos cambios
  setFuturos([]);
  
  // 💾 Guardado en Firebase con debounce
  const timeoutId = setTimeout(async () => {
    try {
      const ref = doc(db, "borradores", slug);
      await updateDoc(ref, {
        objetos,
        secciones,
        ultimaEdicion: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error guardando:", error);
    }
  }, 500);

  return () => clearTimeout(timeoutId);
}, [objetos, secciones, cargado, slug]); // 🔥 Incluir secciones en dependencias

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


// 🔄 Sistema completo de deshacer/rehacer (objetos + secciones)
useEffect(() => {
  const handleKeyDown = (e) => {
    // Deshacer (Ctrl + Z)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      console.log("🔄 Deshacer - Historial actual:", historial.length);
      
      if (historial.length > 1) {
        // Cerrar cualquier modo de edición activo
        setModoEdicion(false);
        setElementosSeleccionados([]);
        setMostrarPanelZ(false);
        
        setHistorial((prev) => {
          const nuevoHistorial = [...prev];
          const estadoActual = nuevoHistorial.pop(); // Remover estado actual
          const estadoAnterior = nuevoHistorial[nuevoHistorial.length - 1];
          
          console.log("🔄 Restaurando estado:", {
            objetosCount: estadoAnterior.objetos?.length || 0,
            seccionesCount: estadoAnterior.secciones?.length || 0
          });
          
          // 🔥 Marcar que viene del historial para evitar guardarlo de nuevo
          ignoreNextUpdateRef.current = true;
          
          // 🔥 Restaurar TANTO objetos como secciones
          setObjetos(estadoAnterior.objetos || []);
          setSecciones(estadoAnterior.secciones || []);
          
          // Guardar estado actual en futuros para rehacer
          setFuturos((f) => [estadoActual, ...f.slice(0, 19)]);
          
          console.log("✅ Deshecho aplicado completamente");
          return nuevoHistorial;
        });
      } else {
        console.log("❌ No hay más cambios para deshacer");
      }
    }

    // Rehacer (Ctrl + Y o Ctrl + Shift + Z)
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
      e.preventDefault();
      console.log("🔄 Rehacer - Futuros disponibles:", futuros.length);
      
      if (futuros.length > 0) {
        // Cerrar cualquier modo de edición activo
        setModoEdicion(false);
        setElementosSeleccionados([]);
        setMostrarPanelZ(false);
        
        const siguienteEstado = futuros[0];
        
        console.log("🔄 Restaurando estado futuro:", {
          objetosCount: siguienteEstado.objetos?.length || 0,
          seccionesCount: siguienteEstado.secciones?.length || 0
        });
        
        // 🔥 Marcar que viene del historial
        ignoreNextUpdateRef.current = true;
        
        // 🔥 Restaurar TANTO objetos como secciones
        setObjetos(siguienteEstado.objetos || []);
        setSecciones(siguienteEstado.secciones || []);
        
        // Mover de futuros a historial
        setFuturos((f) => f.slice(1));
        setHistorial((h) => [...h, siguienteEstado]);
        
        console.log("✅ Rehecho aplicado completamente");
      } else {
        console.log("❌ No hay cambios para rehacer");
      }
    }
  };

  // Escuchar tanto en document como en window para máxima compatibilidad
document.addEventListener("keydown", handleKeyDown);
window.addEventListener("keydown", handleKeyDown);

return () => {
  document.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keydown", handleKeyDown);
};
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



const iniciarControlAltura = (e, seccionId) => {
  e.evt.stopPropagation(); // ✅ CORRECTO
  const seccion = secciones.find(s => s.id === seccionId);
  if (!seccion) return;
  
  setControlandoAltura(seccionId);
  setAlturaInicial(seccion.altura);
  setPosicionInicialMouse(e.evt.clientY);
  
  // Prevenir selección de texto durante el drag
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'ns-resize';
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
  
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
  
  // 🔥 LIMPIAR THROTTLE
  if (window._alturaResizeThrottle) {
    window._alturaResizeThrottle = false;
  }
  
  const seccionId = controlandoAltura;
  setControlandoAltura(false);
  setAlturaInicial(0);
  setPosicionInicialMouse(0);
  
  // 🔥 GUARDAR CON DEBOUNCE para evitar múltiples saves
  if (window._saveAlturaTimeout) {
    clearTimeout(window._saveAlturaTimeout);
  }
  
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


// 🎨 Reemplazar fondo de sección con imagen seleccionada
const reemplazarFondoSeccion = async (elementoImagen) => {
  if (!elementoImagen || elementoImagen.tipo !== "imagen") {
    console.warn("❌ El elemento no es una imagen válida");
    return;
  }

  if (!elementoImagen.seccionId) {
    console.warn("❌ La imagen no tiene sección asignada");
    return;
  }

  const confirmar = confirm("¿Querés usar esta imagen como fondo de la sección?\n\nEsto reemplazará el fondo actual.");
  if (!confirmar) return;

  try {
    console.log("🎨 Convirtiendo imagen a fondo de sección:", elementoImagen.id);
    
    // 🔥 NO usar setState separados - hacer todo en un solo cambio
    // para que el historial capture ambos cambios juntos
    
    // Actualizar secciones
    const seccionesActualizadas = secciones.map(seccion => 
      seccion.id === elementoImagen.seccionId 
        ? { 
            ...seccion, 
            fondo: `url(${elementoImagen.src})`,
            fondoTipo: "imagen",
            fondoImagen: elementoImagen.src
          }
        : seccion
    );
    
    // Filtrar objetos (eliminar la imagen)
    const objetosFiltrados = objetos.filter(obj => obj.id !== elementoImagen.id);
    
    // 🔥 Actualizar ambos estados AL MISMO TIEMPO
    setSecciones(seccionesActualizadas);
    setObjetos(objetosFiltrados);
    
    // Limpiar selección
    setElementosSeleccionados([]);
    setMostrarPanelZ(false);

    console.log("✅ Fondo de sección actualizado con imagen");
    
  } catch (error) {
    console.error("❌ Error al reemplazar fondo de sección:", error);
    alert("Ocurrió un error al cambiar el fondo. Inténtalo de nuevo.");
  }
};

const seccionesOrdenadas = [...secciones].sort((a, b) => a.orden - b.orden);
const escalaActiva = zoom === 1 ? scale : zoom;
const escalaVisual = zoom === 1 ? scale : (zoom * 1.15);
const altoCanvasDinamico = seccionesOrdenadas.reduce((acc, s) => acc + s.altura, 0) || 800;


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
    const botonX = elementoX + anchoElemento - 12; // -12px (mitad del botón)
    const botonY = elementoY - 12; // -12px (mitad del botón)
    
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


// 🔧 Funciones públicas para deshacer/rehacer (llamadas desde botones externos)
const ejecutarDeshacer = useCallback(() => {
  console.log("🔄 ejecutarDeshacer llamado desde botón externo");
  console.log("📊 Estado actual:", { historial: historial.length, futuros: futuros.length });
  
  if (historial.length > 1) {
    // Cerrar cualquier modo de edición activo
    setModoEdicion(false);
    setElementosSeleccionados([]);
    setMostrarPanelZ(false);
    
    setHistorial((prev) => {
      const nuevoHistorial = [...prev];
      const estadoActual = nuevoHistorial.pop();
      const estadoAnterior = nuevoHistorial[nuevoHistorial.length - 1];
      
      console.log("🔄 Restaurando estado:", {
        objetosCount: estadoAnterior.objetos?.length || 0,
        seccionesCount: estadoAnterior.secciones?.length || 0
      });
      
      ignoreNextUpdateRef.current = true;
      setObjetos(estadoAnterior.objetos || []);
      setSecciones(estadoAnterior.secciones || []);
      
      setFuturos((f) => [estadoActual, ...f.slice(0, 19)]);
      
      console.log("✅ Deshecho aplicado desde botón externo");
      return nuevoHistorial;
    });
  } else {
    console.log("❌ No hay más cambios para deshacer");
  }
}, [historial, futuros]);

const ejecutarRehacer = useCallback(() => {
  console.log("🔄 ejecutarRehacer llamado desde botón externo");
  console.log("📊 Estado actual:", { historial: historial.length, futuros: futuros.length });
  
  if (futuros.length > 0) {
    setModoEdicion(false);
    setElementosSeleccionados([]);
    setMostrarPanelZ(false);
    
    const siguienteEstado = futuros[0];
    
    console.log("🔄 Restaurando estado futuro:", {
      objetosCount: siguienteEstado.objetos?.length || 0,
      seccionesCount: siguienteEstado.secciones?.length || 0
    });
    
    ignoreNextUpdateRef.current = true;
    setObjetos(siguienteEstado.objetos || []);
    setSecciones(siguienteEstado.secciones || []);
    
    setFuturos((f) => f.slice(1));
    setHistorial((h) => [...h, siguienteEstado]);
    
    console.log("✅ Rehecho aplicado desde botón externo");
  } else {
    console.log("❌ No hay cambios para rehacer");
  }
}, [historial, futuros]);

// 🌐 Exponer funciones al window para acceso desde botones externos
useEffect(() => {
  window.canvasEditor = {
    deshacer: ejecutarDeshacer,
    rehacer: ejecutarRehacer,
    getHistorial: () => ({ historial: historial.length, futuros: futuros.length })
  };
  
  console.log("🌐 Funciones de historial expuestas al window");
  
  return () => {
    if (window.canvasEditor) {
      delete window.canvasEditor;
    }
  };
}, [ejecutarDeshacer, ejecutarRehacer, historial.length, futuros.length]);



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
  // Fondo de sección - puede ser color o imagen
  seccion.fondoTipo === "imagen" ? (
    <SeccionConFondoImagen
      key={`seccion-img-${seccion.id}`}
      seccion={seccion}
      offsetY={offsetY}
      alturaPx={alturaPx}
      onSelect={() => setSeccionActivaId(seccion.id)}
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
    const stage = stageRef.current;
    if (stage) {
      stage.container().style.cursor = 'ns-resize';
    }
  }}
  onMouseLeave={() => {
    const stage = stageRef.current;
    if (stage && !controlandoAltura) {
      stage.container().style.cursor = 'default';
    }
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
      if (seccion.id !== controlandoAltura) return null;
      
      const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
      
      return (
        <Rect
          key={`highlight-${seccion.id}`}
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
      );
    })}
  </Group>
)}

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
      
      onDragMovePersonalizado={(pos, elementId) => {
  mostrarGuias(pos, elementId);
  
  // 🔥 ACTUALIZAR BOTÓN EN TIEMPO REAL si es el elemento seleccionado
  if (elementosSeleccionados.includes(elementId)) {
    requestAnimationFrame(() => {
      if (typeof actualizarPosicionBotonOpciones === 'function') {
        actualizarPosicionBotonOpciones();
      }
    });
  }
}}
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



{/* ✅ Botón de opciones PEGADO a la esquina superior derecha del elemento */}
{elementosSeleccionados.length === 1 && (() => {
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



{mostrarPanelZ && (() => {
  const elementoSeleccionado = objetos.find(o => o.id === elementosSeleccionados[0]);
  const nodeRef = elementRefs.current[elementosSeleccionados[0]];
  
  if (!nodeRef || !elementoSeleccionado || !botonOpcionesRef.current) return null;
  
  // 🔥 OBTENER POSICIÓN EXACTA DEL BOTÓN (no del elemento)
  const botonRect = botonOpcionesRef.current.getBoundingClientRect();
  
  // 🎯 POSICIÓN DEL MENÚ: Desde el botón hacia derecha y abajo
  const menuX = botonRect.right + 8; // 8px a la derecha del botón
  const menuY = botonRect.top; // Alineado con el top del botón
  
  // 🔥 VALIDACIÓN: Ajustar si se sale de pantalla
  const menuWidth = 256; // Ancho del menú (w-64 = 256px)
  const menuHeight = 300; // Altura estimada del menú
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Ajustar posición X si se sale por la derecha
  let finalX = menuX;
  if (menuX + menuWidth > viewportWidth) {
    finalX = botonRect.left - menuWidth - 8; // A la izquierda del botón
  }
  
  // Ajustar posición Y si se sale por abajo
  let finalY = menuY;
  if (menuY + menuHeight > viewportHeight) {
    finalY = Math.max(8, botonRect.bottom - menuHeight); // Arriba del botón o mínimo 8px del top
  }
  
  return (
    <div
      className="fixed z-50 bg-white border rounded-lg shadow-xl p-3 text-sm space-y-1 menu-z-index w-64"
      style={{
        left: `${finalX}px`,
        top: `${finalY}px`,
        // 🎯 ESTILOS MEJORADOS PARA MEJOR APARIENCIA
        borderColor: "#773dbe",
        borderWidth: "1px",
        maxHeight: "400px",
        overflowY: "auto",
        // 🔥 ANIMACIÓN SUAVE DE APARICIÓN
        animation: "fadeInScale 0.15s ease-out",
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

    {/* Reemplazar fondo (solo para imágenes) */}
{elementoSeleccionado?.tipo === "imagen" && (
  <button
    onClick={() => {
      reemplazarFondoSeccion(elementoSeleccionado);
      setMostrarPanelZ(false);
    }}
    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
  >
    <div className="w-4 h-4 bg-gradient-to-br from-blue-400 to-purple-500 rounded"></div>
    Usar como fondo
  </button>
)}

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
  );
})()}  





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


    {/* 🔥 AGREGAR ESTAS LÍNEAS AQUÍ */}
    <style jsx>{`
      @keyframes fadeInScale {
        from {
          opacity: 0;
          transform: scale(0.95) translateY(-5px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
    `}</style>

  </div>
);

}
