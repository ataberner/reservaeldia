// components/CanvasEditor.jsx
import { useEffect, useState, useRef } from "react";
import { Stage, Layer, Text, Transformer, Image as KonvaImage } from "react-konva";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import ElementoCanvas from "./ElementoCanvas";




export default function CanvasEditor({ slug, zoom = 1 }) {
  const [objetos, setObjetos] = useState([]);
  const [elementoSeleccionado, setElementoSeleccionado] = useState(null);
    const [posBarra, setPosBarra] = useState({ x: 0, y: 0 });
    const [modoEdicion, setModoEdicion] = useState(false);
    const [cargado, setCargado] = useState(false);
    const stageRef = useRef(null);
    const transformerRef = useRef();
    const elementRefs = useRef({});
    const contenedorRef = useRef(null);
    const [altoCanvas, setAltoCanvas] = useState(1400);
    const [anchoStage, setAnchoStage] = useState(800);



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
      transformerRef.current.nodes([node]);
      transformerRef.current.getLayer().batchDraw();
    }
  }, [elementoSeleccionado]);

useEffect(() => {
  const node = elementRefs.current[elementoSeleccionado];
  if (node) {
    const stage = node.getStage();
    const box = node.getClientRect({ relativeTo: stage });
    const containerRect = stage.container().getBoundingClientRect();

    setPosBarra({
      x: containerRect.left + box.x,
      y: containerRect.top + box.y - 60, // barra 60px arriba del texto
    });
  }
}, [elementoSeleccionado]);






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
  if (!cargado) return; // ✅ no actualiza si todavía no se cargó Firestore

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


const iniciarEdicionInline = (obj) => {
  const textNode = elementRefs.current[obj.id];
  const stage = textNode.getStage();
  const container = stage.container();
  const box = textNode.getClientRect({ relativeTo: stage });
const fontFamily = obj.fontFamily || "inherit";

  const area = document.createElement("textarea");
  document.body.appendChild(area);

  area.value = obj.texto;
  area.style.position = "absolute";
area.style.top = `${container.getBoundingClientRect().top + box.y}px`;
area.style.left = `${container.getBoundingClientRect().left + box.x}px`;
area.style.width = `${box.width}px`;
area.style.height = "auto";
area.style.fontSize = `${obj.fontSize || 24}px`;
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


  area.focus();

  const index = objetos.findIndex((o) => o.id === obj.id);

  const finalizar = () => {
    const textoNuevo = area.value;
    const actualizado = [...objetos];
    actualizado[index].texto = textoNuevo;
    setObjetos(actualizado);
    setModoEdicion(false);
    area.remove();
  };

  area.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finalizar();
    }
  });

  area.addEventListener("input", () => {
    area.style.height = "auto";
    area.style.height = area.scrollHeight + "px";
    });

  area.addEventListener("blur", () => {
    finalizar();
  });

  setModoEdicion(true);
};
console.log("zoom en CanvasEditor:", zoom);
  return (
    <div className="flex justify-center">
   

   <div
  ref={contenedorRef}
  className="w-full"
  style={{
    overflow: "auto",
    boxSizing: "border-box",
    padding: zoom < 1 ? "60px 0" : "0",
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
        {objetos.map((obj, i) => {
          if (modoEdicion && elementoSeleccionado === obj.id) return null;

          return (
            <ElementoCanvas
              key={obj.id}
              obj={obj}
              anchoCanvas={800}
              isSelected={elementoSeleccionado === obj.id}
              onSelect={setElementoSeleccionado}
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
            rotateEnabled={true}
            enabledAnchors={[
              "top-left",
              "top-right",
              "bottom-left",
              "bottom-right",
              "middle-left",
              "middle-right",
            ]}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 30 || newBox.height < 20) {
                return oldBox;
              }
              return newBox;
            }}
          />
        )}
      </Layer>
    </Stage>
  </div>
</div>


      {elementoSeleccionado && (
  <div
    className="fixed z-50 bg-white border rounded shadow p-2 flex gap-2 items-center"
    style={{
      top: posBarra.y,
      left: posBarra.x,
    }}
  >
    {/* ✏️ Input para cambiar texto */}
    <input
      type="text"
      className="border px-2 py-1 text-sm rounded w-48"
      value={objetos.find((o) => o.id === elementoSeleccionado)?.texto || ""}
      onChange={(e) => {
        const nuevoTexto = e.target.value;
        const index = objetos.findIndex((o) => o.id === elementoSeleccionado);
        if (index !== -1) {
          const actualizado = [...objetos];
          actualizado[index].texto = nuevoTexto;
          setObjetos(actualizado);
        }
      }}
    />

    {/* 🎨 Cambiar color */}
    <input
      type="color"
      value={objetos.find((o) => o.id === elementoSeleccionado)?.color || "#000000"}
      onChange={(e) => {
        const index = objetos.findIndex((o) => o.id === elementoSeleccionado);
        if (index !== -1) {
          const actualizado = [...objetos];
          actualizado[index].color = e.target.value;
          setObjetos(actualizado);
        }
      }}
    />

    {/* 🔠 Tamaño de fuente */}
    <input
      type="number"
      min="8"
      max="120"
      value={objetos.find((o) => o.id === elementoSeleccionado)?.fontSize || 24}
      onChange={(e) => {
        const nuevoTamaño = parseInt(e.target.value);
        const index = objetos.findIndex((o) => o.id === elementoSeleccionado);
        if (index !== -1 && !isNaN(nuevoTamaño)) {
          const actualizado = [...objetos];
          actualizado[index].fontSize = nuevoTamaño;
          setObjetos(actualizado);
        }
      }}
      className="w-16 text-sm"
    />

    {/* 🔄 Rotar */}
    <input
      type="number"
      value={objetos.find((o) => o.id === elementoSeleccionado)?.rotation || 0}
      onChange={(e) => {
        const rotacion = parseInt(e.target.value);
        const index = objetos.findIndex((o) => o.id === elementoSeleccionado);
        if (index !== -1 && !isNaN(rotacion)) {
          const actualizado = [...objetos];
          actualizado[index].rotation = rotacion;
          setObjetos(actualizado);
        }
      }}
      className="w-16 text-sm"
    />

    {/* ❌ Eliminar texto */}
    <button
      onClick={() => {
        const index = objetos.findIndex((o) => o.id === elementoSeleccionado);
        if (index !== -1) {
          const actualizado = [...objetos];
          actualizado.splice(index, 1);
          setObjetos(actualizado);
          setElementoSeleccionado(null);
        }
      }}
      className="text-red-600 text-sm"
    >
      🗑
    </button>
  </div>
)}

    </div>
  );
}
