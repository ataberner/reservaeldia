import { useEffect, useRef } from "react";
import useSharedImage from "./useSharedImage.js";

export default function useGoogleMapImage(src, locationKey) {
  const safeSrc = String(src || "").trim();
  const safeLocationKey = String(locationKey || "");
  const [loadedImage] = useSharedImage(safeSrc, "anonymous");
  const lastValidImage = useRef(null);
  // useSharedImage can still expose the previous source until its effect runs.
  const currentImage = safeSrc && loadedImage?.src === safeSrc ? loadedImage : null;

  useEffect(() => {
    if (currentImage && safeLocationKey) {
      lastValidImage.current = { locationKey: safeLocationKey, image: currentImage };
    }
  }, [currentImage, safeLocationKey]);

  if (!safeSrc || !safeLocationKey) return null;
  return currentImage || (
    lastValidImage.current?.locationKey === safeLocationKey
      ? lastValidImage.current.image
      : null
  );
}
