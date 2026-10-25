import { useEffect, useState } from "react";
import { Building2, BriefcaseBusiness } from "lucide-react";
import { readDirectoryImage } from "@/domain/providers/directoryApi";
import styles from "./ProviderDirectory.module.css";

export default function ProviderDirectoryImage({ providerId, approvedRevision, image, kind, className = "" }) {
  const [source, setSource] = useState(null);
  const [failed, setFailed] = useState(false);
  const imageId = image?.id;
  useEffect(() => {
    let active = true; let objectUrl;
    const controller = new AbortController();
    setSource(null); setFailed(false);
    if (imageId) readDirectoryImage(providerId, imageId, approvedRevision, controller.signal).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob); setSource(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [providerId, imageId, approvedRevision]);
  const Icon = kind === "lugar" ? Building2 : BriefcaseBusiness;
  return source ? <img className={`${styles.image} ${className}`} src={source} alt={image.alt || "Fotografía del negocio"} />
    : <div className={`${styles.imageFallback} ${className}`}><Icon size={40} aria-hidden="true" /><span>{failed ? "Imagen no disponible" : imageId ? "Cargando fotografía…" : "Sin fotografía"}</span></div>;
}
