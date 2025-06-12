// src/hooks/useImperativeObjects.js
import { useRef, useCallback, useMemo } from 'react';

export function useImperativeObjects() {
  const objectRefsMap = useRef(new Map());
  const pendingUpdates = useRef(new Map());
  const batchUpdateTimeoutRef = useRef(null);

  // 📝 Registrar un objeto con su ref - SIN LOGS
  const registerObject = useCallback((id, nodeRef) => {
    if (nodeRef) {
      objectRefsMap.current.set(id, nodeRef);
    } else {
      objectRefsMap.current.delete(id);
    }
  }, []);

  // ⚡ Actualizar objeto imperativamente - SIN LOGS
  const updateObjectImperative = useCallback((id, newAttrs) => {
    const nodeRef = objectRefsMap.current.get(id);
    if (!nodeRef) return false;

    try {
      Object.entries(newAttrs).forEach(([key, value]) => {
        if (typeof nodeRef[key] === 'function') {
          nodeRef[key](value);
        } else if (nodeRef.attrs) {
          nodeRef.attrs[key] = value;
        }
      });

      const layer = nodeRef.getLayer();
      if (layer) {
        layer.batchDraw();
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }, []);

  // 🧹 Limpiar - SIN LOGS
  const cleanup = useCallback(() => {
    if (batchUpdateTimeoutRef.current) {
      clearTimeout(batchUpdateTimeoutRef.current);
    }
    pendingUpdates.current.clear();
    objectRefsMap.current.clear();
  }, []);

  // 🎯 Retornar objeto memoizado
  return useMemo(() => ({
    registerObject,
    updateObjectImperative,
    cleanup,
    getObjectRef: (id) => objectRefsMap.current.get(id)
  }), [registerObject, updateObjectImperative, cleanup]);
}

export default useImperativeObjects;