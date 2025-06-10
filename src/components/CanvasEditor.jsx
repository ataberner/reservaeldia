// components/CanvasEditor.jsx
import { useEffect, useState, useRef } from "react";
import { Stage, Layer, Line, Rect, Text, Transformer, Image as KonvaImage, Group , Circle} from "react-konva";
import { doc, getDoc, updateDoc, serverTimestamp, addDoc, collection } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import ElementoCanvas from "./ElementoCanvas";
import ReactDOMServer from "react-dom/server";
import { convertirAlturaVH, calcularOffsetY } from "../utils/layout";
import { crearSeccion } from "@/models/estructuraInicial";
import usePlantillasDeSeccion from "@/hooks/usePlantillasDeSeccion";
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
    const [posBarra, setPosBarra] = useState({ x: 0, y: 0 });
    const [modoEdicion, setModoEdicion] = useState(false);
    const [cargado, setCargado] = useState(false);
    const stageRef = useRef(null);
    const dragStartPos = useRef(null);
    const hasDragged = useRef(false);
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
    const { refrescar: refrescarPlantillasDeSeccion } = usePlantillasDeSeccion();
    const transformerRef = useRef();
    const [mostrarSubmenuCapa, setMostrarSubmenuCapa] = useState(false);
    const [elementoCopiado, setElementoCopiado] = useState(null);
    const elementRefs = useRef({});
    const contenedorRef = useRef(null);
    const ignoreNextUpdateRef = useRef(false);
    
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
    handleCrearSeccion(e.detail);
  };

  window.addEventListener("crear-seccion", handler);
  return () => window.removeEventListener("crear-seccion", handler);
}, []);



