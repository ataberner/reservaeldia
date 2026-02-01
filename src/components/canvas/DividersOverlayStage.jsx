// src/components/canvas/DividersOverlayStage.jsx
import React from "react";
import { Stage, Group, Line } from "react-konva";
import CanvasElementsLayer from "@/components/canvas/CanvasElementsLayer";

/**
 * Stage secundario (overlay) que dibuja líneas divisorias laterales
 * cuando zoom === 0.8. Mantiene exactamente la lógica original.
 */
export default function DividersOverlayStage({
  zoom,
  altoCanvasDinamico,
  seccionesOrdenadas,
}) {
  if (zoom !== 0.8) return null;

  return (
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
      <CanvasElementsLayer>
        {seccionesOrdenadas.slice(0, -1).map((seccion, index) => {
          let alturaAcumulada = 0;
          for (let i = 0; i <= index; i++) {
            alturaAcumulada += seccionesOrdenadas[i].altura;
          }

          return (
            <Group key={`dividers-secondary-${seccion.id}`}>
              {/* Línea izquierda - PEGADA al borde izquierdo del canvas */}
              <Line
                name="ui"
                points={[210, alturaAcumulada, 10, alturaAcumulada]} // ✅ DESDE X=210 (borde real del canvas) HACIA X=10
                stroke="#999999"
                strokeWidth={1}
                opacity={0.6}
                dash={[3, 3]} // ✅ PUNTOS CORTOS
                listening={false}
              />

              {/* Línea derecha - PEGADA al borde derecho del canvas */}
              <Line
                name="ui"
                points={[1010, alturaAcumulada, 1210, alturaAcumulada]} // ✅ DESDE X=1010 (borde real del canvas) HACIA X=1210
                stroke="#999999"
                strokeWidth={1}
                opacity={0.6}
                dash={[3, 3]} // ✅ PUNTOS CORTOS
                listening={false}
              />
            </Group>
          );
        })}
      </CanvasElementsLayer>
    </Stage>
  );
}
