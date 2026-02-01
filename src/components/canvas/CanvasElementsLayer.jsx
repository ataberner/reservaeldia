// src/components/canvas/CanvasElementsLayer.jsx
import React from "react";
import { Layer } from "react-konva";

export default function CanvasElementsLayer({ children }) {
  return <Layer>{children}</Layer>;
}
