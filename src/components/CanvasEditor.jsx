// components/CanvasEditor.jsx
import { useEffect, useState, useRef } from "react";
import { Stage, Layer, Line, Rect, Text, Transformer, Image as KonvaImage, Group , Circle} from "react-konva";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import ElementoCanvas from "./ElementoCanvas";
import ReactDOMServer from "react-dom/server";
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


export default function CanvasEditor({ slug, zoom = 1, onHistorialChange, onFuturosChange }) {
  const [objetos, setObjetos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [futuros, setFuturos] = useState([]);
   const [elementosSeleccionados, setElementosSeleccionados] = useState([]);
    const [posBarra, setPosBarra] = useState({ x: 0, y: 0 });
    const [modoEdicion, setModoEdicion] = useState(false);
    const [cargado, setCargado] = useState(false);
    const stageRef = useRef(null);
    const dragStartPos = useRef(null);
    const hasDragged = useRef(false);
    const [seleccionActiva, setSeleccionActiva] = useState(false);
    const [inicioSeleccion, setInicioSeleccion] = useState(null);
    const [areaSeleccion, setAreaSeleccion] = useState(null);
    const [elementosPreSeleccionados, setElementosPreSeleccionados] = useState([]);
    const guiaLayerRef = useRef(null);
    const [hoverId, setHoverId] = useState(null);
    const [guiaLineas, setGuiaLineas] = useState([]);
    const [scale, setScale] = useState(1);
    const transformerRef = useRef();
    const [mostrarSubmenuCapa, setMostrarSubmenuCapa] = useState(false);
    const [elementoCopiado, setElementoCopiado] = useState(null);
    const elementRefs = useRef({});
    const contenedorRef = useRef(null);
    const ignoreNextUpdateRef = useRef(false);
    const [altoCanvas, setAltoCanvas] = useState(1400);
    const [anchoStage, setAnchoStage] = useState(800);
    const [mostrarSelectorFuente, setMostrarSelectorFuente] = useState(false);
    const [posMiniBoton, setPosMiniBoton] = useState({ x: 0, y: 0 });
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
    const nueva = e.detail;
    setObjetos((prev) => [...prev, nueva]);
  };

  window.addEventListener("insertar-imagen", handler);
  return () => window.removeEventListener("insertar-imagen", handler);
}, []);

// ✅ Insertar íconos al canvas
useEffect(() => {
  const handler = (e) => {
    const nuevo = e.detail;
    setObjetos((prev) => [...prev, nuevo]);
    setElementosSeleccionados([nuevo.id]); 
  };

  window.addEventListener("insertar-icono", handler);
  return () => window.removeEventListener("insertar-icono", handler);
}, []);



useEffect(() => {
  const handler = () => {
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
      scaleY: 1
    };

    nuevoTextoRef.current = nuevo.id; // 👈 Guardamos el id que queremos editar
    setObjetos((prev) => [...prev, nuevo]);
  };

  window.addEventListener("agregar-cuadro-texto", handler);
  return () => window.removeEventListener("agregar-cuadro-texto", handler);
}, []);

useEffect(() => {
  if (!nuevoTextoRef.current) return;

  const obj = objetos.find((o) => o.id === nuevoTextoRef.current);
  if (obj) {
    setElementosSeleccionados([obj.id]);
    iniciarEdicionInline(obj, true);
    nuevoTextoRef.current = null; // 🧼 Limpiamos para evitar repetir
  }
}, [objetos]);


useEffect(() => {
  if (!elementosSeleccionados[0] || !stageRef.current || !elementRefs.current[elementosSeleccionados[0]]) return;

  const stage = stageRef.current;
  const node = elementRefs.current[elementosSeleccionados[0]];
  const escala = zoom === 1 ? scale : zoom;

  const box = node.getClientRect({ relativeTo: stage });

  const containerRect = stage.container().getBoundingClientRect();

  setPosMiniBoton({
  x: containerRect.left + (box.x + box.width) * escala - 20, // esquina derecha - un pequeño margen
  y: containerRect.top + box.y * escala - 50,                // un poco más arriba del objeto
});

}, [elementosSeleccionados[0], zoom, scale, objetos]);



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
  const actualizarAlto = () => {
    setAltoCanvas(window.innerHeight);
  };

  window.addEventListener("resize", actualizarAlto);
  actualizarAlto(); // valor inicial

  return () => window.removeEventListener("resize", actualizarAlto);
}, []);



