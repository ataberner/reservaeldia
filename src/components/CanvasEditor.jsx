// components/CanvasEditor.jsx
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Stage, Layer, Line, Rect, Text, Transformer, Image as KonvaImage, Group , Circle} from "react-konva";
import { doc, getDoc, updateDoc, serverTimestamp, addDoc, collection } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import ElementoCanvas from "./ElementoCanvas";
import LineControls from "./LineControls"; 
import ReactDOMServer from "react-dom/server";
import { convertirAlturaVH, calcularOffsetY } from "../utils/layout";
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
import { guardarSeccionComoPlantilla } from "@/utils/plantillas";
import { determinarNuevaSeccion } from "@/utils/layout";

import { ALL_FONTS } from '../config/fonts';
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





// Componente para secciones con fondo de imagen draggable
const SeccionConFondoImagen = ({ seccion, offsetY, alturaPx, onSelect, onUpdateFondoOffset }) => {
const [fondoImage] = useImage(seccion.fondoImagen, "anonymous");
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef(null);
  
  if (!fondoImage) {
    // Mostrar fondo fallback mientras carga la imagen
    return (
      <Rect
        id={seccion.id}
        x={0}
        y={offsetY}
        width={800}
        height={alturaPx}
        fill={seccion.fondo || "#f0f0f0"}
        listening={true}
        onClick={onSelect}
      />
    );
  }

  // 🎯 CÁLCULOS PARA CUBRIR TODA LA SECCIÓN (COVER BEHAVIOR)
  const canvasWidth = 800;
  const canvasHeight = alturaPx;
  const imageWidth = fondoImage.width;
  const imageHeight = fondoImage.height;

  // Calcular escalas para cubrir completamente la sección
  const scaleX = canvasWidth / imageWidth;
  const scaleY = canvasHeight / imageHeight;
  const scale = Math.max(scaleX, scaleY); // 🔑 Usar la escala MAYOR para cubrir completamente

  // Dimensiones finales de la imagen escalada
  const scaledWidth = imageWidth * scale;
  const scaledHeight = imageHeight * scale;

  // Posición centrada por defecto
  const offsetXCentrado = (canvasWidth - scaledWidth) / 2;
  const offsetYCentrado = (canvasHeight - scaledHeight) / 2;
  
  // Posición final con offsets del usuario
  const offsetXFinal = offsetXCentrado + (seccion.fondoImagenOffsetX || 0);
  const offsetYFinal = offsetYCentrado + (seccion.fondoImagenOffsetY || 0);

  return (
    <Group>
      {/* Fondo base (fallback) */}
      <Rect
        id={seccion.id}
        x={0}
        y={offsetY}
        width={800}
        height={alturaPx}
        fill={seccion.fondo || "#f0f0f0"}
        listening={true}
        onClick={onSelect}
      />
      
      {/* Máscara para recortar la imagen */}
      <Group
        clipX={0}
        clipY={offsetY}
        clipWidth={800}
        clipHeight={alturaPx}
      >
        {/* Imagen de fondo draggable */}
        <KonvaImage
          image={fondoImage}
          x={offsetXFinal}
          y={offsetY + offsetYFinal}
          width={scaledWidth}
          height={scaledHeight}
          draggable={seccion.fondoImagenDraggable}
          listening={true}
          
          // 🔥 EVENTOS DE DRAG CORREGIDOS
          onMouseDown={(e) => {
            console.log("🖱️ MouseDown en imagen de fondo");
            e.cancelBubble = true; // Prevenir propagación
            setIsDragging(false); // Reset del estado
            dragStartPos.current = e.target.getStage().getPointerPosition();
          }}
          
          onDragStart={(e) => {
            console.log("🚀 DragStart en imagen de fondo");
            setIsDragging(true);
            dragStartPos.current = e.target.getStage().getPointerPosition();
            
            // 🔥 PREVENIR CONFLICTOS CON OTROS ELEMENTOS
            e.cancelBubble = true;
            e.target.moveToTop(); // Mover al frente durante drag
          }}
          
          onDragMove={(e) => {
            if (!isDragging) return; // Solo procesar si estamos arrastrando
            
            console.log("🔄 DragMove en imagen de fondo");
            const node = e.target;
            
            // 🔥 THROTTLE PARA MEJOR PERFORMANCE
            if (window._fondoDragThrottle) return;
            window._fondoDragThrottle = true;
            
            requestAnimationFrame(() => {
              // Calcular nuevos offsets relativos al centro
              const nuevaX = node.x();
              const nuevaY = node.y() - offsetY;
              
              const nuevoOffsetX = nuevaX - offsetXCentrado;
              const nuevoOffsetY = nuevaY - offsetYCentrado;
              
              console.log("📊 Nuevos offsets:", { 
                offsetX: nuevoOffsetX, 
                offsetY: nuevoOffsetY 
              });
              
              // Actualizar offsets en tiempo real
              if (onUpdateFondoOffset) {
                onUpdateFondoOffset(seccion.id, { 
                  offsetX: nuevoOffsetX, 
                  offsetY: nuevoOffsetY 
                }, true); // true = preview
              }
              
              window._fondoDragThrottle = false;
            });
          }}
          
          onDragEnd={(e) => {
            console.log("🏁 DragEnd en imagen de fondo");
            
            // 🔥 FORZAR FINALIZACIÓN DEL DRAG
            setIsDragging(false);
            const node = e.target;
            
            // 🔥 LIMPIAR THROTTLE
            if (window._fondoDragThrottle) {
              window._fondoDragThrottle = false;
            }
            
            // Calcular offsets finales
            const nuevaX = node.x();
            const nuevaY = node.y() - offsetY;
            
            const nuevoOffsetX = nuevaX - offsetXCentrado;
            const nuevoOffsetY = nuevaY - offsetYCentrado;
            
            console.log("💾 Guardando offsets finales:", { 
              offsetX: nuevoOffsetX, 
              offsetY: nuevoOffsetY 
            });
            
            // Guardar offsets finales
            if (onUpdateFondoOffset) {
              onUpdateFondoOffset(seccion.id, { 
                offsetX: nuevoOffsetX, 
                offsetY: nuevoOffsetY 
              }, false); // false = final
            }
            
            // 🔥 FORZAR DESHABILITACIÓN DEL DRAGGABLE
            setTimeout(() => {
              if (node.draggable && node.draggable()) {
                node.draggable(false);
                setTimeout(() => {
                  node.draggable(true);
                }, 100);
              }
            }, 50);
          }}
          
          // 🔥 EVENTOS ADICIONALES PARA ASEGURAR FINALIZACIÓN
          onMouseUp={(e) => {
            console.log("🖱️ MouseUp en imagen de fondo");
            if (isDragging) {
              console.log("⚠️ Forzando finalización de drag desde MouseUp");
              setIsDragging(false);
            }
          }}
          
          onMouseLeave={(e) => {
            if (isDragging) {
              console.log("⚠️ Mouse salió durante drag - finalizando");
              setIsDragging(false);
            }
          }}
          
          onClick={(e) => {
            console.log("🖱️ Click en imagen de fondo, isDragging:", isDragging);
            e.cancelBubble = true;
            
            // Solo procesar click si no estamos arrastrando
            if (!isDragging) {
              const currentPos = e.target.getStage().getPointerPosition();
              const startPos = dragStartPos.current;
              
              // Verificar si realmente fue un click (no drag)
              if (startPos && currentPos) {
                const distance = Math.sqrt(
                  Math.pow(currentPos.x - startPos.x, 2) + 
                  Math.pow(currentPos.y - startPos.y, 2)
                );
                
                if (distance < 5) { // Click real
                  onSelect();
                }
              } else {
                onSelect();
              }
            }
          }}
          
          // Estilos visuales durante drag
          opacity={isDragging ? 0.8 : 1}
          shadowColor={isDragging ? "#773dbe" : "transparent"}
          shadowBlur={isDragging ? 10 : 0}
        />
      </Group>
      
    </Group>
  );
};