useEffect(() => {
  const handler = (e) => {
    const nuevo = e.detail;
    console.log("🧭 insertando elemento:", nuevo);
    console.log("📌 Sección activa:", seccionActivaId);

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



const actualizarFondoSeccion = (id, nuevoFondo) => {
  setSecciones((prev) =>
    prev.map((s) => s.id === id ? { ...s, fondo: nuevoFondo } : s)
  );
};



const handleGuardarComoPlantilla = async (seccionId) => {
  const seccion = secciones.find((s) => s.id === seccionId);
  if (!seccion) return;

  console.log("Todos los objetos actuales:", objetos);
console.log("Buscando objetos con seccionId:", seccionId);


  const objetosDeEsaSeccion = objetos.filter((obj) => obj.seccionId === seccionId);

  console.log("Objetos de esa sección:", objetosDeEsaSeccion);


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

  console.log("Voy a guardar plantilla con datos:", plantilla);
  console.log("Usuario actual:", user.uid);

  const ref = collection(db, "plantillas_secciones");
  await addDoc(ref, plantilla);
await refrescarPlantillasDeSeccion();


  alert("✅ Plantilla guardada correctamente");
};




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



const determinarNuevaSeccion = (yRelativaConOffset, seccionActualId) => {
  // yRelativaConOffset viene de ElementoCanvas con el offset ya aplicado
  // Necesitamos convertirla a Y absoluta real del canvas
  
  const seccionActual = seccionesOrdenadas.find(s => s.id === seccionActualId);
  if (!seccionActual) return { nuevaSeccion: null, coordenadasAjustadas: {} };
  
  // yRelativaConOffset ya es la Y real en el canvas (viene con offset aplicado)
  const yAbsolutaReal = yRelativaConOffset;
  
  console.log("🧪 Debug determinarNuevaSeccion:", {
    yRelativaConOffset,
    yAbsolutaReal,
    seccionActualId,
    seccionesOrdenadas: seccionesOrdenadas.map(s => ({ id: s.id, altura: s.altura }))
  });
  
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
      console.log(`✅ Nueva sección encontrada: ${seccion.id}, nuevaY: ${nuevaY}`);
      
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
    console.log("📍 Fuera arriba - moviendo a primera sección");
    return { 
      nuevaSeccion: seccionesOrdenadas[0].id, 
      coordenadasAjustadas: { y: 0 } 
    };
  } else {
    // Abajo de todo - última sección
    console.log("📍 Fuera abajo - moviendo a última sección");
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



const seccionesOrdenadas = [...secciones].sort((a, b) => a.orden - b.orden);


const escalaActiva = zoom === 1 ? scale : zoom;
const escalaVisual = zoom === 1 ? scale : zoom;

const altoCanvasDinamico = seccionesOrdenadas.reduce((acc, s) => acc + s.altura, 0) || 800;


  return (
       <div className="flex justify-center">
   
   <div
  ref={contenedorRef}
   style={{
    minHeight: "100vh",
    width: "100%",
    boxSizing: "border-box",
    backgroundColor: "#f5f5f5",
    display: "flex",
    justifyContent: "center",
  }}
>
    
  <div
  style={{
    transform: `scale(${escalaVisual})`,
    transformOrigin: 'top center',
    width: "800px",
  }}
>
  
 <div style={{ width: 800 }}>
  
<div
  className="relative"
  style={{
    width: "800px",

  }}
>
  {/* 💾 Botones flotantes */}
  {secciones.map((seccion, index) => {
    const offsetY = calcularOffsetY(secciones, index, altoCanvas);

    
    return (
      <div
        key={`btn-${seccion.id}`}
        className="absolute"
        style={{
          top: offsetY * zoom + 8,
          right: 12,
          zIndex: 20
        }}
      >
        <button
          className="text-xs bg-white border border-gray-300 px-2 py-1 rounded hover:bg-gray-100 shadow"
          onClick={() => handleGuardarComoPlantilla(seccion.id)}
        >
          💾 Guardar como plantilla
        </button>
      </div>
    );
  })}

  

<Stage
  ref={stageRef}
  width={800}
  height={altoCanvasDinamico}
  style={{
    background: "white",
    overflow: "hidden",
  }}
    
            onMouseDown={(e) => {
            
            
            const stage = e.target.getStage();
            const esStage = e.target === stage;
            dragStartPos.current = stage.getPointerPosition();
            hasDragged.current = false;


            // ✅ NUEVA LÓGICA: Permitir selección desde Stage O desde Rect de sección
            const esSeccion = e.target.constructor.name === "Rect" && 
                              secciones.some(s => e.target.attrs?.id === s.id || true); // temporalmente true para testing

            const noHizoClickEnElemento = !Object.values(elementRefs.current).some((node) => {
              return node === e.target || node.hasName?.(e.target.name?.());
            });

            
            // ✅ Activar selección si es Stage O si es una sección vacía
            if ((esStage || esSeccion) && noHizoClickEnElemento) {
              setElementosSeleccionados([]);
              setModoEdicion(false);
              setMostrarPanelZ(false);
              setMostrarSubmenuCapa(false);

              // ✅ Solo deseleccionar sección si hicimos click en el Stage, no en una sección
              if (esStage) {
                setSeccionActivaId(null);
              }

              const pos = stage.getPointerPosition();
              setInicioSeleccion({ x: pos.x, y: pos.y });
              setAreaSeleccion({ x: pos.x, y: pos.y, width: 0, height: 0 });
              setSeleccionActiva(true);
              
              
            } else {
              
            }
          }}                  



                   onMouseMove={(e) => {
                      if (!seleccionActiva || !areaSeleccion) {
                        if (!seleccionActiva) console.log("⏸️ seleccionActiva es false");
                        if (!areaSeleccion) console.log("⏸️ areaSeleccion es null");
                        return;
                      }

                      console.log("🔄 MouseMove durante selección");

                    const pos = e.target.getStage().getPointerPosition();
                    const area = {
                      x: Math.min(inicioSeleccion.x, pos.x),
                      y: Math.min(inicioSeleccion.y, pos.y),
                      width: Math.abs(pos.x - inicioSeleccion.x),
                      height: Math.abs(pos.y - inicioSeleccion.y),
                    };

                    console.log("📏 Área calculada:", area);
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
     
     {seccionesOrdenadas.map((seccion, index) => {
  const alturaPx = seccion.altura;
  const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
  const esActiva = seccion.id === seccionActivaId;
  const estaAnimando = animandoSeccion === seccion.id;

  return (
    <> 
      {/* Fondo principal de la sección */}
      <Rect
        key={seccion.id} // ✅ El key va aquí ahora
        x={0}
        y={offsetY}
        width={800}
        height={alturaPx}
        fill={seccion.fondo || "#ffffff"}
        stroke="transparent"
        strokeWidth={0}
        listening={true}
        onClick={() => {
    setAnimandoSeccion(seccion.id);      // ← Inicia animación
    setSeccionActivaId(seccion.id);      // ← Selecciona la sección
    setTimeout(() => setAnimandoSeccion(null), 300); // ← Termina animación después de 300ms
  }}
      />
      
      {/* Border y efectos de selección */}
      {esActiva ? (
        <>
          {/* Borde principal con gradiente y sombra */}
            <Rect
              x={8}
              y={offsetY + 8}
              width={784}
              height={alturaPx - 16}
              fill="transparent"
              stroke="#773dbe"
              strokeWidth={estaAnimando ? 4 : 3} // ← Borde más grueso cuando anima
              cornerRadius={8}
              shadowColor="rgba(119, 61, 190, 0.25)"
              shadowBlur={estaAnimando ? 16 : 12} // ← Sombra más intensa cuando anima
              shadowOffset={{ x: 0, y: estaAnimando ? 4 : 3 }} // ← Sombra más profunda
              listening={false}
            />
          
          {/* Borde interior sutil */}
          <Rect
            x={12}
            y={offsetY + 12}
            width={776}
            height={alturaPx - 24}
            fill="transparent"
            stroke="rgba(119, 61, 190, 0.3)"
            strokeWidth={1}
            cornerRadius={6}
            listening={false}
          />
          
          {/* Overlay de selección con opacity muy baja */}
          <Rect
            x={8}
            y={offsetY + 8}
            width={784}
            height={alturaPx - 16}
            fill={estaAnimando ? "rgba(119, 61, 190, 0.08)" : "rgba(119, 61, 190, 0.03)"} // ← Más opaco cuando anima
            cornerRadius={8}
            listening={false}
          />
          
          {/* Indicadores de esquina modernos */}
          <Rect
            x={16}
            y={offsetY + 16}
            width={8}
            height={8}
            fill="#773dbe"
            cornerRadius={1}
            listening={false}
          />
          <Rect
            x={776}
            y={offsetY + 16}
            width={8}
            height={8}
            fill="#773dbe"
            cornerRadius={1}
            listening={false}
          />
          <Rect
            x={16}
            y={offsetY + alturaPx - 24}
            width={8}
            height={8}
            fill="#773dbe"
            cornerRadius={1}
            listening={false}
          />
          <Rect
            x={776}
            y={offsetY + alturaPx - 24}
            width={8}
            height={8}
            fill="#773dbe"
            cornerRadius={1}
            listening={false}
          />
          
          {/* Badge de sección activa con animación */}
          <Rect
            x={24}
            y={offsetY + 24}
            width={120}
            height={18}
            fill="#773dbe"
            cornerRadius={9}
            shadowColor="rgba(119, 61, 190, 0.4)"
            shadowBlur={6}
            shadowOffset={{ x: 0, y: 2 }}
            listening={false}
          />
          <Text
            x={84}
            y={offsetY + 29}
            text="SECCIÓN ACTIVA"
            fontSize={9}
            fontFamily="Arial, sans-serif"
            fontWeight="bold"
            fill="white"
            align="center"
            listening={false}
          />
          
          {/* Líneas de guía sutiles en los bordes */}
          <Line
            points={[8, offsetY + 8, 8, offsetY + alturaPx - 8]}
            stroke="rgba(119, 61, 190, 0.2)"
            strokeWidth={1}
            dash={[4, 4]}
            listening={false}
          />
          <Line
            points={[792, offsetY + 8, 792, offsetY + alturaPx - 8]}
            stroke="rgba(119, 61, 190, 0.2)"
            strokeWidth={1}
            dash={[4, 4]}
            listening={false}
          />
        </>
      ) : (
        /* Borde sutil para secciones no activas */
        <Rect
          x={0}
          y={offsetY}
          width={800}
          height={alturaPx}
          fill="transparent"
          stroke="#e5e7eb"
          strokeWidth={1}
          dash={[8, 4]}
          listening={false}
        />
      )}
    </>
  );
})}



        {objetos
    .map((obj, i) => {
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
  const objOriginal = objetos.find((o) => o.id === id);
  if (!objOriginal) return;

  // 🔥 SOLO si finalizó el drag, verificar cambio de sección
  if (nuevo.finalizoDrag) {
    const { nuevaSeccion, coordenadasAjustadas } = determinarNuevaSeccion(nuevo.y, objOriginal.seccionId);
    if (nuevaSeccion) {
      console.log(`🔄 Elemento ${id} cambió de sección ${objOriginal.seccionId} → ${nuevaSeccion}`);
      nuevo = { ...nuevo, ...coordenadasAjustadas, seccionId: nuevaSeccion };
    }
    // Remover la flag
    delete nuevo.finalizoDrag;
  }

  // Usar la sección actual (puede haber cambiado arriba)
// Usar la sección actual (puede haber cambiado arriba)
const seccionId = nuevo.seccionId || objOriginal.seccionId;
const seccion = seccionesOrdenadas.find((s) => s.id === seccionId);
if (!seccion) return;

const i = objetos.findIndex((o) => o.id === id);
if (i !== -1) {
  // 🔥 Si cambió de sección, nuevo.y ya viene calculado correctamente
  if (nuevo.seccionId && nuevo.seccionId !== objOriginal.seccionId) {
    console.log("🔧 Cambio de sección detectado - usando Y sin offset:", nuevo.y);
    actualizarObjeto(i, nuevo); // usar Y tal como viene
  } else {
    // 🔧 Movimiento normal dentro de la misma sección
    const offsetY = calcularOffsetY(
      seccionesOrdenadas,
      seccionesOrdenadas.findIndex((s) => s.id === seccion.id),
      altoCanvas
    );
    actualizarObjeto(i, {
      ...nuevo,
      y: nuevo.y - offsetY, // restar offset solo en movimientos normales
    });
  }
}
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