useEffect(() => {
  const nodes = elementosSeleccionados
    .map((id) => elementRefs.current[id])
    .filter(Boolean);

  if (nodes.length > 0 && transformerRef.current) {
    transformerRef.current.nodes(nodes);
    transformerRef.current.getLayer().batchDraw();
  }
}, [elementosSeleccionados]);





  useEffect(() => {
  if (!elementosSeleccionados[0] || !contenedorRef.current) return;

  const contenedorRect = contenedorRef.current.getBoundingClientRect();

  setPosBarra({
    x: contenedorRect.left + contenedorRef.current.offsetWidth / 2 - 200, // 200px = mitad del ancho estimado de la barra
    y: contenedorRect.top + 10, // 10px de margen superior
  });
}, [elementosSeleccionados[0]]);

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
  const cargar = async () => {
    const ref = doc(db, "borradores", slug);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      setObjetos(data.objetos || []);
    }
    setCargado(true); // ✅ activamos solo cuando terminó de cargar
  };
  cargar();
    }, [slug]);


useEffect(() => {
  if (!cargado) return;

  if (ignoreNextUpdateRef.current) {
    ignoreNextUpdateRef.current = false;
    return;
  }

  setHistorial((prev) => {
    const ultima = prev[prev.length - 1];
    if (!ultima || JSON.stringify(ultima) !== JSON.stringify(objetos)) {
      return [...prev, objetos];
    }
    return prev;
  });

  setFuturos([]);
  
  const guardar = async () => {
    const ref = doc(db, "borradores", slug);
    await updateDoc(ref, {
      objetos,
      ultimaEdicion: serverTimestamp(),
    });
  };

  guardar();
}, [objetos, cargado]);






 const actualizarObjeto = (index, nuevo) => {
  const nuevos = [...objetos];
  nuevos[index] = { ...nuevos[index], ...nuevo };
  setObjetos(nuevos);
};

