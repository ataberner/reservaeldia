// hooks/useGuiasCentrado.js
import { useState, useCallback } from 'react';

/**
 * Hook para manejar las líneas de guía de centrado en el editor Konva
 * @param {Object} config - Configuración del hook
 * @param {number} config.anchoCanvas - Ancho del canvas
 * @param {number} config.altoCanvas - Alto del canvas
 * @param {number} config.margenSensibilidad - Margen de sensibilidad para las guías (default: 5px)
 * @returns {Object} - Funciones y estado para manejar las guías
 */
export default function useGuiasCentrado({
  anchoCanvas = 800,
  altoCanvas = 800,
  margenSensibilidad = 5
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
   * Añade una nueva línea de guía si no existe ya una del mismo tipo
   * @param {Object} guia - Configuración de la guía
   * @param {number[]} guia.points - Puntos de la línea [x1, y1, x2, y2]
   * @param {string} guia.type - Tipo de guía ('cx', 'cy', 'l', 'r', 't', 'b')
   * @param {Object} tiposUsados - Objeto que rastrea qué tipos ya se han usado
   */
  const agregarGuia = useCallback(({ points, type }, tiposUsados) => {
    if (tiposUsados[type]) return; // Ya hay una guía de este tipo
    
    setGuiaLineas(prev => [...prev, { points, type }]);
    tiposUsados[type] = true;
  }, []);

  /**
   * Verifica y aplica snap para el centro del canvas
   * @param {Object} boxElemento - Bounding box del elemento
   * @param {Object} nodeElemento - Nodo Konva del elemento
   * @param {Object} tiposUsados - Objeto que rastrea qué tipos ya se han usado
   */
  const verificarCentroCanvas = useCallback((boxElemento, nodeElemento, tiposUsados) => {
    const cxCanvas = anchoCanvas / 2;
    const cyCanvas = altoCanvas / 2;

    // Centro horizontal
    const centroElementoX = boxElemento.x + boxElemento.width / 2;
    if (Math.abs(centroElementoX - cxCanvas) < margenSensibilidad) {
      agregarGuia({
        points: [cxCanvas, 0, cxCanvas, altoCanvas],
        type: 'cx'
      }, tiposUsados);
      
      // Aplicar snap
      const ajusteX = cxCanvas - centroElementoX;
      nodeElemento.x(nodeElemento.x() + ajusteX);
    }

    // Centro vertical
    const centroElementoY = boxElemento.y + boxElemento.height / 2;
    if (Math.abs(centroElementoY - cyCanvas) < margenSensibilidad) {
      agregarGuia({
        points: [0, cyCanvas, anchoCanvas, cyCanvas],
        type: 'cy'
      }, tiposUsados);
      
      // Aplicar snap
      const ajusteY = cyCanvas - centroElementoY;
      nodeElemento.y(nodeElemento.y() + ajusteY);
    }
  }, [anchoCanvas, altoCanvas, margenSensibilidad, agregarGuia]);

  /**
   * Verifica y aplica snap contra otros elementos
   * @param {Object} boxElementoActual - Bounding box del elemento actual
   * @param {string} idElementoActual - ID del elemento actual
   * @param {Array} objetos - Array de todos los objetos
   * @param {Object} elementRefs - Referencias a los nodos Konva
   * @param {Object} tiposUsados - Objeto que rastrea qué tipos ya se han usado
   */
  const verificarContraOtrosElementos = useCallback((
    boxElementoActual, 
    idElementoActual, 
    objetos, 
    elementRefs, 
    tiposUsados
  ) => {
    objetos.forEach(objeto => {
      if (objeto.id === idElementoActual) return;
      
      const nodoObjeto = elementRefs.current?.[objeto.id];
      if (!nodoObjeto) return;

      try {
        const boxObjeto = nodoObjeto.getClientRect();

        // Verificar centros
        verificarCentros(boxElementoActual, boxObjeto, tiposUsados);
        
        // Verificar bordes
        verificarBordes(boxElementoActual, boxObjeto, tiposUsados);
        
      } catch (error) {
        console.warn(`Error obteniendo bounding box para ${objeto.id}:`, error);
      }
    });
  }, [margenSensibilidad, agregarGuia, anchoCanvas, altoCanvas]);

  /**
   * Verifica alineación de centros entre dos elementos
   */
  const verificarCentros = useCallback((boxA, boxB, tiposUsados) => {
    const centroAX = boxA.x + boxA.width / 2;
    const centroAY = boxA.y + boxA.height / 2;
    const centroBX = boxB.x + boxB.width / 2;
    const centroBY = boxB.y + boxB.height / 2;

    // Centro horizontal
    if (Math.abs(centroAX - centroBX) < margenSensibilidad) {
      agregarGuia({
        points: [centroBX, 0, centroBX, altoCanvas],
        type: 'cx'
      }, tiposUsados);
    }

    // Centro vertical
    if (Math.abs(centroAY - centroBY) < margenSensibilidad) {
      agregarGuia({
        points: [0, centroBY, anchoCanvas, centroBY],
        type: 'cy'
      }, tiposUsados);
    }
  }, [margenSensibilidad, agregarGuia, anchoCanvas, altoCanvas]);

  /**
   * Verifica alineación de bordes entre dos elementos
   */
  const verificarBordes = useCallback((boxA, boxB, tiposUsados) => {
    // Borde izquierdo
    if (Math.abs(boxA.x - boxB.x) < margenSensibilidad) {
      agregarGuia({
        points: [boxB.x, 0, boxB.x, altoCanvas],
        type: 'l'
      }, tiposUsados);
    }

    // Borde derecho
    if (Math.abs((boxA.x + boxA.width) - (boxB.x + boxB.width)) < margenSensibilidad) {
      agregarGuia({
        points: [boxB.x + boxB.width, 0, boxB.x + boxB.width, altoCanvas],
        type: 'r'
      }, tiposUsados);
    }

    // Borde superior
    if (Math.abs(boxA.y - boxB.y) < margenSensibilidad) {
      agregarGuia({
        points: [0, boxB.y, anchoCanvas, boxB.y],
        type: 't'
      }, tiposUsados);
    }

    // Borde inferior
    if (Math.abs((boxA.y + boxA.height) - (boxB.y + boxB.height)) < margenSensibilidad) {
      agregarGuia({
        points: [0, boxB.y + boxB.height, anchoCanvas, boxB.y + boxB.height],
        type: 'b'
      }, tiposUsados);
    }
  }, [margenSensibilidad, agregarGuia, anchoCanvas, altoCanvas]);

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
      
      // Objeto para rastrear qué tipos de guías ya se han agregado
      const tiposUsados = {
        cx: false, cy: false,
        l: false, r: false,
        t: false, b: false
      };

      // Limpiar guías anteriores
      setGuiaLineas([]);

      // 1. Verificar contra centro del canvas
      verificarCentroCanvas(boxActual, nodeActual, tiposUsados);

      // 2. Verificar contra otros elementos
      verificarContraOtrosElementos(
        boxActual, 
        idActual, 
        objetos, 
        elementRefs, 
        tiposUsados
      );

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
  }, [
    anchoCanvas, 
    altoCanvas, 
    verificarCentroCanvas, 
    verificarContraOtrosElementos
  ]);

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
    verificarCentroCanvas,
    verificarContraOtrosElementos
  };
}