const iconoRotacion = ReactDOMServer.renderToStaticMarkup(<RotateCcw color="black" />);
const urlData = "data:image/svg+xml;base64," + btoa(iconoRotacion);

// 🎨 Componente selector de color estético
const SelectorColorSeccion = ({ seccion, onChange, disabled = false }) => {
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const pickerRef = useRef(null);
  const [colorHexManual, setColorHexManual] = useState(seccion.fondo || "#ffffff");

  
  // Cerrar picker al hacer clic fuera
  useEffect(() => {
    const handleClickFuera = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setMostrarPicker(false);
      }
    };
    
    if (mostrarPicker) {
      document.addEventListener('mousedown', handleClickFuera);
      return () => document.removeEventListener('mousedown', handleClickFuera);
    }
  }, [mostrarPicker]);
  
  const colorActual = seccion.fondo || "#ffffff";
  const tieneImagenFondo = seccion.fondoTipo === "imagen";

  useEffect(() => {
  setColorHexManual(seccion.fondo || "#ffffff");
}, [seccion.fondo]);


  
  return (
    <div className="relative" ref={pickerRef}>
      {/* Botón principal */}
      <button
        onClick={() => setMostrarPicker(!mostrarPicker)}
        disabled={disabled}
        className={`group flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
          disabled 
            ? 'bg-gray-200 cursor-not-allowed' 
            : tieneImagenFondo
              ? 'bg-orange-50 hover:bg-orange-100 border border-orange-200'
              : 'bg-white hover:bg-gray-50 border border-gray-200 hover:border-purple-300'
        } shadow-sm hover:shadow-md`}
        title={tieneImagenFondo ? "Cambiar fondo (reemplazará la imagen)" : "Cambiar color de fondo"}
      >
        {/* Muestra de color */}
        <div 
          className={`w-5 h-5 rounded-full border-2 transition-transform group-hover:scale-110 ${
            tieneImagenFondo ? 'border-orange-300' : 'border-gray-300'
          }`}
          style={{ backgroundColor: colorActual }}
        />
        
        {/* Texto */}
        <span className={`text-xs font-medium ${
          tieneImagenFondo ? 'text-orange-700' : 'text-gray-700'
        }`}>
          {tieneImagenFondo ? "Color" : "Fondo"}
        </span>
        
        {/* Ícono */}
        <svg 
          className={`w-3 h-3 transition-transform ${mostrarPicker ? 'rotate-180' : ''} ${
            tieneImagenFondo ? 'text-orange-500' : 'text-gray-500'
          }`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
     {/* Picker desplegable - CORREGIDO para no salirse */}
{mostrarPicker && (
  <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-50 min-w-[200px] max-w-[250px]">
          {/* Aviso si tiene imagen de fondo */}
          {tieneImagenFondo && (
            <div className="mb-3 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">
              ⚠️ Esto reemplazará la imagen de fondo actual
            </div>
          )}
          
          {/* Selector de color */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">Seleccionar color:</label>
            <input
              type="color"
              value={colorActual}
              onChange={(e) => {
                onChange(seccion.id, e.target.value);
                setMostrarPicker(false);
              }}
              className="w-full h-10 rounded border border-gray-300 cursor-pointer"
            />
            
            {/* Colores predefinidos */}
            <div className="grid grid-cols-6 gap-1 pt-2">
              {['#ffffff', '#f8f9fa', '#e9ecef', '#dee2e6', '#495057', '#212529'].map(color => (
                <button
                  key={color}
                  onClick={() => {
                    onChange(seccion.id, color);
                    setMostrarPicker(false);
                  }}
                  className="w-6 h-6 rounded border-2 border-gray-300 hover:border-purple-400 transition-colors"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            


            {/* Input manual para escribir el color */}
{/* Input manual para escribir el color */}
<input
  type="text"
  value={colorHexManual}
  onChange={(e) => {
    const val = e.target.value;
    setColorHexManual(val); // Lo dejamos escribir, aunque sea incompleto

    const esValido = /^#([0-9A-Fa-f]{3}){1,2}$/.test(val);
    if (esValido) {
      onChange(seccion.id, val); // Solo aplicamos si es válido
    }
  }}
  placeholder="#ffffff"
  className={`w-full mt-2 px-2 py-1 border text-sm rounded font-mono ${
    /^#([0-9A-Fa-f]{3}){1,2}$/.test(colorHexManual)
      ? "border-gray-300"
      : "border-red-400"
  }`}
/>


          </div>
        </div>
      )}
    </div>
  );
};



export default function CanvasEditor({ slug, zoom = 1, onHistorialChange, onFuturosChange, userId }) {
  const [objetos, setObjetos] = useState([]);
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
    const fuentesDisponibles = ALL_FONTS;

    const {
  editing,      // { id, value }
  startEdit,    // (id, initial)
  updateEdit,   // (nuevoValor)
  finishEdit    // () => void
} = useInlineEditor();



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
  console.log("🔄 actualizarOffsetFondo llamada:", {
    seccionId,
    nuevosOffsets,
    esPreview
  });
  
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
        const puntosActuales = obj.points || [];
        const puntosValidos = [];
        
        // Asegurar 4 valores numéricos
        for (let i = 0; i < 4; i++) {
          const valor = parseFloat(puntosActuales[i]);
          puntosValidos.push(isNaN(valor) ? (i === 2 ? 100 : 0) : valor);
        }
        
        console.log(`📐 Validando línea ${obj.id}:`, {
          antes: puntosActuales,
          despues: puntosValidos
        });
        
        return {
          ...obj,
          points: puntosValidos
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
    
    console.log("✅ Guardado exitoso en Firebase");


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



const mostrarGuias = (pos, idActual) => {
  const margen   = 5;          // sensibilidad (px)
  const ancho    = 800;        // ancho canvas
  const alto     = altoCanvasDinamico;
  const cxCanvas = ancho / 2;
  const cyCanvas = alto  / 2;

  const nodeActual = elementRefs.current[idActual];
  if (!nodeActual) return;

  const boxA = nodeActual.getClientRect();

  // 👉 Flags para NO repetir la misma guía
  const done = {
    cx:false, cy:false,
    l:false,  r:false,
    t:false,  b:false
  };

  const nuevas = [];

  /* ---------- helper ------------- */
  const addGuide = ({x1,y1,x2,y2,type})=>{
    if (done[type]) return;     // ya hay una guía de ese tipo
    nuevas.push({points:[x1,y1,x2,y2],type});
    done[type] = true;
  };

  /* ---------- 1) centro canvas ----- */
  if (Math.abs(boxA.x + boxA.width/2 - cxCanvas) < margen){
    addGuide({x1:cxCanvas, y1:0, x2:cxCanvas, y2:alto, type:'cx'});
    nodeActual.x(nodeActual.x() + (cxCanvas - (boxA.x + boxA.width/2)));
  }
  if (Math.abs(boxA.y + boxA.height/2 - cyCanvas) < margen){
    addGuide({x1:0, y1:cyCanvas, x2:ancho, y2:cyCanvas, type:'cy'});
    nodeActual.y(nodeActual.y() + (cyCanvas - (boxA.y + boxA.height/2)));
  }

  /* ---------- 2) contra otros objetos ---- */
  objetos.forEach(o=>{
    if (o.id === idActual) return;
    const n = elementRefs.current[o.id];
    if (!n) return;
    const b = n.getClientRect();

    // centros
    if (Math.abs(boxA.x + boxA.width/2 - (b.x + b.width/2)) < margen)
      addGuide({x1:b.x+b.width/2, y1:0, x2:b.x+b.width/2, y2:alto, type:'cx'});
    if (Math.abs(boxA.y + boxA.height/2 - (b.y + b.height/2)) < margen)
      addGuide({x1:0, y1:b.y+b.height/2, x2:ancho, y2:b.y+b.height/2, type:'cy'});

    // bordes (left / right / top / bottom)
    if (Math.abs(boxA.x - b.x) < margen)
      addGuide({x1:b.x, y1:0, x2:b.x, y2:alto, type:'l'});
    if (Math.abs(boxA.x + boxA.width - (b.x + b.width)) < margen)
      addGuide({x1:b.x+b.width, y1:0, x2:b.x+b.width, y2:alto, type:'r'});
    if (Math.abs(boxA.y - b.y) < margen)
      addGuide({x1:0, y1:b.y, x2:ancho, y2:b.y, type:'t'});
    if (Math.abs(boxA.y + boxA.height - (b.y + b.height)) < margen)
      addGuide({x1:0, y1:b.y+b.height, x2:ancho, y2:b.y+b.height, type:'b'});
  });

  /* ---------- publicar resultado ---------- */
  setGuiaLineas(nuevas);

  // ⏲️  auto-fade: limpiá guías si el usuario deja de mover 300 ms
  clearTimeout(window._guidesTimeout);
  window._guidesTimeout = setTimeout(()=>setGuiaLineas([]),300);
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



// 🎨 Cambiar color de fondo de sección (CORREGIDO - sin undefined)
const cambiarColorFondoSeccion = useCallback((seccionId, nuevoColor) => {
  console.log("🎨 Cambiando color de fondo:", { seccionId, nuevoColor });
  
  setSecciones(prev => 
    prev.map(s => {
      if (s.id !== seccionId) return s;
      
      // 🔥 CREAR OBJETO LIMPIO sin campos undefined
      const seccionActualizada = {
        ...s, 
        fondo: nuevoColor
      };
      
      // 🔥 ELIMINAR campos de imagen de fondo si existen (no usar undefined)
      if (s.fondoTipo) delete seccionActualizada.fondoTipo;
      if (s.fondoImagen) delete seccionActualizada.fondoImagen;
      if (s.fondoImagenOffsetX !== undefined) delete seccionActualizada.fondoImagenOffsetX;
      if (s.fondoImagenOffsetY !== undefined) delete seccionActualizada.fondoImagenOffsetY;
      if (s.fondoImagenDraggable !== undefined) delete seccionActualizada.fondoImagenDraggable;
      
      return seccionActualizada;
    })
  );
}, [setSecciones]);


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
    const botonX = elementoX + anchoElemento; // -12px (mitad del botón)
    const botonY = elementoY -24; // -12px (mitad del botón)
    
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
    getHistorial: () => ({ historial: historial.length, futuros: futuros.length })
  };

  return () => {
    delete window.canvasEditor;
  };
}, [onDeshacer, onRehacer, historial.length, futuros.length]);


// En CanvasEditor.jsx, reemplazar la función detectarInterseccionLinea
const detectarInterseccionLinea = useMemo(() => {
  return (lineObj, area, stage) => {
    try {
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
      
      // 🔥 IMPORTANTE: El lineObj ya tiene Y con offset aplicado desde ElementoCanvas
      const lineX = lineObj.x || 0;
      const lineY = lineObj.y || 0;
      
      // Log para debugging
      
      
      // Coordenadas absolutas de los puntos
      const startX = lineX + puntosLimpios[0];
      const startY = lineY + puntosLimpios[1];
      const endX = lineX + puntosLimpios[2];
      const endY = lineY + puntosLimpios[3];
      
      
      
      // 🔥 MÉTODO 1: Verificar si algún punto está dentro del área
      const startDentro = (
        startX >= area.x && startX <= area.x + area.width &&
        startY >= area.y && startY <= area.y + area.height
      );
      
      const endDentro = (
        endX >= area.x && endX <= area.x + area.width &&
        endY >= area.y && endY <= area.y + area.height
      );
      
      if (startDentro || endDentro) {
        console.log("✅ Línea seleccionada por punto dentro del área");
        return true;
      }
      
      // 🔥 MÉTODO 2: Verificar si el área contiene completamente la línea
      const lineMinX = Math.min(startX, endX);
      const lineMaxX = Math.max(startX, endX);
      const lineMinY = Math.min(startY, endY);
      const lineMaxY = Math.max(startY, endY);
      
      const areaContieneLinea = (
        lineMinX >= area.x &&
        lineMaxX <= area.x + area.width &&
        lineMinY >= area.y &&
        lineMaxY <= area.y + area.height
      );
      
      if (areaContieneLinea) {
        console.log("✅ Línea seleccionada por estar completamente dentro del área");
        return true;
      }
      
      // 🔥 MÉTODO 3: Verificar intersección línea-rectángulo
      const intersectaConArea = lineIntersectsRect(
        startX, startY, endX, endY,
        area.x, area.y, area.x + area.width, area.y + area.height
      );
      
      if (intersectaConArea) {
      
        return true;
      }
      
  
      return false;
      
    } catch (error) {
      console.error("Error en detectarInterseccionLinea:", error);
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
        onClick={() =>
    guardarSeccionComoPlantilla({
      seccionId: seccion.id,
      secciones,
      objetos,
      refrescarPlantillasDeSeccion,
    })
  }
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
      
         {/* 🎨 NUEVO: Selector de color estético */}
      <SelectorColorSeccion
        seccion={seccion}
        onChange={cambiarColorFondoSeccion}
        disabled={estaAnimando}
      />


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
  style={{
    background: "white",
    overflow: "visible",
    position: "relative",
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
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
            try {
              return detectarInterseccionLinea(obj, area, stage);
            } catch (error) {
              const box = node.getClientRect({ relativeTo: stage });
              return (
                box.x + box.width >= area.x &&
                box.x <= area.x + area.width &&
                box.y + box.height >= area.y &&
                box.y <= area.y + area.height
              );
            }
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



onMouseUp={() => {
  // 🔥 FINALIZAR DRAG GRUPAL MANUAL
if (window._grupoLider && window._dragStartPos && window._dragInicial) {

  
  const stage = stageRef.current;
  const currentPos = stage.getPointerPosition();
  
  if (currentPos && window._dragStartPos) {
    const deltaX = currentPos.x - window._dragStartPos.x;
    const deltaY = currentPos.y - window._dragStartPos.y;
    const elementosSeleccionados = window._elementosSeleccionados || [];
    
 
    
    // 🔥 APLICACIÓN FINAL SIN PREVIEW
    setObjetos(prev => {
      return prev.map(objeto => {
        if (elementosSeleccionados.includes(objeto.id)) {
          if (window._dragInicial && window._dragInicial[objeto.id]) {
            const posInicial = window._dragInicial[objeto.id];
            const posicionFinal = {
              x: posInicial.x + deltaX,
              y: posInicial.y + deltaY
            };
            console.log(`📍 ${objeto.id}: ${posInicial.x},${posInicial.y} → ${posicionFinal.x},${posicionFinal.y}`);
            return { ...objeto, ...posicionFinal };
          }
        }
        return objeto;
      });
    });
  }
  
  // 🔥 LIMPIEZA COMPLETA
  
  window._grupoLider = null;
  window._dragStartPos = null;
  window._dragInicial = null;
  window._dragGroupThrottle = false;
  window._boundsUpdateThrottle = false;
  
  // Re-habilitar draggable
  elementosSeleccionados.forEach(id => {
    const node = elementRefs.current[id];
    if (node) {
      setTimeout(() => node.draggable(true), 50);
    }
  });
}

  
  if (!seleccionActiva || !areaSeleccion) return;

 
 const nuevaSeleccion = objetos.filter((obj) => {
  const node = elementRefs.current[obj.id];
  if (!node) {

    return false;
  }
  
     // 🔥 MANEJO ESPECIAL PARA LÍNEAS
    if (obj.tipo === 'forma' && obj.figura === 'line') {
      try {
        // 🔥 OBTENER POSICIÓN REAL DEL NODO (no del objeto)
        const nodePos = node.position();
        const lineX = nodePos.x;
        const lineY = nodePos.y;
        
        const points = obj.points || [0, 0, 100, 0];
        const cleanPoints = [
          parseFloat(points[0]) || 0,
          parseFloat(points[1]) || 0,
          parseFloat(points[2]) || 100,
          parseFloat(points[3]) || 0
        ];
        
        // Calcular puntos absolutos
        const startX = lineX + cleanPoints[0];
        const startY = lineY + cleanPoints[1];
        const endX = lineX + cleanPoints[2];
        const endY = lineY + cleanPoints[3];
        
        // Verificar si algún punto está dentro del área
        const startDentro = (
          startX >= areaSeleccion.x && startX <= areaSeleccion.x + areaSeleccion.width &&
          startY >= areaSeleccion.y && startY <= areaSeleccion.y + areaSeleccion.height
        );
        
        const endDentro = (
          endX >= areaSeleccion.x && endX <= areaSeleccion.x + areaSeleccion.width &&
          endY >= areaSeleccion.y && endY <= areaSeleccion.y + areaSeleccion.height
        );
        
        // Verificar si el área cruza la línea
        const lineMinX = Math.min(startX, endX);
        const lineMaxX = Math.max(startX, endX);
        const lineMinY = Math.min(startY, endY);
        const lineMaxY = Math.max(startY, endY);
        
        const areaIntersectaLinea = !(
          areaSeleccion.x > lineMaxX ||
          areaSeleccion.x + areaSeleccion.width < lineMinX ||
          areaSeleccion.y > lineMaxY ||
          areaSeleccion.y + areaSeleccion.height < lineMinY
        );
        
        const resultado = startDentro || endDentro || areaIntersectaLinea;
        
        
        return resultado;
      } catch (error) {
        
        return false;
      }
    }
    
    // 🔄 LÓGICA PARA ELEMENTOS NORMALES
    try {
      const box = node.getClientRect();
      const resultado = (
        box.x + box.width >= areaSeleccion.x &&
        box.x <= areaSeleccion.x + areaSeleccion.width &&
        box.y + box.height >= areaSeleccion.y &&
        box.y <= areaSeleccion.y + areaSeleccion.height
      );
      
      return resultado;
    } catch (error) {
      
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
    <SeccionConFondoImagen
      key={`seccion-img-${seccion.id}`}
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
  // 🎯 Determinar si está en modo edición
  const isInEditMode = editing.id === obj.id && elementosSeleccionados[0] === obj.id;
  
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
        if (editing.id && editing.id !== id) {
          finishEdit();
        }

        e.evt.cancelBubble = true;
        const esShift = e?.evt?.shiftKey;

        setElementosSeleccionados((prev) => {
          if (esShift) {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            return [...prev, id];
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
      
     onDragMovePersonalizado={isInEditMode ? null : (pos, elementId) => {
        mostrarGuias(pos, elementId);
        
        if (elementosSeleccionados.includes(elementId)) {
          requestAnimationFrame(() => {
            if (typeof actualizarPosicionBotonOpciones === 'function') {
              actualizarPosicionBotonOpciones();
            }
          });
        }
      }}
      onDragEndPersonalizado={isInEditMode ? null : () => setGuiaLineas([])}
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


{elementosSeleccionados.length > 0 && (() => {
  
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
  );
})()}


{/* 🔥 OPTIMIZACIÓN: No mostrar hover durante drag/resize/edición */}
{!window._resizeData?.isResizing && !window._isDragging && !editing.id && (
  <HoverIndicator
    hoveredElement={hoverId}
    elementRefs={elementRefs}
  />
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
  />
);
  }
  return null;
})()}





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

  console.log("🧪 DEBUG al salir de edición:", { textoNuevo, index, objeto });

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
    onCopiar();
    setMostrarPanelZ(false);
  }}
  className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition">
  <Copy className="w-4 h-4" /> Copiar
</button>

<button
  onClick={() => {
    onPegar();
    setMostrarPanelZ(false);
  }}
  className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition">
  <ClipboardPaste className="w-4 h-4" /> Pegar
</button>

<button
  onClick={() => {
    onDuplicar();
    setMostrarPanelZ(false);
  }}
  className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition">
  <PlusCircle className="w-4 h-4" /> Duplicar
</button>

{elementoSeleccionado?.tipo === "imagen" && (
  <button
  onClick={() => {
  reemplazarFondo({
    elementoImagen: elementoSeleccionado,
    secciones,
    objetos,
    setSecciones,
    setObjetos,
    setElementosSeleccionados,
    setMostrarPanelZ,
  });
}}

    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
  >
    <div className="w-4 h-4 bg-gradient-to-br from-blue-400 to-purple-500 rounded"></div>
    Usar como fondo
  </button>
)}

<button
  onClick={() => {
    onEliminar();
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



{(objetoSeleccionado?.tipo === "texto" || objetoSeleccionado?.tipo === "forma") && (() => {
  const esTexto = objetoSeleccionado?.tipo === "texto";
  const esFormaConTexto = objetoSeleccionado?.tipo === "forma" && objetoSeleccionado?.texto;
  const esRect = objetoSeleccionado?.figura === "rect";

  return (
    <div
      className="fixed z-50 bg-white border rounded shadow p-2 flex gap-2 items-center"
      style={{
        top: "120px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "auto",
        maxWidth: "800px",
      }}
    >
      {/* 🎨 Color de fondo (solo formas) */}
        {objetoSeleccionado?.tipo === "forma" && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Fondo</label>
          <input
            type="color"
            value={objetoSeleccionado.color || "#ffffff"}
            onChange={(e) =>
              setObjetos((prev) =>
                prev.map((o) =>
                  elementosSeleccionados.includes(o.id)
                    ? { ...o, color: e.target.value }
                    : o
                )
              )
            }
            className="w-8 h-6 rounded"
          />
        </div>
      )}

      {/* 🟣 Radio esquinas (solo rectángulos) */}
      {objetoSeleccionado?.tipo === "forma" && esRect && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Esquinas</label>
          <input
            type="range"
            min={0}
            max={100}
            value={objetoSeleccionado.cornerRadius || 0}
            onChange={(e) =>
              setObjetos((prev) =>
                prev.map((o) =>
                  elementosSeleccionados.includes(o.id)
                    ? { ...o, cornerRadius: parseInt(e.target.value) }
                    : o
                )
              )
            }
          />
          <span className="text-xs text-gray-700">{objetoSeleccionado.cornerRadius || 0}</span>
        </div>
      )}

      {/* Selector de fuente */}
      <div
        className={`relative cursor-pointer px-3 py-1 rounded border text-sm transition-all ${
          mostrarSelectorFuente ? "bg-gray-200" : "hover:bg-gray-100"
        }`}
        style={{ fontFamily: objetoSeleccionado?.fontFamily || "sans-serif" }}
        title="Fuente"
        onClick={() => setMostrarSelectorFuente(!mostrarSelectorFuente)}
      >
        {objetoSeleccionado?.fontFamily || "sans-serif"}

        {mostrarSelectorFuente && (
          <div
            className="absolute popup-fuente z-50 bg-white border rounded-2xl shadow-md p-4 w-80 max-h-[500px] overflow-auto"
            style={{ top: "40px", left: "-200px" }}
          >
            <div className="text-xs font-semibold text-gray-600 mb-2">Fuente</div>
            {ALL_FONTS.map((fuente) => {
              const estaActiva = objetoSeleccionado?.fontFamily === fuente.valor;
              const estaCargada = fontManager.isFontAvailable(fuente.valor);

              return (
                <div
                  key={fuente.valor}
                  className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-all ${
                    estaCargada ? "hover:bg-gray-100" : "hover:bg-gray-50 opacity-70"
                  }`}
                  style={{ fontFamily: estaCargada ? fuente.valor : "sans-serif" }}
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await fontManager.loadFonts([fuente.valor]);
                      setObjetos((prev) =>
                        prev.map((o) =>
                          elementosSeleccionados.includes(o.id)
                            ? { ...o, fontFamily: fuente.valor }
                            : o
                        )
                      );
                    } catch (error) {
                      console.error("Error cargando fuente:", error);
                    }
                  }}
                >
                  <span className="text-xs text-gray-500 w-20">{fuente.categoria}</span>
                  <span className="text-sm text-gray-700 flex-1">{fuente.nombre}</span>
                  <span className="text-base text-gray-400" style={{ fontFamily: fuente.valor }}>
                    AaBbCc
                  </span>
                  {estaActiva && <Check className="w-4 h-4 text-purple-600 ml-2" />}
                  {!estaCargada && (
                    <div className="w-4 h-4 ml-2">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Control de tamaño */}
      <div className="relative flex items-center bg-white border rounded-lg overflow-hidden">
        <button
          className="px-2 py-1 hover:bg-gray-100 transition"
          onClick={(e) => {
            e.stopPropagation();
            setObjetos((prev) =>
              prev.map((o) => {
                if (!elementosSeleccionados.includes(o.id)) return o;
                const actual = o.fontSize || 24;
                return { ...o, fontSize: Math.max(6, actual - 2) };
              })
            );
          }}
        >
          −
        </button>

        <div
          className={`px-2 py-1 text-sm cursor-pointer transition-all ${
            mostrarSelectorTamaño ? "bg-gray-200" : "hover:bg-gray-100"
          }`}
          onClick={() => setMostrarSelectorTamaño(!mostrarSelectorTamaño)}
        >
          {objetoSeleccionado?.fontSize || 24}
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

        <button
          className="px-2 py-1 hover:bg-gray-100 transition"
          onClick={() => {
            setObjetos((prev) =>
              prev.map((o) => {
                if (!elementosSeleccionados.includes(o.id)) return o;
                return { ...o, fontSize: Math.min(120, (o.fontSize || 24) + 2) };
              })
            );
          }}
        >
          +
        </button>
      </div>

      {/* 🎨 Color de texto */}
      <input
        type="color"
        value={objetoSeleccionado?.colorTexto || "#000000"}
        onChange={(e) => {
          setObjetos((prev) =>
            prev.map((o) =>
              elementosSeleccionados.includes(o.id)
                ? { ...o, colorTexto: e.target.value }
                : o
            )
          );
        }}
      />

      {/* B / I / S */}
      <button
        className={`px-2 py-1 rounded border text-sm font-bold transition ${
          objetoSeleccionado?.fontWeight === "bold" ? "bg-gray-200" : "hover:bg-gray-100"
        }`}
        onClick={() =>
          setObjetos((prev) =>
            prev.map((o) =>
              elementosSeleccionados.includes(o.id)
                ? {
                    ...o,
                    fontWeight: o.fontWeight === "bold" ? "normal" : "bold",
                  }
                : o
            )
          )
        }
      >
        B
      </button>

      <button
        className={`px-2 py-1 rounded border text-sm italic transition ${
          objetoSeleccionado?.fontStyle === "italic" ? "bg-gray-200" : "hover:bg-gray-100"
        }`}
        onClick={() =>
          setObjetos((prev) =>
            prev.map((o) =>
              elementosSeleccionados.includes(o.id)
                ? {
                    ...o,
                    fontStyle: o.fontStyle === "italic" ? "normal" : "italic",
                  }
                : o
            )
          )
        }
      >
        I
      </button>

      <button
        className={`px-2 py-1 rounded border text-sm transition ${
          objetoSeleccionado?.textDecoration === "underline"
            ? "bg-gray-200 underline"
            : "hover:bg-gray-100"
        }`}
        onClick={() =>
          setObjetos((prev) =>
            prev.map((o) =>
              elementosSeleccionados.includes(o.id)
                ? {
                    ...o,
                    textDecoration:
                      o.textDecoration === "underline" ? "none" : "underline",
                  }
                : o
            )
          )
        }
      >
        S
      </button>

      {/* Alineación */}
      <button
        className="px-2 py-1 rounded border text-sm transition hover:bg-gray-100 flex items-center justify-center"
        onClick={onCambiarAlineacion}
        title={`Alineación: ${objetoSeleccionado?.align || "izquierda"}`}
      >
        {(() => {
          const align = objetoSeleccionado?.align || "left";
          switch (align) {
            case "left":
              return "⬅️";
            case "center":
              return "↔️";
            case "right":
              return "➡️";
            case "justify":
              return "⚌";
            default:
              return "⬅️";
          }
        })()}
      </button>
    </div>
  );
})()}



  </div>
);

}
