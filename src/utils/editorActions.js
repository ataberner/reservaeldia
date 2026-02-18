// src/utils/editorActions.js

export function ejecutarDeshacer({
  historial,
  setHistorial,
  setObjetos,
  setSecciones,
  setFuturos,
  ignoreNextUpdateRef,
  setElementosSeleccionados,
  setMostrarPanelZ
}) {
  if (historial.length > 1) {
    setElementosSeleccionados([]);
    setMostrarPanelZ(false);

    ignoreNextUpdateRef.current = (ignoreNextUpdateRef.current || 0) + 1;


    setHistorial((prev) => {
      const nuevoHistorial = [...prev];
      const estadoActual = nuevoHistorial.pop();
      const estadoAnterior = nuevoHistorial[nuevoHistorial.length - 1];

      // Aplicar estado anterior
      setObjetos(estadoAnterior.objetos || []);
      setSecciones(estadoAnterior.secciones || []);

      // Guardar para rehacer (push al frente, igual que tu lógica actual)
      setFuturos((f) => [estadoActual, ...f.slice(0, 19)]);

      return nuevoHistorial;
    });
  }
}

export function ejecutarRehacer({
  futuros,
  setFuturos,
  setHistorial,
  setObjetos,
  setSecciones,
  ignoreNextUpdateRef,
  setElementosSeleccionados,
  setMostrarPanelZ
}) {
  if (futuros.length > 0) {
    setElementosSeleccionados([]);
    setMostrarPanelZ(false);

    const siguienteEstado = futuros[0];

    ignoreNextUpdateRef.current = (ignoreNextUpdateRef.current || 0) + 1;

    setObjetos(siguienteEstado.objetos || []);
    setSecciones(siguienteEstado.secciones || []);

    setFuturos((f) => f.slice(1));
    setHistorial((h) => [...h, siguienteEstado]);
  }
}


export function duplicarElemento({ objetos, elementosSeleccionados, setObjetos, setElementosSeleccionados }) {
  const seleccionados = objetos.filter((o) => elementosSeleccionados.includes(o.id));
  const duplicados = seleccionados.map((original, i) => ({
    ...original,
    id: `obj-${Date.now()}-${i}`,
    x: original.x + 20,
    y: original.y + 20,
  }));

  setObjetos((prev) => [...prev, ...duplicados]);
  setElementosSeleccionados(duplicados.map((d) => d.id));
}

export function eliminarElemento({ objetos, elementosSeleccionados, setObjetos, setElementosSeleccionados, setMostrarPanelZ }) {
  if (elementosSeleccionados.length === 0) return;
  const idsAEliminar = [...elementosSeleccionados];

  setElementosSeleccionados([]);
  setMostrarPanelZ(false);

  setTimeout(() => {
    setObjetos((prev) => prev.filter((o) => !idsAEliminar.includes(o.id)));
  }, 10);
}

export function copiarElemento({ objetos, elementosSeleccionados }) {
  const seleccionados = objetos.filter((o) => elementosSeleccionados.includes(o.id));
  if (seleccionados.length > 0) {
    window._objetosCopiados = seleccionados.map((o) => ({ ...o, id: undefined }));
  }
}

export function pegarElemento({ setObjetos, setElementosSeleccionados }) {
  const copiados = window._objetosCopiados || [];
  if (!window._objetosCopiados || window._objetosCopiados.length === 0) return;
  const offset = 30 + Math.random() * 20;
  const nuevos = copiados.map((c, i) => ({
    ...c,
    id: `obj-${Date.now()}-${i}`,
    x: (c.x || 100) + offset,
    y: (c.y || 100) + offset,
  }));

  setObjetos((prev) => [...prev, ...nuevos]);
  setElementosSeleccionados(nuevos.map((n) => n.id));
}

export function cambiarAlineacionTexto({ objetos, elementosSeleccionados, setObjetos }) {
  const alineaciones = ['left', 'center', 'right', 'justify'];

  setObjetos((prev) =>
    prev.map((o) => {
      const esTexto = o.tipo === 'texto';
      const esRectConTexto =
        o.tipo === 'forma' &&
        o.figura === 'rect' &&
        typeof o.texto === 'string';

      if (!elementosSeleccionados.includes(o.id) || (!esTexto && !esRectConTexto)) {
        return o;
      }

      const currentIndex = alineaciones.indexOf(o.align || 'left');
      const nextIndex = (currentIndex + 1) % alineaciones.length;
      const nuevaAlineacion = alineaciones[nextIndex];

      return { ...o, align: nuevaAlineacion };
    })
  );
}
