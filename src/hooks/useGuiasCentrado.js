// hooks/useGuiasCentrado.js
import { useState, useCallback } from 'react';

/**
 * Hook para manejar las líneas de guía de centrado en el editor Konva
 * @param {Object} config - Configuración del hook
 * @param {number} config.anchoCanvas - Ancho del canvas
 * @param {number} config.altoCanvas - Alto del canvas
 * @param {number} config.margenSensibilidad - Margen de sensibilidad para las guías (default: 5px)
 * @param {Array} config.seccionesOrdenadas - Array de secciones ordenadas
 * @returns {Object} - Funciones y estado para manejar las guías
 */
export default function useGuiasCentrado({
  anchoCanvas = 800,
  altoCanvas = 800,
  margenSensibilidad = 5,
  seccionesOrdenadas = []
}) {
  const [guiaLineas, setGuiaLineas] = useState([]);

  /**
   * Limpia las líneas de guía
   */
  const limpiarGuias = useCallback(() => {
    setGuiaLineas([]);
    
    // Limpiar timeout existente si existe
    if (window._guidesTimeout) {
      clearTimeout(window._guidesTimeout);
      window._guidesTimeout = null;
    }
  }, []);

  /**
   * Obtiene la sección a la que pertenece un elemento
   */
  const obtenerSeccionElemento = useCallback((objetoId, objetos) => {
    const objeto = objetos.find(obj => obj.id === objetoId);
    if (!objeto || !objeto.seccionId) return null;
    
    return seccionesOrdenadas.find(seccion => seccion.id === objeto.seccionId);
  }, [seccionesOrdenadas]);

  /**
   * Calcula el offset Y de una sección
   */
  const calcularOffsetSeccion = useCallback((seccionId) => {
    let offsetY = 0;
    for (const seccion of seccionesOrdenadas) {
      if (seccion.id === seccionId) break;
      offsetY += seccion.altura;
    }
    return offsetY;
  }, [seccionesOrdenadas]);

  /**
   * Añade una nueva línea de guía
   * @param {Object} guia - Configuración de la guía
   * @param {number[]} guia.points - Puntos de la línea [x1, y1, x2, y2]
   * @param {string} guia.type - Tipo de guía
   * @param {string} guia.style - Estilo de la línea ('solid' o 'dashed')
   * @param {string} guia.priority - Prioridad ('seccion' o 'elemento')
   */
  const agregarGuia = useCallback(({ points, type, style = 'solid', priority = 'elemento' }) => {
    setGuiaLineas(prev => [...prev, { points, type, style, priority }]);
  }, []);

  /**
   * Verifica y aplica snap para el centro de la sección
   * @param {Object} boxElemento - Bounding box del elemento
   * @param {Object} nodeElemento - Nodo Konva del elemento
   * @param {string} objetoId - ID del objeto
   * @param {Array} objetos - Array de objetos
   * @returns {Object} - Información sobre snap aplicado
   */
  const verificarCentroSeccion = useCallback((boxElemento, nodeElemento, objetoId, objetos) => {
    const seccion = obtenerSeccionElemento(objetoId, objetos);
    if (!seccion) return { snapX: false, snapY: false };

    const offsetSeccion = calcularOffsetSeccion(seccion.id);
    const centroSeccionX = anchoCanvas / 2;
    const centroSeccionY = offsetSeccion + (seccion.altura / 2);

    let snapX = false;
    let snapY = false;

    // Centro horizontal de la sección
    const centroElementoX = boxElemento.x + boxElemento.width / 2;
    if (Math.abs(centroElementoX - centroSeccionX) < margenSensibilidad) {
      agregarGuia({
        points: [centroSeccionX, offsetSeccion, centroSeccionX, offsetSeccion + seccion.altura],
        type: 'seccion-cx',
        style: 'solid',
        priority: 'seccion'
      });
      
      // Aplicar snap
      const ajusteX = centroSeccionX - centroElementoX;
      nodeElemento.x(nodeElemento.x() + ajusteX);
      snapX = true;
    }

    // Centro vertical de la sección
    const centroElementoY = boxElemento.y + boxElemento.height / 2;
    if (Math.abs(centroElementoY - centroSeccionY) < margenSensibilidad) {
      agregarGuia({
        points: [0, centroSeccionY, anchoCanvas, centroSeccionY],
        type: 'seccion-cy',
        style: 'solid',
        priority: 'seccion'
      });
      
      // Aplicar snap
      const ajusteY = centroSeccionY - centroElementoY;
      nodeElemento.y(nodeElemento.y() + ajusteY);
      snapY = true;
    }

    return { snapX, snapY };
  }, [anchoCanvas, margenSensibilidad, obtenerSeccionElemento, calcularOffsetSeccion, agregarGuia]);

  /**
   * Verifica alineación contra otros elementos (solo las más relevantes)
   * @param {Object} boxElementoActual - Bounding box del elemento actual
   * @param {string} idElementoActual - ID del elemento actual
   * @param {Array} objetos - Array de todos los objetos
   * @param {Object} elementRefs - Referencias a los nodos Konva
   */
  const verificarContraOtrosElementos = useCallback((
    boxElementoActual, 
    idElementoActual, 
    objetos, 
    elementRefs
  ) => {
    // Limitar a los 5 elementos más cercanos para evitar saturación
    const elementosCercanos = objetos
      .filter(objeto => objeto.id !== idElementoActual)
      .map(objeto => {
        const nodo = elementRefs.current?.[objeto.id];
        if (!nodo) return null;
        
        try {
          const box = nodo.getClientRect();
          const distancia = Math.abs(
            (boxElementoActual.x + boxElementoActual.width / 2) - 
            (box.x + box.width / 2)
          ) + Math.abs(
            (boxElementoActual.y + boxElementoActual.height / 2) - 
            (box.y + box.height / 2)
          );
          
          return { objeto, box, distancia };
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.distancia - b.distancia)
      .slice(0, 3); // Solo los 3 más cercanos

    elementosCercanos.forEach(({ objeto, box }) => {
      verificarCentrosConElemento(boxElementoActual, box, objeto.id);
    });
  }, [margenSensibilidad]);

  /**
   * Verifica alineación de centros con un elemento específico
   */
  const verificarCentrosConElemento = useCallback((boxA, boxB, elementoBId) => {
    const centroAX = boxA.x + boxA.width / 2;
    const centroAY = boxA.y + boxA.height / 2;
    const centroBX = boxB.x + boxB.width / 2;
    const centroBY = boxB.y + boxB.height / 2;

    // Centro horizontal - línea punteada entre elementos
    if (Math.abs(centroAX - centroBX) < margenSensibilidad) {
      const minY = Math.min(boxA.y, boxB.y);
      const maxY = Math.max(boxA.y + boxA.height, boxB.y + boxB.height);
      
      agregarGuia({
        points: [centroBX, minY, centroBX, maxY],
        type: `elemento-cx-${elementoBId}`,
        style: 'dashed',
        priority: 'elemento'
      });
    }

    // Centro vertical - línea punteada entre elementos  
    if (Math.abs(centroAY - centroBY) < margenSensibilidad) {
      const minX = Math.min(boxA.x, boxB.x);
      const maxX = Math.max(boxA.x + boxA.width, boxB.x + boxB.width);
      
      agregarGuia({
        points: [minX, centroBY, maxX, centroBY],
        type: `elemento-cy-${elementoBId}`,
        style: 'dashed',
        priority: 'elemento'
      });
    }
  }, [margenSensibilidad, agregarGuia]);

  /**
   * Función principal para mostrar guías durante el drag
   * @param {Object} pos - Posición actual del elemento
   * @param {string} idActual - ID del elemento que se está moviendo
   * @param {Array} objetos - Array de todos los objetos
   * @param {Object} elementRefs - Referencias a los nodos Konva
   */
  const mostrarGuias = useCallback((pos, idActual, objetos, elementRefs) => {
    const nodeActual = elementRefs.current?.[idActual];
    if (!nodeActual) {
      console.warn(`No se encontró el nodo para ${idActual}`);
      return;
    }

    try {
      const boxActual = nodeActual.getClientRect();
      
      // Limpiar guías anteriores
      setGuiaLineas([]);

      // 1. PRIORIDAD: Verificar centro de la sección (líneas continuas)
      const snapSeccion = verificarCentroSeccion(boxActual, nodeActual, idActual, objetos);

      // 2. SECUNDARIO: Verificar contra otros elementos (líneas punteadas)
      // Solo si no hay snap con la sección para evitar saturación
      if (!snapSeccion.snapX || !snapSeccion.snapY) {
        verificarContraOtrosElementos(boxActual, idActual, objetos, elementRefs);
      }

      // 3. Auto-fade: limpiar guías después de 300ms de inactividad
      if (window._guidesTimeout) {
        clearTimeout(window._guidesTimeout);
      }
      
      window._guidesTimeout = setTimeout(() => {
        setGuiaLineas([]);
      }, 300);

    } catch (error) {
      console.error('Error en mostrarGuias:', error);
    }
  }, [verificarCentroSeccion, verificarContraOtrosElementos]);

  /**
   * Configurar las líneas de guía en el evento onDragEnd
   */
  const configurarDragEnd = useCallback(() => {
    limpiarGuias();
  }, [limpiarGuias]);

  return {
    // Estado
    guiaLineas,
    
    // Funciones principales
    mostrarGuias,
    limpiarGuias,
    configurarDragEnd,
    
    // Funciones auxiliares (por si necesitas usarlas externamente)
    verificarCentroSeccion,
    verificarContraOtrosElementos,
    obtenerSeccionElemento,
    calcularOffsetSeccion
  };
}