useEffect(() => {
  const handleKeyDown = (e) => {
    // solo elimina si hay un elemento seleccionado
    if ((e.key === "Delete" || e.key === "Backspace") && elementosSeleccionados.length > 0) {
  e.preventDefault();
  setObjetos((prev) => prev.filter((o) => !elementosSeleccionados.includes(o.id)));
  setElementosSeleccionados([]); // vaciamos la selección
}
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
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

  area.style.top = `${container.getBoundingClientRect().top + box.y * escala}px`;
  area.style.top = `${container.getBoundingClientRect().top + (box.y - box.height / 2) * escala}px`;
  area.style.left = `${container.getBoundingClientRect().left + box.x * escala}px`;
  area.style.width = `${box.width}px`;
  area.style.height = "auto";
  area.style.fontSize = `${(obj.fontSize || 24) * escala}px`;
  area.style.fontFamily = fontFamily;
  area.style.color = obj.color || "#000";
  area.style.border = "none";
  area.style.padding = "4px";
  area.style.margin = "0";
  area.style.background = "transparent";
  area.style.outline = "none";
  area.style.resize = "none";
  area.style.overflow = "hidden";
  area.style.transform = `rotate(${obj.rotation || 0}deg)`;
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
      x: textNode.x(), // ✅ guardar posición actual
      y: textNode.y(), // ✅ guardar posición actual
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


useEffect(() => {
  const handler = (e) => {
    const { x, y } = e.detail;
    setPosMiniBoton({ x, y });
    setMostrarPanelZ(true);
    setMostrarSubmenuCapa(false);
  };

  window.addEventListener("abrir-menu-contextual", handler);
  return () => window.removeEventListener("abrir-menu-contextual", handler);
}, []);


useEffect(() => {
  const handleKeyDown = (e) => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (!elementosSeleccionados[0]) return;

    // Copiar (Ctrl + C)
    if (ctrl && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copiarElemento();
    }

    // Pegar (Ctrl + V)
    if (ctrl && e.key.toLowerCase() === "v") {
      e.preventDefault();
      pegarElemento();
    }

    // Duplicar (Ctrl + D)
    if (ctrl && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicarElemento();
    }

    // Eliminar (Delete o Backspace)
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      eliminarElemento();
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [elementosSeleccionados[0]]);



useEffect(() => {
  const handleClickOutside = (e) => {
    const esMenuZ = e.target.closest(".menu-z-index");
    const esBotonMini = e.target.closest(".boton-mini-z");

    // Si no se hizo clic ni en el menú ni en el botón ☰ → cerrar
    if (!esMenuZ && !esBotonMini) {
      setMostrarPanelZ(false);
      setMostrarSubmenuCapa(false);
    }
  };

  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, []);



const fuentesDisponibles = [...fuentesLocales, ...fuentesGoogle];
const objetoSeleccionado = objetos.find((o) => o.id === elementosSeleccionados[0]);
console.log("zoom en CanvasEditor:", zoom);

const hoverTransformerRef = useRef();

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
const eliminarElemento = () => {
  if (elementosSeleccionados.length === 0) return;

  setObjetos((prev) =>
    prev.filter((o) => !elementosSeleccionados.includes(o.id))
  );
  setElementosSeleccionados([]);
  setMostrarPanelZ(false);
};





  return (
    <div className="flex justify-center">
   
   <div
  ref={contenedorRef}
  className="w-full"
  style={{
    overflow: "auto",
    boxSizing: "border-box",
    backgroundColor: "#f5f5f5",
    display: "flex",
    justifyContent: "center",
  }}
>
    
  <div
  style={{
    width: "800px",
    transform: `scale(${zoom === 1 ? scale : zoom})`,
    transformOrigin: "top center",
  }}
>
  <Stage
    ref={stageRef}
    width={800}
    height={1400}
    scaleX={1}
    scaleY={1}
    style={{
      background: "white",
      borderRadius: 16,
      overflow: "hidden",
    }}
    
    onMouseDown={(e) => {
        const stage = e.target.getStage();
        const esStage = e.target === stage;
        dragStartPos.current = e.target.getStage().getPointerPosition();
        hasDragged.current = false;
                // Verificamos si se hizo clic en un área "vacía" (no un nodo seleccionado)
                const noHizoClickEnElemento = !Object.values(elementRefs.current).some((node) => {
                  return node === e.target || node.hasName?.(e.target.name?.());
                });

                if (esStage && noHizoClickEnElemento) {
                  setElementosSeleccionados([]);
                  setModoEdicion(false);
                  setMostrarPanelZ(false);
                  setMostrarSubmenuCapa(false);

                  const pos = stage.getPointerPosition();
                  setInicioSeleccion({ x: pos.x, y: pos.y });
                  setAreaSeleccion({ x: pos.x, y: pos.y, width: 0, height: 0 });
                  setSeleccionActiva(true);
                }

      }}

              onMouseMove={(e) => {
                     if (!seleccionActiva || !areaSeleccion) return;

                    const pos = e.target.getStage().getPointerPosition();
                    const area = {
                      x: Math.min(inicioSeleccion.x, pos.x),
                      y: Math.min(inicioSeleccion.y, pos.y),
                      width: Math.abs(pos.x - inicioSeleccion.x),
                      height: Math.abs(pos.y - inicioSeleccion.y),
                    };


                    setAreaSeleccion(area);
                    // Detectar qué elementos están tocados
                    const ids = objetos.filter((obj) => {
                      const node = elementRefs.current[obj.id];
                      if (!node) return false;
                      const box = node.getClientRect();

                      return (
                        box.x + box.width >= area.x &&
                        box.x <= area.x + area.width &&
                        box.y + box.height >= area.y &&
                        box.y <= area.y + area.height
                      );
                    }).map((obj) => obj.id);

                    setElementosPreSeleccionados(ids);
                }}

        onMouseUp={() => {
          if (!seleccionActiva || !areaSeleccion) return;

          const nuevaSeleccion = objetos.filter((obj) => {
            const node = elementRefs.current[obj.id];
            if (!node) return false;
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
        {objetos
    .map((obj, i) => {
    if (modoEdicion && elementosSeleccionados[0] === obj.id) return null;

    return (
      <ElementoCanvas
        key={obj.id}
        obj={obj}
        anchoCanvas={800}
        isSelected={elementosSeleccionados.includes(obj.id)}
        preSeleccionado={elementosPreSeleccionados.includes(obj.id)}
        onHover={setHoverId}
        onSelect={async (id, obj, e) => {
            e.evt.cancelBubble = true;
            const esShift = e?.evt?.shiftKey;

             if (modoEdicion) {
                await finalizarEdicionInline(); // ✅ esperamos a que se guarde ANTES de continuar
              }

            setElementosSeleccionados((prev) => {
              if (esShift) {
                // Si ya está seleccionado, lo quita
                if (prev.includes(id)) return prev.filter((x) => x !== id);
                // Si no, lo agrega
                return [...prev, id];
              } else {
                // Selección única
                return [id];
              }
            });

            if (!esShift && obj?.tipo === "texto") {
            // Solo iniciamos edición si no hay selección múltiple
            iniciarEdicionInline(obj);
          }

          }}

        onChange={(id, nuevo) => {
          const i = objetos.findIndex((o) => o.id === id);
          if (i !== -1) actualizarObjeto(i, nuevo);
        }}
        registerRef={(id, node) => {
          elementRefs.current[id] = node;
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
  <Transformer
    ref={transformerRef}
    nodes={elementosSeleccionados
      .map((id) => elementRefs.current[id])
      .filter(Boolean)}
    rotationEnabled={false}
    enabledAnchors={[
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "middle-left",
      "middle-right",
    ]}
    boundBoxFunc={(oldBox, newBox) => {
      if (newBox.width < 30 || newBox.height < 20) return oldBox;
      return newBox;
    }}
    borderStroke="#773dbe"
    borderStrokeWidth={1}
    anchorFill="#ffffff"
    anchorStroke="#773dbe"
    anchorStrokeWidth={1}
    anchorSize={6}
  />
)}

{hoverId &&
  !elementosSeleccionados.includes(hoverId) &&
  elementRefs.current[hoverId] && (
    <Transformer
      nodes={[elementRefs.current[hoverId]]}
      rotationEnabled={false}
      ref={hoverTransformerRef}
      borderStroke="#aaa"
      borderStrokeWidth={1}
      anchorSize={4}
      anchorFill="#eee"
      anchorStroke="#aaa"
    />
)}




{/* 
        {elementosSeleccionados[0] && elementRefs.current[elementosSeleccionados[0]] && (
  <Group
    x={elementRefs.current[elementosSeleccionados[0]].x()}
    y={elementRefs.current[elementosSeleccionados[0]].y() - 40} // 🔼 40px arriba del objeto
    draggable
   onDragMove={(e) => {
  const node = elementRefs.current[elementosSeleccionados[0]];
  if (node) {
    const dx = e.target.x() - node.x();
    const dy = e.target.y() - node.y();
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    const i = objetos.findIndex((o) => o.id === elementosSeleccionados[0]);
    if (i !== -1) {
      actualizarObjeto(i, { rotation: angle });
    }
  }
}}

    onDragEnd={(e) => {
  const node = elementRefs.current[elementosSeleccionados[0]];
  if (node) {
    const x = node.x();
    const y = node.y();
    e.target.position({ x, y: y - 40 });
  }
}}

  >
   <>
  {/* Fondo violeta circular opcional 
  <Circle
    radius={12}
    fill="#ffffff"
    stroke="#cccccc"
    strokeWidth={1}
    shadowBlur={2}
    shadowOpacity={0.15}
  />
  
  {/* Ícono SVG cargado como imagen 
  <KonvaImage
    image={icono}
    width={12}
    height={12}
    offsetX={6}
    offsetY={6}
  />
</>

  </Group>
)}*/}

      </Layer>

      <Layer ref={guiaLayerRef}>
  {guiaLineas.map((linea, i) => (
    <Line
      key={i}
      points={linea.points}
      stroke="#773dbe"
      strokeWidth={1}
      dash={[4, 4]}
    />
  ))}
</Layer>



    </Stage>
  </div>
</div>




{/* ✅ Botón de orden de capas (para cualquier tipo de objeto) */}
{elementosSeleccionados.length === 1 && (
  <div
    className="fixed z-50 bg-white border rounded shadow p-1 text-sm boton-mini-z"
    style={{
      top: posMiniBoton.y,
      left: posMiniBoton.x,
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
      top: posMiniBoton.y + 30,
      left: posMiniBoton.x + 20,
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
              top: posBarra.y,
              left: posBarra.x,
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
