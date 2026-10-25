import { useEffect, useState } from "react";
import { ImageIcon, ArrowUp, ArrowDown } from "lucide-react";
import { readProviderImage, uploadProviderImage } from "@/domain/providers/adminApi";
import { assignUploadedProviderImages, moveGalleryImage, providerErrorMessage, removeProviderGalleryImage } from "@/domain/providers/adminForm";
import styles from "./ProviderAdmin.module.css";

export function PrivateProviderImage({ providerId, image, className = styles.photo }) {
  const [source, setSource] = useState(null);
  const [failed, setFailed] = useState(false);
  const path = image?.storagePath;
  useEffect(() => {
    let active = true;
    let objectUrl;
    setSource(null);
    setFailed(false);
    if (providerId && path) {
      readProviderImage(providerId, path).then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      }).catch(() => { if (active) setFailed(true); });
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [providerId, path]);
  if (!source) return <div className={styles.photoFallback}><ImageIcon aria-hidden="true" /><span>{failed ? "Imagen no disponible" : path ? "Cargando imagen privada…" : "Sin fotografía"}</span></div>;
  return <img className={className} src={source} alt={image.alt || "Fotografía del negocio"} />;
}

export default function ProviderPhotos({ providerId, images, setImages, limits, onError, onUploadingChange }) {
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  async function upload(event, role) {
    const selectedFiles = Array.from(event.target.files || []);
    const files = role === "galeria" ? selectedFiles : selectedFiles.slice(0, 1);
    event.target.value = "";
    if (!files.length) return;
    setUploading(true);
    onUploadingChange?.(true);
    setUploadMessage("");
    const added = [];
    try {
      for (const file of files) {
        if (!file.size || (limits?.maxBytes && file.size > limits.maxBytes)) throw new Error("La imagen está vacía o supera el tamaño permitido.");
        if (limits?.mimeTypes && !limits.mimeTypes.includes(file.type)) throw new Error("El formato de imagen no está permitido.");
        const image = await uploadProviderImage(providerId, file);
        added.push(image);
      }
      setUploadMessage(role === "galeria" ? `${added.length} imagen(es) agregada(s) a la galería. Guardá el borrador para conservar la selección.` : `${role === "logo" ? "Logo cargado" : "Portada cargada"}. Guardá el borrador para conservar la selección.`);
    } catch (error) {
      onError(providerErrorMessage(error));
    } finally {
      // Successful preceding uploads remain selectable even if a later file failed.
      if (added.length) setImages(assignUploadedProviderImages(images, added, role));
      setUploading(false);
      onUploadingChange?.(false);
    }
  }
  return (
    <div className={styles.panel}>
      <h2>Fotos</h2>
      <p className={styles.muted}>Las imágenes son opcionales. Los cambios se guardan en el borrador y necesitan aprobación.</p>
      {!providerId ? <p className={styles.notice}>Guardá el borrador para comenzar a cargar fotos privadas.</p> : (
        <div className={styles.grid}>
          {[["portada", "Cargar portada"], ["logo", "Cargar logo"], ["galeria", "Agregar imágenes a la galería"]].map(([role, label]) => <label className={`${styles.field} ${role === "galeria" ? styles.wide : ""}`} key={role}>
            <span>{label}</span>
            <input type="file" multiple={role === "galeria"} accept={limits?.mimeTypes?.join(",") || "image/jpeg,image/png,image/webp,image/gif,image/avif"} disabled={uploading} onChange={(event) => void upload(event, role)} />
            {role === "logo" && <span className={styles.hint}>El logo es independiente y no se agrega a la galería.</span>}
          </label>)}
          <p className={`${styles.hint} ${styles.wide}`}>{limits?.maxBytes ? `Hasta ${Math.round(limits.maxBytes / 1024 / 1024)} MB por imagen nueva. ` : ""}Quitar una foto de la galería conserva su selección como portada o logo.</p>
        </div>
      )}
      {uploading && <p role="status">Cargando imágenes privadas…</p>}
      {uploadMessage && <p role="status" className={styles.notice}>{uploadMessage}</p>}
      <div className={styles.gallery}>
        {[ ["portada", "Portada"], ["logo", "Logo"] ].map(([role, label]) => images[role] && (
          <div key={role} className={styles.photoItem}>
            <PrivateProviderImage providerId={providerId} image={images[role]} />
            <p>{label}</p>
            <button type="button" className={styles.button} disabled={uploading} onClick={() => setImages({ ...images, [role]: null })}>Quitar {label.toLowerCase()}</button>
          </div>
        ))}
      </div>
      <div className={styles.gallery}>
        {images.galeria.map((image, index) => (
          <div className={styles.photoItem} key={image.id}>
            <PrivateProviderImage providerId={providerId} image={image} />
            <label className={styles.field}><span>Descripción de la imagen {index + 1}</span><input value={image.alt || ""} onChange={(event) => setImages({ ...images, galeria: images.galeria.map((entry) => entry.id === image.id ? { ...entry, alt: event.target.value } : entry) })} /></label>
            <div className={styles.actions}>
              <button type="button" className={styles.button} disabled={uploading || index === 0} aria-label={`Subir imagen ${index + 1}`} onClick={() => setImages({ ...images, galeria: moveGalleryImage(images.galeria, index, -1) })}><ArrowUp size={16} /></button>
              <button type="button" className={styles.button} disabled={uploading || index === images.galeria.length - 1} aria-label={`Bajar imagen ${index + 1}`} onClick={() => setImages({ ...images, galeria: moveGalleryImage(images.galeria, index, 1) })}><ArrowDown size={16} /></button>
              <button type="button" className={styles.button} disabled={uploading} onClick={() => setImages({ ...images, portada: { ...image, tipo: "portada" } })}>Usar de portada</button>
              <button type="button" className={styles.button} disabled={uploading} onClick={() => setImages({ ...images, logo: { ...image, tipo: "logo" } })}>Usar de logo</button>
              <button type="button" className={styles.button} disabled={uploading} onClick={() => setImages(removeProviderGalleryImage(images, image.id))}>Quitar de galería {index + 1}</button>
            </div>
          </div>
        ))}
      </div>
      {!images.portada && !images.logo && !images.galeria.length && <p className={styles.notice}>Sin fotos: la vista previa utiliza una representación neutra de la categoría.</p>}
    </div>
  );
}
