import { ArrowUpRight, MapPin, Users } from "lucide-react";
import ProviderDirectoryImage from "../marketplace/ProviderDirectoryImage";
import { directoryCapacity, directoryPrice } from "@/domain/providers/directoryModel";
import styles from "./VenuesLanding.module.css";

export default function VenueResultCard({ provider, categories, selected, onSelect }) {
  const category = categories.find((entry) => entry.id === provider.categoriaPrincipalId);
  const location = [provider.ubicacion?.ciudad, provider.ubicacion?.provincia].filter(Boolean).join(", ");
  const coordinates = provider.ubicacion?.coordenadas;
  return <article id={`venue-${provider.id}`} className={`${styles.venueCard} ${selected ? styles.selectedCard : ""}`}>
    <a className={styles.cardImageLink} href={`/proveedor/?id=${encodeURIComponent(provider.id)}`} tabIndex={-1} aria-hidden="true"><ProviderDirectoryImage providerId={provider.id} approvedRevision={provider.approvedRevision} image={provider.portada} kind="lugar" className={styles.cardImage} /></a>
    <div className={styles.cardBody}>
      <p className={styles.cardCategory}>{category?.nombre || "Lugar para casamientos"}</p>
      <h2><a href={`/proveedor/?id=${encodeURIComponent(provider.id)}`}>{provider.nombre}<ArrowUpRight size={18} aria-hidden="true" /></a></h2>
      <p className={styles.cardMeta}><MapPin size={15} aria-hidden="true" />{location || "Ubicación sin informar"}</p>
      <p className={styles.cardMeta}><Users size={15} aria-hidden="true" />{directoryCapacity(provider.espacio)}</p>
      <p className={styles.cardSummary}>{provider.descripcionCorta}</p>
      <div className={styles.cardFooter}><span>{directoryPrice(provider.precio)}</span>{coordinates && <button type="button" onClick={() => onSelect(provider.id)} aria-pressed={selected} aria-label={`Ubicar ${provider.nombre} en el mapa`}><MapPin size={16} aria-hidden="true" />Mapa</button>}</div>
    </div>
  </article>;
}
