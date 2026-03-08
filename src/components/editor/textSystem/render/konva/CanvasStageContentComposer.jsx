import { flushSync } from "react-dom";
import { Stage, Line, Rect, Text, Group, Circle } from "react-konva";
import CanvasElementsLayer from "@/components/canvas/CanvasElementsLayer";
import FondoSeccion from "@/components/editor/FondoSeccion";
import GaleriaKonva from "@/components/editor/GaleriaKonva";
import CountdownKonva from "@/components/editor/countdown/CountdownKonva";
import ElementoCanvas from "@/components/ElementoCanvas";
import SelectionBounds from "@/components/SelectionBounds";
import HoverIndicator from "@/components/HoverIndicator";
import LineControls from "@/components/LineControls";
import { calcularOffsetY } from "@/utils/layout";
import { resolveKonvaFill } from "@/domain/colors/presets";
import {
  getCurrentInlineEditingId,
  setCurrentInlineEditingId,
} from "@/components/editor/textSystem/bridges/window/inlineWindowBridge";

export default function CanvasStageContent({
  stageRef,
  altoCanvasDinamico,
  stageGestures,
  seccionesOrdenadas,
  altoCanvas,
  seccionActivaId,
  seccionesAnimando,
  onSelectSeccion,
  actualizarOffsetFondo,
  isMobile,
  mobileBackgroundEditSectionId,
  handleBackgroundImageStatusChange,
  controlandoAltura,
  normalizarAltoModo,
  iniciarControlAltura,
  supportsPointerEvents,
  setGlobalCursor,
  clearGlobalCursor,
  objetos,
  editing,
  elementosSeleccionados,
  elementosPreSeleccionados,
  setElementosPreSeleccionados,
  seleccionActiva,
  areaSeleccion,
  setHoverId,
  registerRef,
  celdaGaleriaActiva,
  setCeldaGaleriaActiva,
  mostrarGuias,
  elementRefs,
  actualizarPosicionBotonOpciones,
  setIsDragging,
  limpiarGuias,
  dragStartPos,
  hasDragged,
  setObjetos,
  determinarNuevaSeccion,
  convertirAbsARel,
  esSeccionPantallaById,
  ALTURA_PANTALLA_EDITOR,
  inlineEditPreviewRef,
  calcularXTextoCentrado,
  ensureInlineFontReady,
  pendingInlineStartRef,
  inlineDebugLog,
  obtenerMetricasNodoInline,
  obtenerCentroVisualTextoX,
  setInlineOverlayMountedId,
  setInlineSwapAck,
  captureInlineSnapshot,
  startEdit,
  inlineOverlayMountedId,
  inlineDebugAB,
  finishEdit,
  restoreElementDrag,
  configurarDragEnd,
  ajustarFontSizeAAnchoVisual,
  calcularPosTextoDesdeCentro,
  textResizeDebug,
  isTextResizeDebugEnabled,
  actualizarObjeto,
  hoverId,
  isDragging,
  actualizarLinea,
  guiaLineas,
  handleTransformInteractionStart,
  handleTransformInteractionEnd,
  normalizarMedidasGaleria,
  setElementosSeleccionados,
}) {
  return (
              <Stage
                ref={stageRef}
                width={800}
                height={altoCanvasDinamico}
                perfectDrawEnabled={false}
                listening={true}
                imageSmoothingEnabled={false}
                preventDefault={false}
                hitGraphEnabled={true}
                style={{
                  background: "white",
                  overflow: "visible",
                  position: "relative",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                }}


                onMouseDown={stageGestures.onMouseDown}

                onTouchStart={stageGestures.onTouchStart}

                onTouchMove={stageGestures.onTouchMove}

                onTouchEnd={stageGestures.onTouchEnd}

                onMouseMove={stageGestures.onMouseMove}

                onMouseUp={stageGestures.onMouseUp}
              >
                <CanvasElementsLayer>

                  {seccionesOrdenadas.flatMap((seccion, index) => {
                    const alturaPx = seccion.altura;
                    const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
                    const esActiva = seccion.id === seccionActivaId;
                    const estaAnimando = seccionesAnimando.includes(seccion.id);
                    const sectionFill = resolveKonvaFill(
                      seccion.fondo,
                      800,
                      alturaPx,
                      "#ffffff"
                    );

                    const elementos = [
                      // Fondo de secciÃ³n - puede ser color o imagen
                      seccion.fondoTipo === "imagen" ? (
                        <FondoSeccion
                          key={`fondo-${seccion.id}`}
                          seccion={seccion}
                          offsetY={offsetY}
                          alturaPx={alturaPx}
                          onSelect={() => onSelectSeccion(seccion.id)}
                          onUpdateFondoOffset={actualizarOffsetFondo}
                          isMobile={isMobile}
                          mobileBackgroundEditEnabled={mobileBackgroundEditSectionId === seccion.id}
                          onBackgroundImageStatusChange={handleBackgroundImageStatusChange}
                        />
                      ) : (
                        <Rect
                          key={`seccion-${seccion.id}`}
                          id={seccion.id}
                          x={0}
                          y={offsetY}
                          width={800}
                          height={alturaPx}
                          fill={sectionFill.fillColor}
                          fillPriority={sectionFill.hasGradient ? "linear-gradient" : "color"}
                          fillLinearGradientStartPoint={
                            sectionFill.hasGradient ? sectionFill.startPoint : undefined
                          }
                          fillLinearGradientEndPoint={
                            sectionFill.hasGradient ? sectionFill.endPoint : undefined
                          }
                          fillLinearGradientColorStops={
                            sectionFill.hasGradient
                              ? [0, sectionFill.gradientFrom, 1, sectionFill.gradientTo]
                              : undefined
                          }
                          stroke="transparent"
                          strokeWidth={0}
                          listening={true}
                          preventDefault={false}
                          onClick={() => onSelectSeccion(seccion.id)}
                          onTap={() => onSelectSeccion(seccion.id)}
                        />
                      )
                    ];


                    return elementos;
                  })}


                  {/* Control de altura para secciÃ³n activa */}
                  {seccionActivaId && seccionesOrdenadas.map((seccion, index) => {
                    if (seccion.id !== seccionActivaId) return null;

                    const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
                    const controlY = offsetY + seccion.altura - 5; // 5px antes del final

                    const modoSeccion = normalizarAltoModo(seccion.altoModo);
                    const permiteResizeAltura = (modoSeccion !== "pantalla");


                    return (
                      <Group name="ui" key={`control-altura-${seccion.id}`}>
                        {/* LÃ­nea indicadora */}
                        <Line
                          name="ui"
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
                          listening={permiteResizeAltura}                 // ? clave: si es false, no captura eventos
                          opacity={permiteResizeAltura ? 1 : 0.25}        // ? visual deshabilitado
                          onPointerDown={permiteResizeAltura ? (e) => iniciarControlAltura(e, seccion.id) : undefined}
                          onMouseDown={
                            permiteResizeAltura && !supportsPointerEvents
                              ? (e) => iniciarControlAltura(e, seccion.id)
                              : undefined
                          }
                          onTouchStart={
                            permiteResizeAltura && !supportsPointerEvents
                              ? (e) => iniciarControlAltura(e, seccion.id)
                              : undefined
                          }
                          onMouseEnter={() => {
                            if (!controlandoAltura && permiteResizeAltura) setGlobalCursor("ns-resize", stageRef);
                          }}
                          onMouseLeave={() => {
                            if (!controlandoAltura && permiteResizeAltura) clearGlobalCursor(stageRef);
                          }}
                          draggable={false}
                        >


                          {/* Ãrea de detecciÃ³n */}
                          <Rect
                            x={-45}
                            y={-22}
                            width={90}
                            height={44}
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

                          {/* AnimaciÃ³n de pulso durante el control */}
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
                            text="??"
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
                    <Group name="ui">
                      {/* Overlay sutil */}
                      <Rect
                        x={0}
                        y={0}
                        width={800}
                        height={altoCanvasDinamico}
                        fill="rgba(119, 61, 190, 0.05)"
                        listening={false}
                      />

                      {/* Indicador de la secciÃ³n que se estÃ¡ modificando */}
                      {seccionesOrdenadas.map((seccion, index) => {
                        const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
                        const controlSectionFill = resolveKonvaFill(
                          seccion.fondo,
                          800,
                          seccion.altura,
                          "transparent"
                        );

                        const modoSeccion = normalizarAltoModo(seccion.altoModo);
                        const permiteResizeAltura = (modoSeccion !== "pantalla");

                        return (
                          <Group key={seccion.id}>
                            {/* Rect â€œfondoâ€ clickeable */}
                            <Rect
                              x={0}
                              y={offsetY}
                              width={800}
                              height={seccion.altura}
                              fill={controlSectionFill.fillColor}
                              fillPriority={controlSectionFill.hasGradient ? "linear-gradient" : "color"}
                              fillLinearGradientStartPoint={
                                controlSectionFill.hasGradient
                                  ? controlSectionFill.startPoint
                                  : undefined
                              }
                              fillLinearGradientEndPoint={
                                controlSectionFill.hasGradient
                                  ? controlSectionFill.endPoint
                                  : undefined
                              }
                              fillLinearGradientColorStops={
                                controlSectionFill.hasGradient
                                  ? [0, controlSectionFill.gradientFrom, 1, controlSectionFill.gradientTo]
                                  : undefined
                              }
                              onClick={() => onSelectSeccion(seccion.id)}   // ?? dispara el evento
                            />

                            {/* Rect highlight si estÃ¡s controlando la altura */}
                            {seccion.id === controlandoAltura && (
                              <Rect
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
                            )}
                          </Group>
                        );
                      })}

                    </Group>
                  )}



                  {objetos.map((obj, i) => {
                    // ?? Determinar si estÃ¡ en modo ediciÃ³n
                    const isInlineEditableObject =
                      obj.tipo === "texto" ||
                      (obj.tipo === "forma" && obj.figura === "rect");
                    const isInEditMode =
                      isInlineEditableObject &&
                      editing.id === obj.id &&
                      elementosSeleccionados[0] === obj.id;

                    // ??? Caso especial: la galerÃ­a la renderizamos acÃ¡ (no usa ElementoCanvas)
                    if (obj.tipo === "galeria") {

                      return (
                        <GaleriaKonva
                          key={obj.id}
                          obj={obj}
                          registerRef={registerRef}
                          onHover={setHoverId}
                          isSelected={elementosSeleccionados.includes(obj.id)}
                          celdaGaleriaActiva={celdaGaleriaActiva}
                          onPickCell={(info) => setCeldaGaleriaActiva(info)}
                          seccionesOrdenadas={seccionesOrdenadas}
                          altoCanvas={altoCanvas}
                          onSelect={(id, e) => {
                            e?.evt && (e.evt.cancelBubble = true);
                            setElementosSeleccionados([id]);
                          }}
                          onDragMovePersonalizado={(pos, id) => {
                            window._isDragging = true;
                            mostrarGuias(pos, id, objetos, elementRefs);
                            requestAnimationFrame(() => {
                              if (typeof actualizarPosicionBotonOpciones === "function") {
                                actualizarPosicionBotonOpciones();
                              }
                            });
                          }}
                          onDragStartPersonalizado={(dragId = obj.id) => {
                            if (!elementosSeleccionados.includes(dragId)) {
                              setElementosSeleccionados([dragId]);
                            }
                            setHoverId(null);
                            setIsDragging(true);
                          }}
                          onDragEndPersonalizado={() => {
                            setIsDragging(false);
                            limpiarGuias();
                            if (typeof actualizarPosicionBotonOpciones === "function") {
                              actualizarPosicionBotonOpciones();
                            }
                          }}
                          onChange={(id, nuevo) => {
                            setObjetos((prev) => {
                              const i = prev.findIndex((o) => o.id === id);
                              if (i === -1) return prev;
                              const updated = [...prev];
                              updated[i] = { ...updated[i], ...nuevo };
                              return updated;
                            });
                          }}
                        />

                      );
                    }


                    if (obj.tipo === "countdown") {
                      return (
                        <CountdownKonva
                          key={obj.id}
                          obj={obj}
                          registerRef={registerRef}
                          onHover={setHoverId}
                          isSelected={elementosSeleccionados.includes(obj.id)}
                          seccionesOrdenadas={seccionesOrdenadas}
                          altoCanvas={altoCanvas}

                          // ? selecciÃ³n
                          onSelect={(id, e) => {
                            e?.evt && (e.evt.cancelBubble = true);
                            setElementosSeleccionados([id]);
                          }}

                          // ? PREVIEW liviano (no tocar estado del objeto para que no haya lag)
                          onDragStartPersonalizado={(dragId = obj.id) => {
                            if (!elementosSeleccionados.includes(dragId)) {
                              setElementosSeleccionados([dragId]);
                            }
                            setHoverId(null);
                            setIsDragging(true);
                          }}
                          onDragMovePersonalizado={(pos, id) => {
                            mostrarGuias(pos, id, objetos, elementRefs);
                            requestAnimationFrame(() => {
                              if (typeof actualizarPosicionBotonOpciones === "function") {
                                actualizarPosicionBotonOpciones();
                              }
                            });
                          }}

                          // ? FIN de drag: limpiar guÃ­as / UI auxiliar
                          onDragEndPersonalizado={() => {
                            setIsDragging(false);
                            limpiarGuias();
                            if (typeof actualizarPosicionBotonOpciones === "function") {
                              actualizarPosicionBotonOpciones();
                            }
                          }}

                          // ? refs para el motor de drag
                          dragStartPos={dragStartPos}
                          hasDragged={hasDragged}

                          // ? Â¡Clave! Al finalizar, tratamos x/y absolutas como en ElementoCanvas:
                          onChange={(id, cambios) => {
                            setObjetos(prev => {
                              const i = prev.findIndex(o => o.id === id);
                              if (i === -1) return prev;

                              const objOriginal = prev[i];

                              // ?? Si no es final de drag, mergeamos sin mÃ¡s (no tocar coords)
                              if (!cambios.finalizoDrag) {
                                const updated = [...prev];
                                updated[i] = { ...updated[i], ...cambios };
                                return updated;
                              }

                              // ?? Final de drag: 'cambios.y' viene ABSOLUTA (Stage coords)
                              const { nuevaSeccion, coordenadasAjustadas } = determinarNuevaSeccion(
                                cambios.y,
                                objOriginal.seccionId,
                                seccionesOrdenadas
                              );

                              let next = { ...cambios };
                              delete next.finalizoDrag;

                              if (nuevaSeccion) {
                                next = { ...next, ...coordenadasAjustadas, seccionId: nuevaSeccion };
                              } else {
                                // convertir y absoluta ? y relativa a la secciÃ³n actual
                                next.y = convertirAbsARel(cambios.y, objOriginal.seccionId, seccionesOrdenadas);
                              }

                              const updated = [...prev];
                              updated[i] = { ...updated[i], ...next };
                              return updated;
                            });
                          }}
                        />
                      );
                    }





                    const supportsInlinePreview =
                      obj.tipo === "texto" ||
                      (obj.tipo === "forma" && obj.figura === "rect");
                    const objPreview =
                      editing.id === obj.id && supportsInlinePreview
                        ? (() => {
                          const textoPreview = String(editing.value ?? "");
                          const textoOriginal = String(obj.texto ?? "");
                          const hasPreviewTextChanged = textoPreview !== textoOriginal;
                          const previewObj = hasPreviewTextChanged
                            ? { ...obj, texto: textoPreview }
                            : obj;
                          const shouldKeepCenterPreview =
                            obj.tipo === "texto" &&
                            !obj.__groupAlign &&
                            !Number.isFinite(obj.width) &&
                            obj.__autoWidth !== false;

                          if (shouldKeepCenterPreview && hasPreviewTextChanged) {
                            const lockedCenterX =
                              inlineEditPreviewRef.current?.id === obj.id &&
                              Number.isFinite(inlineEditPreviewRef.current?.centerX)
                                ? inlineEditPreviewRef.current.centerX
                                : null;
                            const previewX = calcularXTextoCentrado(
                              obj,
                              textoPreview,
                              lockedCenterX
                            );
                            if (Number.isFinite(previewX)) {
                              previewObj.x = previewX;
                            }
                          }

                          return previewObj;
                        })()
                        : obj;

                    return (
                      <ElementoCanvas
                        key={obj.id}
                        obj={{
                          ...objPreview,
                          // ?? yLocal: en secciÃ³n pantalla usamos yNorm * 500
                          // fallback legacy: si no hay yNorm, usamos obj.y
                          y: (() => {
                            const idxSec = seccionesOrdenadas.findIndex(s => s.id === objPreview.seccionId);
                            const offsetY = calcularOffsetY(seccionesOrdenadas, idxSec);

                            const yLocal = esSeccionPantallaById(objPreview.seccionId)
                              ? (Number.isFinite(objPreview.yNorm) ? (objPreview.yNorm * ALTURA_PANTALLA_EDITOR) : objPreview.y)
                              : objPreview.y;

                            return yLocal + offsetY;
                          })(),
                        }}
                        anchoCanvas={800}
                        isSelected={!isInEditMode && elementosSeleccionados.includes(obj.id)}
                        selectionCount={elementosSeleccionados.length}
                        preSeleccionado={!isInEditMode && elementosPreSeleccionados.includes(obj.id)}
                        isInEditMode={isInEditMode} // ?? NUEVA PROP
                        onHover={isInEditMode ? null : setHoverId}
                        registerRef={registerRef}
                        onStartTextEdit={isInEditMode ? null : async (id, texto) => {
                          const startAttempt = Number(pendingInlineStartRef.current || 0) + 1;
                          pendingInlineStartRef.current = startAttempt;
                          const fontWait = await ensureInlineFontReady(obj?.fontFamily);
                          if (pendingInlineStartRef.current !== startAttempt) return;
                          inlineDebugLog("start-inline-font-ready", {
                            id,
                            objectFontFamily: obj?.fontFamily ?? null,
                            ...fontWait,
                          });
                          const node = elementRefs.current[id];
                          const nodeMetrics = obtenerMetricasNodoInline(node);
                          const shouldKeepCenterXDuringEdit =
                            obj?.tipo === "texto" &&
                            !obj.__groupAlign &&
                            !Number.isFinite(obj.width) &&
                            obj.__autoWidth !== false;
                          const centerXLock =
                            shouldKeepCenterXDuringEdit
                              ? obtenerCentroVisualTextoX(obj, node)
                              : null;
                          const previousCurrentEditingId = getCurrentInlineEditingId();
                          setInlineOverlayMountedId(null);
                          setInlineSwapAck((prev) => ({
                            id: null,
                            sessionId: null,
                            phase: "reset",
                            token: Number(prev?.token || 0) + 1,
                            offsetY: 0,
                          }));
                          captureInlineSnapshot("enter: pre-start", {
                            id,
                            previousId: previousCurrentEditingId,
                            textoLength: String(texto ?? "").length,
                          });
                          setCurrentInlineEditingId(id);
                          inlineEditPreviewRef.current = {
                            id: shouldKeepCenterXDuringEdit ? id : null,
                            centerX: Number.isFinite(centerXLock) ? centerXLock : null,
                          };
                          inlineDebugLog("start-inline-edit", {
                            id,
                            textoLength: String(texto ?? "").length,
                            objectX: obj?.x ?? null,
                            objectY: obj?.y ?? null,
                            shouldKeepCenterXDuringEdit,
                            centerXLock,
                            previousCurrentEditingId,
                            nextCurrentEditingId: getCurrentInlineEditingId(),
                            nodeMetrics,
                          });

                          startEdit(id, texto);
                          node?.draggable(false);
                          node?.getLayer?.()?.batchDraw?.();
                          captureInlineSnapshot("enter: after-start-sync", {
                            id,
                            previousId: previousCurrentEditingId,
                            nextCurrentEditingId: getCurrentInlineEditingId(),
                          });
                          captureInlineSnapshot("overlay: before-mount", {
                            id,
                            source: "start-inline-edit",
                          });
                        }}
                        editingId={editing.id}
                        inlineOverlayMountedId={inlineOverlayMountedId}
                        inlineVisibilityMode={inlineDebugAB.visibilitySource}
                        inlineOverlayEngine={inlineDebugAB.overlayEngine}
                        finishInlineEdit={finishEdit}
                        onSelect={isInEditMode ? null : (id, obj, e) => {
                          const targetSupportsInlineEdit =
                            obj?.tipo === "texto" ||
                            (obj?.tipo === "forma" && obj?.figura === "rect");
                          if (editing.id && (editing.id !== id || !targetSupportsInlineEdit)) {
                            const previousEditingId = editing.id;
                            finishEdit();
                            restoreElementDrag(previousEditingId);
                          }

                          e?.evt && (e.evt.cancelBubble = true);

                          const esShift = e?.evt?.shiftKey;

                          setElementosSeleccionados((prev) => {

                            if (esShift) {
                              if (prev.includes(id)) {
                                return prev.filter((x) => x !== id);
                              } else {
                                return [...prev, id];
                              }
                            } else {
                              return [id];
                            }
                          });
                        }}


                        onChange={(id, nuevo) => {


                          // ?? NUEVO: Manejar preview inmediato de drag grupal
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

                          // ?? MANEJAR SOLO batch update final de drag grupal
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

                          // ?? NO procesar si viene del Transform
                          if (nuevo.fromTransform) {

                            return;
                          }

                          const objOriginal = objetos.find((o) => o.id === id);
                          if (!objOriginal) return;

                          // ?? Para drag final, procesar inmediatamente
                          if (nuevo.finalizoDrag) {

                            const { nuevaSeccion, coordenadasAjustadas } = determinarNuevaSeccion(
                              nuevo.y,
                              objOriginal.seccionId,
                              seccionesOrdenadas
                            );

                            let coordenadasFinales = { ...nuevo };
                            delete coordenadasFinales.finalizoDrag;

                            if (nuevaSeccion) {
                              coordenadasFinales = {
                                ...coordenadasFinales,
                                ...coordenadasAjustadas,
                                seccionId: nuevaSeccion
                              };
                            } else {
                              coordenadasFinales.y = convertirAbsARel(
                                nuevo.y,
                                objOriginal.seccionId,
                                seccionesOrdenadas
                              );
                            }

                            // 1) Determinar secciÃ³n final
                            const seccionFinalId = coordenadasFinales.seccionId || objOriginal.seccionId;

                            // 2) Obtener yRelPx (y relativa dentro de la secciÃ³n en px)
                            let yRelPx;

                            if (nuevaSeccion) {
                              // coordenadasAjustadas normalmente ya trae y relativa
                              yRelPx = Number.isFinite(coordenadasFinales.y) ? coordenadasFinales.y : 0;
                            } else {
                              // si no cambiÃ³ de secciÃ³n, convertimos desde y absoluta
                              yRelPx = Number.isFinite(coordenadasFinales.y) ? coordenadasFinales.y : 0;
                            }

                            // 3) Aplicar polÃ­tica pantalla: guardar yNorm
                            if (esSeccionPantallaById(seccionFinalId)) {
                              const yNorm = Math.max(0, Math.min(1, yRelPx / ALTURA_PANTALLA_EDITOR));
                              coordenadasFinales.yNorm = yNorm;
                              delete coordenadasFinales.y; // ? clave: evitamos mezclar sistemas
                            } else {
                              // fijo: guardar y en px
                              coordenadasFinales.y = yRelPx;
                              delete coordenadasFinales.yNorm;
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

                          // ?? Para otros cambios (transform, etc.)
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
                        onDragStartPersonalizado={isInEditMode ? null : (dragId = obj.id, e) => {
                          const seleccionActual = Array.isArray(window._elementosSeleccionados)
                            ? window._elementosSeleccionados
                            : elementosSeleccionados;

                          if (!seleccionActual.includes(dragId)) {
                            setElementosSeleccionados([dragId]);
                          }

                          flushSync(() => {
                            setHoverId(null);
                            setElementosPreSeleccionados([]);
                            setIsDragging(true);
                          });
                        }}
                        onDragEndPersonalizado={isInEditMode ? null : () => {
                          setIsDragging(false);
                          configurarDragEnd([]);
                        }}
                        onDragMovePersonalizado={isInEditMode ? null : (pos, elementId) => {
                          mostrarGuias(pos, elementId, objetos, elementRefs);
                          if (elementosSeleccionados.includes(elementId)) {
                            requestAnimationFrame(() => {
                              if (typeof actualizarPosicionBotonOpciones === 'function') {
                                actualizarPosicionBotonOpciones();
                              }
                            });
                          }
                        }}
                        dragStartPos={dragStartPos}
                        hasDragged={hasDragged}
                      />
                    );
                  })}



                  {seleccionActiva && areaSeleccion && (
                    <Rect
                      name="ui"
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
                        selectedElements={elementosSeleccionados}
                        elementRefs={elementRefs}
                        objetos={objetos}
                        isDragging={isDragging}
                        isMobile={isMobile}
                        onTransformInteractionStart={handleTransformInteractionStart}
                        onTransformInteractionEnd={handleTransformInteractionEnd}
                        onTransform={(newAttrs) => {
                          if (elementosSeleccionados.length === 1) {
                            const id = elementosSeleccionados[0];
                            const objIndex = objetos.findIndex(o => o.id === id);

                            if (objIndex !== -1) {

                              if (newAttrs.isPreview) {
                                // Preview: actualizaciÃ³n sin historial
                                setObjetos(prev => {
                                  const nuevos = [...prev];
                                  const elemento = nuevos[objIndex];
                                  // Countdown: durante preview dejamos que Konva escale el nodo
                                  // sin tocar estado React para evitar desincronizaciÃ³n con Transformer.
                                  if (
                                    elemento.tipo === "countdown" ||
                                    (
                                      elemento.tipo === "forma" &&
                                      (elemento.figura === "circle" || elemento.figura === "triangle")
                                    )
                                  ) {
                                    return prev;
                                  }

                                  if (elemento.tipo === "texto" && Number.isFinite(newAttrs.fontSize)) {
                                    // Para texto dejamos que Konva haga el preview de escala en vivo.
                                    // Actualizar estado React en cada frame genera micro-jitter visual.
                                    return prev;
                                  }

                                  const updatedElement = {
                                    ...elemento,
                                    rotation: newAttrs.rotation || elemento.rotation || 0
                                  };

                                  if (elemento.tipo === "galeria") {
                                    const galleryMetrics = normalizarMedidasGaleria(
                                      elemento,
                                      newAttrs.width,
                                      newAttrs.x
                                    );
                                    updatedElement.width = galleryMetrics.width;
                                    updatedElement.height = galleryMetrics.height;
                                    updatedElement.widthPct = galleryMetrics.widthPct;
                                    updatedElement.x = galleryMetrics.x;
                                    updatedElement.rotation = elemento.rotation || 0;
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

                                // ?? ACTUALIZAR POSICIÃ“N DEL BOTÃ“N DURANTE TRANSFORM
                                requestAnimationFrame(() => {
                                  if (typeof actualizarPosicionBotonOpciones === 'function') {
                                    actualizarPosicionBotonOpciones();
                                  }
                                });

                              } else if (newAttrs.isFinal) {
                                // Final: actualizaciÃ³n completa
                                window._resizeData = { isResizing: false };

                                const { isPreview, isFinal, ...cleanAttrs } = newAttrs;

                                // ?? CONVERTIR coordenadas absolutas a relativas ANTES de guardar
                                const objOriginal = objetos[objIndex];
                                let finalAttrs = {
                                  ...cleanAttrs,
                                  y: convertirAbsARel(cleanAttrs.y, objOriginal.seccionId, seccionesOrdenadas),
                                  fromTransform: true
                                };

                                // ? COUNTDOWN: conservar escala final del drag (sin reconversiÃ³n a chipWidth)
                                // para que el tamaÃ±o final coincida exactamente con lo soltado.
                                if (objOriginal.tipo === "texto" && Number.isFinite(cleanAttrs.fontSize)) {
                                  const requestedFontSize = Math.max(6, Number(cleanAttrs.fontSize) || 6);
                                  const originalFontSize = Number.isFinite(objOriginal.fontSize)
                                    ? objOriginal.fontSize
                                    : 24;
                                  const rotationFinal = Number.isFinite(cleanAttrs.rotation)
                                    ? cleanAttrs.rotation
                                    : (Number.isFinite(objOriginal.rotation) ? objOriginal.rotation : 0);
                                  const previousRotation = Number.isFinite(objOriginal.rotation)
                                    ? objOriginal.rotation
                                    : 0;
                                  const rotationChanged = Math.abs(rotationFinal - previousRotation) > 0.1;
                                  const fontSizeChanged = Math.abs(requestedFontSize - originalFontSize) > 0.05;
                                  const shouldMatchVisualWidth =
                                    objOriginal.__autoWidth !== false &&
                                    !Number.isFinite(objOriginal.width) &&
                                    !rotationChanged;
                                  const nextFontSize = shouldMatchVisualWidth
                                    ? ajustarFontSizeAAnchoVisual(
                                      objOriginal,
                                      requestedFontSize,
                                      cleanAttrs.textVisualWidth
                                    )
                                    : requestedFontSize;
                                  const shouldUseNodePose =
                                    rotationChanged &&
                                    !fontSizeChanged &&
                                    Number.isFinite(cleanAttrs.x) &&
                                    Number.isFinite(cleanAttrs.y);
                                  const centeredPosAbs = shouldUseNodePose
                                    ? { x: Number(cleanAttrs.x), y: Number(cleanAttrs.y) }
                                    : calcularPosTextoDesdeCentro(
                                      objOriginal,
                                      nextFontSize,
                                      cleanAttrs.textCenterX,
                                      cleanAttrs.textCenterY,
                                      rotationFinal
                                    );
                                  const centeredX = centeredPosAbs.x;
                                  const centeredYAbs = centeredPosAbs.y;
                                  const centeredY = Number.isFinite(centeredYAbs)
                                    ? convertirAbsARel(
                                      centeredYAbs,
                                      objOriginal.seccionId,
                                      seccionesOrdenadas
                                    )
                                    : (Number.isFinite(objOriginal.y) ? objOriginal.y : 0);
                                  textResizeDebug("transform-final:text", {
                                    id: objOriginal?.id ?? null,
                                    requestedFontSize,
                                    nextFontSize,
                                    shouldMatchVisualWidth,
                                    cleanFontSize: cleanAttrs.fontSize ?? null,
                                    textVisualWidth: cleanAttrs.textVisualWidth ?? null,
                                    textCenterX: cleanAttrs.textCenterX ?? null,
                                    textCenterY: cleanAttrs.textCenterY ?? null,
                                    rotationFinal,
                                    rotationChanged,
                                    fontSizeChanged,
                                    shouldUseNodePose,
                                    centeredX,
                                    centeredYAbs,
                                    centeredY,
                                    originalX: objOriginal?.x ?? null,
                                    originalY: objOriginal?.y ?? null,
                                  });
                                  finalAttrs = {
                                    ...finalAttrs,
                                    fontSize: nextFontSize,
                                    x: Number.isFinite(centeredX)
                                      ? centeredX
                                      : (Number.isFinite(objOriginal.x) ? objOriginal.x : 0),
                                    y: centeredY,
                                    scaleX: 1,
                                    scaleY: 1,
                                  };
                                  delete finalAttrs.textCenterX;
                                  delete finalAttrs.textCenterY;
                                  delete finalAttrs.textVisualWidth;
                                  textResizeDebug("transform-final:text-attrs", {
                                    id: objOriginal?.id ?? null,
                                    finalFontSize: finalAttrs.fontSize ?? null,
                                    finalX: finalAttrs.x ?? null,
                                    finalY: finalAttrs.y ?? null,
                                  });
                                } else if (objOriginal.tipo === "countdown") {
                                  finalAttrs = {
                                    ...finalAttrs,
                                    scaleX: Number.isFinite(cleanAttrs.scaleX) ? cleanAttrs.scaleX : (objOriginal.scaleX ?? 1),
                                    scaleY: Number.isFinite(cleanAttrs.scaleY) ? cleanAttrs.scaleY : (objOriginal.scaleY ?? 1),
                                  };
                                  delete finalAttrs.width;
                                  delete finalAttrs.height;
                                } else if (objOriginal.tipo === "forma" && objOriginal.figura === "circle") {
                                  finalAttrs = {
                                    ...finalAttrs,
                                    x: Number.isFinite(cleanAttrs.x) ? cleanAttrs.x : (objOriginal.x || 0),
                                    radius: Number.isFinite(cleanAttrs.radius)
                                      ? cleanAttrs.radius
                                      : (objOriginal.radius || 50),
                                    scaleX: 1,
                                    scaleY: 1,
                                  };
                                  delete finalAttrs.width;
                                  delete finalAttrs.height;
                                } else if (objOriginal.tipo === "forma" && objOriginal.figura === "triangle") {
                                  finalAttrs = {
                                    ...finalAttrs,
                                    x: Number.isFinite(cleanAttrs.x) ? cleanAttrs.x : (objOriginal.x || 0),
                                    radius: Number.isFinite(cleanAttrs.radius)
                                      ? cleanAttrs.radius
                                      : (objOriginal.radius || 60),
                                    scaleX: 1,
                                    scaleY: 1,
                                  };
                                  delete finalAttrs.width;
                                  delete finalAttrs.height;
                                } else if (objOriginal.tipo === "galeria") {
                                  const galleryMetrics = normalizarMedidasGaleria(
                                    objOriginal,
                                    cleanAttrs.width,
                                    cleanAttrs.x
                                  );
                                  finalAttrs = {
                                    ...finalAttrs,
                                    x: galleryMetrics.x,
                                    width: galleryMetrics.width,
                                    height: galleryMetrics.height,
                                    widthPct: galleryMetrics.widthPct,
                                    rotation: objOriginal.rotation || 0,
                                    scaleX: 1,
                                    scaleY: 1,
                                  };
                                }

                                // ? offsetY solo para debug (evita ReferenceError)
                                let offsetY = 0;
                                try {
                                  const idx = seccionesOrdenadas.findIndex(s => s.id === objOriginal.seccionId);
                                  const safe = idx >= 0 ? idx : 0;
                                  // Nota: en tu cÃ³digo lo llamÃ¡s a veces con 2 params, a veces con 3.
                                  // AcÃ¡ usamos 3, consistente con otras partes del archivo.
                                  offsetY = calcularOffsetY(seccionesOrdenadas, safe, altoCanvas) || 0;
                                } catch {
                                  offsetY = 0;
                                }

                                if (objOriginal.tipo === "countdown" || objOriginal.tipo === "texto") {
                                  if (objOriginal.tipo === "texto") {
                                    const commitSnapshot = {
                                      id: objOriginal?.id ?? null,
                                      finalFontSize: finalAttrs.fontSize ?? null,
                                      finalX: finalAttrs.x ?? null,
                                      finalY: finalAttrs.y ?? null,
                                      seccionId: objOriginal?.seccionId ?? null,
                                    };
                                    textResizeDebug("transform-final:commit", {
                                      ...commitSnapshot,
                                    });
                                    if (isTextResizeDebugEnabled()) {
                                      requestAnimationFrame(() => {
                                        requestAnimationFrame(() => {
                                          const nodeAfterCommit = elementRefs.current?.[commitSnapshot.id];
                                          if (!nodeAfterCommit) {
                                            textResizeDebug("transform-final:post-render:no-node", {
                                              id: commitSnapshot.id,
                                            });
                                            return;
                                          }
                                          try {
                                            const rectAfterCommit = nodeAfterCommit.getClientRect({
                                              skipTransform: false,
                                              skipShadow: true,
                                              skipStroke: true,
                                            });
                                            textResizeDebug("transform-final:post-render", {
                                              ...commitSnapshot,
                                              nodeX: typeof nodeAfterCommit.x === "function" ? nodeAfterCommit.x() : null,
                                              nodeY: typeof nodeAfterCommit.y === "function" ? nodeAfterCommit.y() : null,
                                              nodeScaleX:
                                                typeof nodeAfterCommit.scaleX === "function"
                                                  ? nodeAfterCommit.scaleX()
                                                  : null,
                                              nodeScaleY:
                                                typeof nodeAfterCommit.scaleY === "function"
                                                  ? nodeAfterCommit.scaleY()
                                                  : null,
                                              nodeFontSize:
                                                typeof nodeAfterCommit.fontSize === "function"
                                                  ? nodeAfterCommit.fontSize()
                                                  : null,
                                              nodeRectWidth:
                                                Number.isFinite(rectAfterCommit?.width)
                                                  ? rectAfterCommit.width
                                                  : null,
                                              nodeRectHeight:
                                                Number.isFinite(rectAfterCommit?.height)
                                                  ? rectAfterCommit.height
                                                  : null,
                                            });
                                          } catch (err) {
                                            textResizeDebug("transform-final:post-render:error", {
                                              id: commitSnapshot.id,
                                              message: err?.message || String(err),
                                            });
                                          }
                                        });
                                      });
                                    }
                                  }
                                  actualizarObjeto(objIndex, finalAttrs);
                                } else {
                                  requestAnimationFrame(() => {
                                    actualizarObjeto(objIndex, finalAttrs);
                                  });
                                }

                              }
                            }
                          }
                        }}
                      />
                    );
                  })()}


                  {/* No mostrar hover durante drag/resize/ediciÃ³n NI cuando hay lÃ­der de grupo */}
                  {!window._resizeData?.isResizing && !isDragging && !window._isDragging && !window._grupoLider && !editing.id && (
                    <HoverIndicator hoveredElement={hoverId} elementRefs={elementRefs} objetos={objetos} />
                  )}



                  {/* ?? Controles especiales para lÃ­neas seleccionadas */}
                  {elementosSeleccionados.length === 1 && (() => {
                    const elementoSeleccionado = objetos.find(obj => obj.id === elementosSeleccionados[0]);
                    if (elementoSeleccionado?.tipo === 'forma' && elementoSeleccionado?.figura === 'line') {
                      return (
                        <LineControls
                          name="ui"
                          key={`line-controls-${elementoSeleccionado.id}-${JSON.stringify(elementoSeleccionado.points)}`}
                          lineElement={elementoSeleccionado}
                          elementRefs={elementRefs}
                          onUpdateLine={actualizarLinea}
                          altoCanvas={altoCanvasDinamico}
                          isMobile={isMobile}
                          // ?? NUEVA PROP: Pasar informaciÃ³n sobre drag grupal
                          isDragGrupalActive={window._grupoLider !== null}
                          elementosSeleccionados={elementosSeleccionados}
                        />
                      );
                    }
                    return null;
                  })()}





                  {/* LÃ­neas de guÃ­a dinÃ¡micas mejoradas */}
                  {guiaLineas.map((linea, i) => {
                    // Determinar el estilo visual segÃºn el tipo
                    const esLineaSeccion = linea.priority === 'seccion';

                    return (
                      <Line
                        name="ui"
                        key={`${linea.type}-${i}`}
                        points={linea.points}
                        stroke={esLineaSeccion ? "#773dbe" : "#9333ea"} // Violeta mÃ¡s intenso para secciÃ³n
                        strokeWidth={esLineaSeccion ? 2 : 1} // LÃ­neas de secciÃ³n mÃ¡s gruesas
                        dash={linea.style === 'dashed' ? [8, 6] : undefined} // Punteado para elementos
                        opacity={esLineaSeccion ? 0.9 : 0.7} // LÃ­neas de secciÃ³n mÃ¡s opacas
                        listening={false}
                        perfectDrawEnabled={false}
                        // Efecto sutil de resplandor para lÃ­neas de secciÃ³n
                        shadowColor={esLineaSeccion ? "rgba(119, 61, 190, 0.3)" : undefined}
                        shadowBlur={esLineaSeccion ? 4 : 0}
                        shadowEnabled={esLineaSeccion}
                      />
                    );
                  })}


                </CanvasElementsLayer>

                {/* ? Overlay superior: borde de secciÃ³n activa SIEMPRE arriba de todo */}
                <CanvasElementsLayer>
                  {(() => {
                    if (!seccionActivaId) return null;

                    const index = seccionesOrdenadas.findIndex(s => s.id === seccionActivaId);
                    if (index === -1) return null;

                    const seccion = seccionesOrdenadas[index];
                    const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
                    const estaAnimando = seccionesAnimando.includes(seccion.id);

                    return (
                      <Rect
                        key={`overlay-border-seccion-${seccion.id}`}
                        x={0}
                        y={offsetY}
                        width={800}
                        height={seccion.altura}
                        fill="transparent"
                        stroke="#773dbe"
                        strokeWidth={estaAnimando ? 4 : 3}
                        cornerRadius={0}
                        shadowColor={estaAnimando ? "rgba(119, 61, 190, 0.4)" : "rgba(119, 61, 190, 0.25)"}
                        shadowBlur={estaAnimando ? 16 : 12}
                        shadowOffset={{ x: 0, y: estaAnimando ? 4 : 3 }}
                        listening={false}
                      />
                    );
                  })()}
                </CanvasElementsLayer>

              </Stage>
  );
}
