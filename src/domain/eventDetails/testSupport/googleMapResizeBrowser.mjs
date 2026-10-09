import React, { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Stage, Layer, Group, Image as KonvaImage, Rect } from "react-konva";
import useGoogleMapImage from "../../../hooks/useGoogleMapImage.js";
import { buildGoogleMapsStaticImageSrc, buildGoogleMapsStaticLocationKey } from "../googleMapsStatic.js";
import { resolveGoogleMapDimensions } from "../googleMapGeometry.js";
import { resolveGoogleMapNodeTransformPatch, syncCommittedGoogleMapGeometry } from "../../../components/editor/textSystem/render/konva/googleMapTransform.js";

function CommittedMapGeometry({ nodeRef, object }) {
  useLayoutEffect(() => {
    syncCommittedGoogleMapGeometry(nodeRef.current, object);
  }, [nodeRef, object.width, object.height, object.scaleX, object.scaleY]);
  return null;
}

// Mount the real geometry, transform, image lifecycle and React/Konva bindings.
// This small scene deliberately omits the full editor and its remote services.
function MapResizeProbe() {
  const [object, setObject] = useState({
    id: "synthetic-map", tipo: "mapa-google", width: 361, height: 220,
    scaleX: 1, scaleY: 1, googlePlaceId: "synthetic-place-a",
    googleLat: -34.6, googleLng: -58.4, mostrarMapa: true,
  });
  const nodeRef = useRef(null);
  const imageRef = useRef(null);
  const { width, height } = resolveGoogleMapDimensions(object);
  const source = buildGoogleMapsStaticImageSrc(object, { apiKey: "synthetic-test-key" });
  const image = useGoogleMapImage(source, buildGoogleMapsStaticLocationKey(object));
  const clip = (context) => {
    context.beginPath(); context.roundRect(0, 0, width, height, 10); context.closePath();
  };
  useLayoutEffect(() => {
    globalThis.mapResizeProbe = {
      snapshot() {
        const node = nodeRef.current;
        return {
          width: object.width, height: object.height,
          nodeWidth: node.width(), nodeHeight: node.height(),
          scaleX: node.scaleX(), scaleY: node.scaleY(),
          visibleWidth: node.width() * node.scaleX(), visibleHeight: node.height() * node.scaleY(),
          requestedSize: new URL(source).searchParams.get("size"),
          hasImage: Boolean(image), requestedSource: source, imageSource: image?.src || null,
          imageWidth: imageRef.current?.width() ?? null, imageHeight: imageRef.current?.height() ?? null,
        };
      },
      drag(scaleX, scaleY) {
        nodeRef.current.scale({ x: scaleX, y: scaleY });
        nodeRef.current.getLayer().draw();
      },
      commit() {
        const patch = resolveGoogleMapNodeTransformPatch(nodeRef.current, object);
        flushSync(() => setObject((previous) => ({ ...previous, ...patch })));
      },
      changeLocation() {
        flushSync(() => setObject((previous) => ({
          ...previous, googlePlaceId: "synthetic-place-b", googleLat: -35, googleLng: -57,
        })));
      },
    };
  });
  return React.createElement(Stage, { width: 1100, height: 680 },
    React.createElement(Layer, null,
      React.createElement(Group, { ref: nodeRef, x: 20, y: 20, width, height, scaleX: object.scaleX, scaleY: object.scaleY },
        image
          ? React.createElement(Group, { clipFunc: clip, listening: false },
            React.createElement(KonvaImage, { ref: imageRef, image, width, height, listening: false }))
          : React.createElement(Rect, { width, height, fill: "#eef2f7", cornerRadius: 10 }),
        React.createElement(Rect, { width, height, stroke: "#773dbe", strokeWidth: 1, cornerRadius: 10, listening: false })
      ),
      React.createElement(CommittedMapGeometry, { nodeRef, object })
    )
  );
}

createRoot(globalThis.document.querySelector("#app")).render(React.createElement(MapResizeProbe));
