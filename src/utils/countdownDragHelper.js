// utils/countdownDragHelper.js
/**
 * Helper para manejar el drag de elementos countdown con integración de guías
 */

/**
 * Crea los handlers de drag para CountdownKonva integrados con el sistema de guías
 * @param {Object} params - Parámetros de configuración
 * @param {Function} params.mostrarGuias - Función para mostrar guías del hook
 * @param {Function} params.limpiarGuias - Función para limpiar guías del hook
 * @param {Array} params.objetos - Array de objetos para las guías
 * @param {Object} params.elementRefs - Referencias de elementos para las guías
 * @param {Function} params.actualizarPosicionBoton - Función para actualizar posición del botón de opciones
 * @returns {Object} Handlers de drag configurados
 */
export function createCountdownDragHandlers({
  mostrarGuias,
  limpiarGuias,
  objetos,
  elementRefs,
  actualizarPosicionBoton
}) {
  
  /**
   * Handler para onDragMovePersonalizado
   */
  const handleDragMove = (pos, id) => {
    window._isDragging = true;
    
    // 🆕 INTEGRAR CON SISTEMA DE GUÍAS
    try {
      mostrarGuias(pos, id, objetos, elementRefs);
    } catch (error) {
      console.warn('Error mostrando guías para countdown:', error);
    }
    
    // Actualizar posición del botón de opciones si existe
    if (typeof actualizarPosicionBoton === 'function') {
      requestAnimationFrame(() => {
        actualizarPosicionBoton();
      });
    }
  };

  /**
   * Handler para onDragEndPersonalizado  
   */
  const handleDragEnd = () => {
    window._isDragging = false;
    
    // 🆕 LIMPIAR GUÍAS
    try {
      limpiarGuias();
    } catch (error) {
      console.warn('Error limpiando guías para countdown:', error);
    }
    
    // Actualizar posición del botón de opciones si existe
    if (typeof actualizarPosicionBoton === 'function') {
      requestAnimationFrame(() => {
        actualizarPosicionBoton();
      });
    }
  };

  return {
    handleDragMove,
    handleDragEnd
  };
}

/**
 * Crea props optimizadas para CountdownKonva con sistema de guías integrado
 * @param {Object} params - Parámetros base
 * @returns {Object} Props listas para usar
 */
export function createCountdownProps(params) {
  const { handleDragMove, handleDragEnd } = createCountdownDragHandlers(params);
  
  return {
    onDragMovePersonalizado: handleDragMove,
    onDragEndPersonalizado: handleDragEnd
  };
}