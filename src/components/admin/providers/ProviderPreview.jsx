import { Building2, BriefcaseBusiness } from "lucide-react";
import { PrivateProviderImage } from "./ProviderPhotos";
import styles from "./ProviderAdmin.module.css";

// Renders only the server allowlisted preview content. It never receives the
// canonical provider, owner, review notes, import provenance or history.
export default function ProviderPreview({ content, catalog, providerId, revision, version }) {
  const category = catalog.categories.find((item) => item.id === content.categoriaPrincipalId);
  const venue = category?.tipo === "lugar";
  const NeutralIcon = venue ? Building2 : BriefcaseBusiness;
  const serviceNames = (content.servicios || []).map((id) => catalog.services.find((item) => item.id === id)?.nombre).filter(Boolean);
  const featureNames = (content.espacio?.caracteristicas || []).map((id) => catalog.features.find((item) => item.id === id)?.nombre).filter(Boolean);
  const price = content.precio;
  const priceText = price?.modalidad === "desde" && price.importe > 0
    ? `Desde ${new Intl.NumberFormat("es-AR", { style: "currency", currency: price.moneda }).format(price.importe)} por ${price.unidad}`
    : "Consultar presupuesto";
  const contractLabels = { anticipacion: "Anticipación", incluye: "Qué incluye", duracion: "Duración", reserva: "Cómo se reserva" };
  const location = content.ubicacion || {};
  return (
    <div className={styles.preview} aria-label="Vista previa privada de la ficha">
      {content.imagenes?.portada ? <PrivateProviderImage providerId={providerId} image={content.imagenes.portada} className={styles.previewCover} /> : (
        <div className={styles.empty}><NeutralIcon size={64} aria-hidden="true" /><p>{category?.nombre || "Negocio"} · Sin fotografía</p></div>
      )}
      <div className={styles.previewBody}>
        <p className={styles.eyebrow}>Vista privada · {version} · Revisión {revision}</p>
        {content.imagenes?.logo && <div className={styles.previewLogo}><PrivateProviderImage providerId={providerId} image={content.imagenes.logo} /></div>}
        <h2>{content.nombre || "Nombre pendiente"}</h2>
        <p className={styles.muted}>{[category?.nombre, location.ciudad, location.provincia, location.pais].filter(Boolean).join(" · ") || "Ubicación pendiente"}</p>
        {content.descripcionCorta && <p className={styles.prose}>{content.descripcionCorta}</p>}
        {content.descripcion && <p className={styles.prose}>{content.descripcion}</p>}
        <h3>{priceText}</h3>
        <dl className={styles.definition}>
          {content.contacto?.whatsapp && <><dt>WhatsApp</dt><dd>{content.contacto.whatsapp}</dd></>}
          {content.contacto?.email && <><dt>Correo comercial</dt><dd>{content.contacto.email}</dd></>}
          {content.contacto?.telefono && <><dt>Teléfono</dt><dd>{content.contacto.telefono}</dd></>}
          {content.contacto?.sitioWeb && <><dt>Sitio web</dt><dd>{content.contacto.sitioWeb}</dd></>}
          {!venue && content.cobertura?.length > 0 && <><dt>Cobertura</dt><dd>{content.cobertura.join(", ")}</dd></>}
          {venue && location.direccion && <><dt>Establecimiento</dt><dd>{location.direccion}</dd></>}
          {venue && content.espacio?.capacidadMinima != null && <><dt>Capacidad mínima</dt><dd>{content.espacio.capacidadMinima} personas</dd></>}
          {venue && content.espacio?.capacidadMaxima != null && <><dt>Capacidad máxima</dt><dd>{content.espacio.capacidadMaxima} personas</dd></>}
          {venue && content.espacio?.cubierto != null && <><dt>Espacio cubierto</dt><dd>{content.espacio.cubierto ? "Sí" : "No"}</dd></>}
          {venue && content.espacio?.aireLibre != null && <><dt>Al aire libre</dt><dd>{content.espacio.aireLibre ? "Sí" : "No"}</dd></>}
          {venue && featureNames.length > 0 && <><dt>Características</dt><dd>{featureNames.join(", ")}</dd></>}
          {venue && location.coordenadas && <><dt>Coordenadas verificadas</dt><dd>{location.coordenadas.latitud}, {location.coordenadas.longitud}</dd></>}
          {serviceNames.length > 0 && <><dt>Servicios</dt><dd>{serviceNames.join(", ")}</dd></>}
          {Object.entries(content.redesSociales || {}).filter(([key, value]) => key !== "otras" && typeof value === "string" && value).map(([key, value]) => <div key={key} className={styles.definitionRow}><dt>{key.charAt(0).toUpperCase() + key.slice(1)}</dt><dd>{value}</dd></div>)}
        </dl>
        {Object.entries(contractLabels).filter(([key]) => content.contratacion?.[key]?.trim()).map(([key, label]) => <div key={key}><h3>{label}</h3><p className={styles.prose}>{content.contratacion[key]}</p></div>)}
        {content.imagenes?.galeria?.length > 0 && <div className={styles.gallery}>{content.imagenes.galeria.map((image) => <PrivateProviderImage key={image.id} providerId={providerId} image={image} />)}</div>}
        <p className={styles.hint}>Vista administrativa. El directorio público permanece desactivado y los contactos no se activan desde esta vista.</p>
      </div>
    </div>
  );
}
