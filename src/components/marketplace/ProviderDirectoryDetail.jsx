import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft, Mail, MessageCircle } from "lucide-react";
import { directoryCapacity, directoryContact, directoryLocation, directoryPrice, directoryPriceDate, directoryWebUrl } from "@/domain/providers/directoryModel";
import MarketplaceHeader from "./MarketplaceHeader";
import ProviderDirectoryImage from "./ProviderDirectoryImage";
import { ProviderDirectoryStatus } from "./ProviderDirectoryResults";
import useProviderDirectory from "./useProviderDirectory";
import styles from "./ProviderDirectory.module.css";

const CONTRACT_LABELS = { anticipacion: "¿Con cuánta anticipación contactar?", incluye: "¿Qué incluye el servicio?", duracion: "¿Cuánto dura?", reserva: "¿Cómo se reserva?" };
const SOCIAL_LABELS = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", pinterest: "Pinterest", linkedin: "LinkedIn", linktree: "Linktree" };

export function ProviderDirectoryContent({ provider, catalog, busy, onContact }) {
  const { id, approvedRevision, content } = provider;
  const category = catalog.categories.find((entry) => entry.id === content.categoriaPrincipalId);
  const kind = category?.tipo || "profesional";
  const venue = kind === "lugar";
  const location = content.ubicacion || {};
  const space = content.espacio || {};
  const services = (content.servicios || []).map((serviceId) => catalog.services.find((entry) => entry.id === serviceId)?.nombre).filter(Boolean);
  const features = (space.caracteristicas || []).map((featureId) => catalog.features.find((entry) => entry.id === featureId)?.nombre).filter(Boolean);
  const website = directoryWebUrl(content.contacto?.sitioWeb);
  const socials = Object.entries(SOCIAL_LABELS).map(([key, label]) => ({ label, url: directoryWebUrl(content.redesSociales?.[key]) })).filter((entry) => entry.url);
  const coordinates = location.coordenadas;
  const mapUrl = venue && coordinates && Number.isFinite(coordinates.latitud) && Number.isFinite(coordinates.longitud)
    && Math.abs(coordinates.latitud) <= 90 && Math.abs(coordinates.longitud) <= 180
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coordinates.latitud},${coordinates.longitud}`)}` : null;
  return <article className={styles.detail} aria-label="Ficha aprobada del negocio">
    <Link href={venue ? "/lugares/" : "/profesionales/"} className={styles.back}><ArrowLeft size={18} aria-hidden="true" />Volver a {venue ? "lugares" : "profesionales"}</Link>
    <p className={styles.notice}>Directorio privado · Información aprobada</p>
    <ProviderDirectoryImage providerId={id} approvedRevision={approvedRevision} image={content.imagenes?.portada} kind={kind} className={styles.cover} />
    <header className={styles.detailHeader}>
      {content.imagenes?.logo && <ProviderDirectoryImage providerId={id} approvedRevision={approvedRevision} image={content.imagenes.logo} kind={kind} className={styles.logo} />}
      <div><p className={styles.category}>{category?.nombre || "Negocio"}</p><h1>{content.nombre}</h1><p className={styles.body}>{directoryLocation(location) || "Ubicación sin informar"}</p></div>
    </header>
    <div className={styles.detailColumns}>
      <div>
        <section className={styles.section} aria-labelledby="provider-about"><h2 id="provider-about">Sobre el negocio</h2><p className={styles.lead}>{content.descripcionCorta}</p><p className={styles.prose}>{content.descripcion}</p></section>
        {services.length > 0 && <section className={styles.section}><h2>Servicios</h2><ul className={styles.tags}>{services.map((name) => <li key={name}>{name}</li>)}</ul></section>}
        <section className={styles.section} aria-labelledby="provider-location"><h2 id="provider-location">{venue ? "El lugar" : "Ubicación y cobertura"}</h2>
          <dl className={styles.definition}>
            <dt>Ubicación de referencia</dt><dd>{directoryLocation(location) || "Sin informar"}</dd>
            {!venue && <><dt>Zonas de cobertura</dt><dd>{content.cobertura?.length ? content.cobertura.join(", ") : "Sin informar"}</dd></>}
            {venue && <><dt>Dirección del establecimiento</dt><dd>{location.direccion || "Sin informar"}</dd><dt>Capacidad</dt><dd>{directoryCapacity(space)}</dd><dt>Espacio cubierto</dt><dd>{space.cubierto == null ? "Sin informar" : space.cubierto ? "Sí" : "No"}</dd><dt>Al aire libre</dt><dd>{space.aireLibre == null ? "Sin informar" : space.aireLibre ? "Sí" : "No"}</dd></>}
            {features.length > 0 && <><dt>Características</dt><dd>{features.join(", ")}</dd></>}
          </dl>
          {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer" className={styles.textLink}>Ver ubicación verificada en el mapa</a>}
        </section>
        {Object.entries(CONTRACT_LABELS).some(([key]) => content.contratacion?.[key]?.trim()) && <section className={styles.section}><h2>Información para contratar</h2>{Object.entries(CONTRACT_LABELS).filter(([key]) => content.contratacion?.[key]?.trim()).map(([key, label]) => <div className={styles.answer} key={key}><h3>{label}</h3><p className={styles.prose}>{content.contratacion[key]}</p></div>)}</section>}
      </div>
      <aside className={styles.contact} aria-label="Contacto comercial aprobado">
        <h2>{directoryPrice(content.precio)}</h2>
        {content.precio?.modalidad === "desde" && directoryPriceDate(content.precio.actualizadoEn) && <p className={styles.caption}>Precio orientativo actualizado el {directoryPriceDate(content.precio.actualizadoEn)}.</p>}
        <p className={styles.body}>Consultá directamente con el negocio para conocer su propuesta y disponibilidad.</p>
        <div className={styles.contactActions}>
          {directoryContact(content.contacto, "whatsapp") && <button type="button" className={styles.primary} disabled={busy} onClick={() => void onContact("whatsapp")}><MessageCircle size={18} aria-hidden="true" />Consultar por WhatsApp</button>}
          {directoryContact(content.contacto, "email") && <button type="button" className={styles.button} disabled={busy} onClick={() => void onContact("email")}><Mail size={18} aria-hidden="true" />Escribir por correo</button>}
        </div>
        {content.contacto?.email && <p className={styles.caption}>{content.contacto.email}</p>}
        {content.contacto?.telefono && <p className={styles.caption}>Teléfono: {content.contacto.telefono}</p>}
        {website && <a href={website} target="_blank" rel="noopener noreferrer" className={styles.textLink}>Sitio web del negocio</a>}
        {socials.length > 0 && <nav className={styles.socials} aria-label="Redes del negocio">{socials.map(({ label, url }) => <a key={label} href={url} target="_blank" rel="noopener noreferrer">{label}</a>)}</nav>}
      </aside>
    </div>
    {content.imagenes?.galeria?.length > 0 && <section className={styles.section} aria-labelledby="provider-gallery"><h2 id="provider-gallery">Galería</h2><div className={styles.gallery}>{content.imagenes.galeria.map((image) => <figure key={image.id}><ProviderDirectoryImage providerId={id} approvedRevision={approvedRevision} image={image} kind={kind} className={styles.galleryImage} />{image.alt && <figcaption className={styles.caption}>{image.alt}</figcaption>}</figure>)}</div></section>}
  </article>;
}

export default function ProviderDirectoryDetail({ user }) {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const state = useProviderDirectory({ id, userUid: user.uid });
  const category = state.catalog?.categories.find((entry) => entry.id === state.provider?.content.categoriaPrincipalId);
  async function contact(kind) {
    const current = await state.verifyContact();
    const destination = current && directoryContact(current, kind);
    if (destination) window.location.assign(destination);
  }
  return <><MarketplaceHeader user={user} current={category?.tipo === "lugar" ? "venues" : "professionals"} /><main className={styles.root}>
    <div className={styles.container}>
      {state.message && state.status === "ready" && <p className={styles.notice} role="status">{state.message}</p>}
      {state.status === "ready" && state.provider ? <ProviderDirectoryContent provider={state.provider} catalog={state.catalog} busy={state.busy} onContact={contact} /> : <ProviderDirectoryStatus state={state} backToDirectory />}
    </div>
  </main></>;
}
