// components/CanvasEditor.jsx
import { useEffect, useState, useRef } from "react";
import { Stage, Layer, Text, Transformer, Image as KonvaImage, Group , Circle} from "react-konva";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import ElementoCanvas from "./ElementoCanvas";
import { Check, RotateCcw } from "lucide-react";
import ReactDOMServer from "react-dom/server";
import useImage from "use-image";



const iconoRotacion = ReactDOMServer.renderToStaticMarkup(<RotateCcw color="black" />);
const urlData = "data:image/svg+xml;base64," + btoa(iconoRotacion);


export default function CanvasEditor({ slug, zoom = 1, onHistorialChange, onFuturosChange }) {
  const [objetos, setObjetos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [futuros, setFuturos] = useState([]);
  const [elementoSeleccionado, setElementoSeleccionado] = useState(null);
    const [posBarra, setPosBarra] = useState({ x: 0, y: 0 });
    const [modoEdicion, setModoEdicion] = useState(false);
    const [cargado, setCargado] = useState(false);
    const stageRef = useRef(null);
    const transformerRef = useRef();
    const elementRefs = useRef({});
    const contenedorRef = useRef(null);
    const ignoreNextUpdateRef = useRef(false);
    const [altoCanvas, setAltoCanvas] = useState(1400);
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



useEffect(() => {
  const handler = (e) => {
    const nueva = e.detail;
    setObjetos((prev) => [...prev, nueva]);
  };

  window.addEventListener("insertar-imagen", handler);
  return () => window.removeEventListener("insertar-imagen", handler);
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
    setElementoSeleccionado(obj.id);
    iniciarEdicionInline(obj, true);
    nuevoTextoRef.current = null; // 🧼 Limpiamos para evitar repetir
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
  const actualizarAlto = () => {
    setAltoCanvas(window.innerHeight);
  };

  window.addEventListener("resize", actualizarAlto);
  actualizarAlto(); // valor inicial

  return () => window.removeEventListener("resize", actualizarAlto);
}, []);



useEffect(() => {
  const node = elementRefs.current[elementoSeleccionado];
  if (node && transformerRef.current) {
    const transformer = transformerRef.current;

    // 🔥 Desactivamos explícitamente el control de rotación en el nodo
    node.rotationEnabled && node.rotationEnabled(false);

    transformer.nodes([node]);
    transformer.getLayer().batchDraw();
  }
}, [elementoSeleccionado]);




  useEffect(() => {
  if (!elementoSeleccionado || !contenedorRef.current) return;

  const contenedorRect = contenedorRef.current.getBoundingClientRect();

  setPosBarra({
    x: contenedorRect.left + contenedorRef.current.offsetWidth / 2 - 200, // 200px = mitad del ancho estimado de la barra
    y: contenedorRect.top + 10, // 10px de margen superior
  });
}, [elementoSeleccionado]);

useEffect(() => {
  if (onHistorialChange) onHistorialChange(historial);
}, [historial]);

useEffect(() => {
  if (onFuturosChange) onFuturosChange(futuros);
}, [futuros]);



const [scale, setScale] = useState(1);

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
  if (contenedorRef.current) {
    const styles = window.getComputedStyle(contenedorRef.current);
    console.log("PADDING CONTENEDOR:", styles.padding);
  }
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
    if ((e.key === "Delete" || e.key === "Backspace") && elementoSeleccionado) {
      e.preventDefault(); // evita borrar en otro lado
      setObjetos((prev) => prev.filter((o) => o.id !== elementoSeleccionado));
      setElementoSeleccionado(null); // deselecciona
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [elementoSeleccionado]);
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

            setElementoSeleccionado(null); // ✅ Evita error si ya no existe
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
    actualizado[index] = { ...actualizado[index], texto: textoNuevo };
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





const fuentesDisponibles = [...fuentesLocales, ...fuentesGoogle];
const objetoSeleccionado = objetos.find((o) => o.id === elementoSeleccionado);
console.log("zoom en CanvasEditor:", zoom);

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
  >

      <Layer>
        {objetos
    .map((obj, i) => {
    if (modoEdicion && elementoSeleccionado === obj.id) return null;

    return (
      <ElementoCanvas
        key={obj.id}
        obj={obj}
        anchoCanvas={800}
        isSelected={elementoSeleccionado === obj.id}
        onSelect={(id, obj) => {
          setElementoSeleccionado(id);
          if (obj?.tipo === "texto") iniciarEdicionInline(obj);
        }}
        onChange={(id, nuevo) => {
          const i = objetos.findIndex((o) => o.id === id);
          if (i !== -1) actualizarObjeto(i, nuevo);
        }}
        registerRef={(id, node) => {
          elementRefs.current[id] = node;
        }}
      />
    );
  })}


        {elementoSeleccionado && (
          <Transformer
  ref={transformerRef}
  nodes={
    elementRefs.current[elementoSeleccionado]
      ? [elementRefs.current[elementoSeleccionado]]
      : []
  }
  rotationEnabled={false}
  rotateAnchorOffset={30} 
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
  borderStroke="#773dbe"           // 🎯 color del borde
  borderStrokeWidth={1}          // grosor del borde
  anchorFill="#ffffff"             // color de fondo de los puntos
  anchorStroke="#773dbe"           // color del borde de los puntos
  anchorStrokeWidth={1}            // grosor del borde de los puntos
  anchorSize={6}                   // tamaño de los puntos
/>

        )}
{/* 
        {elementoSeleccionado && elementRefs.current[elementoSeleccionado] && (
  <Group
    x={elementRefs.current[elementoSeleccionado].x()}
    y={elementRefs.current[elementoSeleccionado].y() - 40} // 🔼 40px arriba del objeto
    draggable
   onDragMove={(e) => {
  const node = elementRefs.current[elementoSeleccionado];
  if (node) {
    const dx = e.target.x() - node.x();
    const dy = e.target.y() - node.y();
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    const i = objetos.findIndex((o) => o.id === elementoSeleccionado);
    if (i !== -1) {
      actualizarObjeto(i, { rotation: angle });
    }
  }
}}

    onDragEnd={(e) => {
  const node = elementRefs.current[elementoSeleccionado];
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
    </Stage>
  </div>
</div>


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
    const index = objetos.findIndex((o) => o.id === elementoSeleccionado);
    if (index !== -1) {
      const actualizado = [...objetos];
      actualizado[index].fontFamily = fuente.valor;
      setObjetos(actualizado);
    }
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
    onClick={() => {
  const index = objetos.findIndex((o) => o.id === elementoSeleccionado);
  if (index !== -1) {
    const actual = objetos[index].fontSize || 24;
    const nuevo = Math.max(6, actual - 2);
    const actualizado = [...objetos];
    actualizado[index].fontSize = nuevo;
    setObjetos(actualizado);
  }
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
              const i = objetos.findIndex((o) => o.id === elementoSeleccionado);
              if (i !== -1) {
                const actualizado = [...objetos];
                actualizado[i].fontSize = tam;
                setObjetos(actualizado);
              }
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
  const index = objetos.findIndex((o) => o.id === elementoSeleccionado);
  if (index !== -1) {
    const actual = objetos[index].fontSize || 24;
    const nuevo = Math.min(120, actual + 2);
    const actualizado = [...objetos];
    actualizado[index].fontSize = nuevo;
    setObjetos(actualizado);
  }
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
        const index = objetos.findIndex((o) => o.id === elementoSeleccionado);
        if (index !== -1) {
          const actualizado = [...objetos];
          actualizado[index].color = e.target.value;
          setObjetos(actualizado);
        }
      }}
    />

   {/* B */}
<button
  className={`px-2 py-1 rounded border text-sm font-bold transition ${
    objetoSeleccionado?.fontWeight === "bold" ? "bg-gray-200" : "hover:bg-gray-100"
  }`}
  onClick={() => {
    const index = objetos.findIndex((o) => o.id === elementoSeleccionado);
    if (index !== -1) {
      const actualizado = [...objetos];
      const actual = actualizado[index];
      actualizado[index].fontWeight = actual.fontWeight === "bold" ? "normal" : "bold";
      console.log("➡️ fontWeight actual:", actual.fontWeight);
      setObjetos(actualizado);
    }
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
    const index = objetos.findIndex((o) => o.id === elementoSeleccionado);
    if (index !== -1) {
      const actualizado = [...objetos];
      const actual = actualizado[index];
      actualizado[index].fontStyle = actual.fontStyle === "italic" ? "normal" : "italic";
      setObjetos(actualizado);
    }
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
    const index = objetos.findIndex((o) => o.id === elementoSeleccionado);
    if (index !== -1) {
      const actualizado = [...objetos];
      const actual = actualizado[index];
      actualizado[index].textDecoration =
        actual.textDecoration === "underline" ? "none" : "underline";
      setObjetos(actualizado);
    }
  }}
>
  S
</button>

    
  </div>
)}

    </div>
  );
}
