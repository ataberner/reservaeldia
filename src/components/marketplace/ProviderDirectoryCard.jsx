import Link from "next/link";
import { MapPin, Users } from "lucide-react";
import { directoryCapacity, directoryLocation, directoryPrice } from "@/domain/providers/directoryModel";
import ProviderDirectoryImage from "./ProviderDirectoryImage";
import styles from "./ProviderDirectory.module.css";

export default function ProviderDirectoryCard({ provider, catalog, kind }) {
  const category = catalog.categories.find((entry) => entry.id === provider.categoriaPrincipalId);
  return <article className={styles.card}>
    <ProviderDirectoryImage providerId={provider.id} approvedRevision={provider.approvedRevision} image={provider.portada} kind={kind} className={styles.cardImage} />
    <div className={styles.cardBody}>
      <p className={styles.category}>{category?.nombre || "Negocio"}</p>
      <h3>{provider.nombre}</h3>
      <p className={styles.meta}><MapPin size={16} aria-hidden="true" />{directoryLocation(provider.ubicacion) || "Ubicación sin informar"}</p>
      {kind === "lugar" && <p className={styles.meta}><Users size={16} aria-hidden="true" />{directoryCapacity(provider.espacio)}</p>}
      <p className={styles.summary}>{provider.descripcionCorta}</p>
      <p className={styles.price}>{directoryPrice(provider.precio)}</p>
      <Link href={`/proveedor/?id=${encodeURIComponent(provider.id)}`} className={styles.cardLink} aria-label={`Ver ficha de ${provider.nombre}`}>Ver ficha <span aria-hidden="true">→</span></Link>
    </div>
  </article>;
}
