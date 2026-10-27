import { useState } from "react";
import { ArrowLeft, Plus, Search, Store, ShieldCheck } from "lucide-react";
import { formatProviderDate, publicationLabels, providerReviewLabel } from "@/domain/providers/adminForm";
import ProviderFields, { Field } from "./ProviderFields";
import ProviderPreview from "./ProviderPreview";
import useProviderAdmin from "./useProviderAdmin";
import styles from "./ProviderAdmin.module.css";

const TABS = ["Información", "Publicación", "Responsable", "Historial"];
const ACTION_LABELS = { submit: "Enviar a revisión", approve: "Aprobar revisión", requestChanges: "Solicitar correcciones", pause: "Pausar ficha", archive: "Archivar ficha", resume: "Reactivar ficha" };
const HISTORY_LABELS = { create: "Ficha creada", save: "Borrador guardado", submit: "Enviada a revisión", approve: "Revisión aprobada", requestChanges: "Correcciones solicitadas", pause: "Ficha pausada", archive: "Ficha archivada", resume: "Ficha reactivada", uploadImage: "Imagen cargada" };

function Status({ provider }) {
  return <div className={styles.actions}><span className={styles.badge}>{publicationLabels[provider.publication.state] || provider.publication.state}</span><span className={`${styles.badge} ${styles.neutralBadge}`}>{providerReviewLabel(provider.review.status, provider.hasPendingChanges)}</span></div>;
}

export function ProviderList({ state, onOpen, onCreate }) {
  const { filters, setFilters, catalog, busy, items, page, nextCursor } = state;
  const ready = state.listStatus === "ready" && !busy && !state.error;
  const filter = (key, value) => setFilters((previous) => ({ ...previous, [key]: value }));
  return (
    <>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Administración · Beta privada</p><h1>Salones y profesionales</h1><p className={styles.muted}>Un lugar para preparar, revisar y administrar cada negocio.</p></div>
        <button type="button" className={styles.primary} onClick={onCreate} disabled={busy}><Plus size={18} aria-hidden="true" />Crear ficha</button>
      </header>
      <div className={styles.notice}><ShieldCheck size={18} className="inline mr-2" aria-hidden="true" />Directorio público desactivado. Las fichas y sus vistas previas permanecen privadas.</div>
      <div className={styles.panel} aria-busy={busy}>
        <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); void state.search(); }}>
          <Field label="Buscar por nombre o correo" value={filters.search} onChange={(value) => filter("search", value)} type="search" />
          <Field label="Categoría" value={filters.categoryId} onChange={(value) => filter("categoryId", value)} options={[["", "Todas"], ...catalog.categories.map((entry) => [entry.id, entry.nombre])]} />
          <Field label="Localidad" value={filters.city} onChange={(value) => filter("city", value)} />
          <Field label="Publicación" value={filters.publication} onChange={(value) => filter("publication", value)} options={[["", "Todas"], ["borrador", "Borrador"], ["publicada", "Publicada"], ["pausada", "Pausada"], ["archivada", "Archivada"]]} />
          <Field label="Responsable" value={filters.owner} onChange={(value) => filter("owner", value)} options={[["", "Todos"], ["plataforma", "Administrada por la plataforma"], ["responsable", "Con responsable"]]} />
          <Field label="Pendientes" value={filters.pending} onChange={(value) => filter("pending", value)} options={[["", "Todos"], ["true", "Con cambios pendientes"], ["false", "Sin cambios pendientes"]]} />
          <button className={styles.button} type="submit" disabled={busy}><Search size={16} aria-hidden="true" />Buscar fichas</button>
        </form>
        {busy && <p role="status" className={styles.notice}>Cargando fichas…</p>}
        {ready && (items.length === 0 ? <div className={styles.empty}><Store size={40} aria-hidden="true" /><h2>No hay coincidencias</h2><p className={styles.muted}>Probá otros filtros para encontrar una ficha.</p></div> : (
          <table className={styles.table}>
            <thead><tr><th scope="col">Negocio</th><th scope="col">Categoría y localidad</th><th scope="col">Publicación</th><th scope="col">Responsable</th><th scope="col">Revisión</th></tr></thead>
            <tbody>{items.map((item) => <tr key={item.id}>
              <td><button type="button" className={styles.businessName} onClick={() => onOpen(item.id)} disabled={busy}>{item.nombre || "Ficha sin nombre"}</button>{item.email && <p className={styles.hint}>{item.email}</p>}</td>
              <td data-label="Ubicación">{catalog.categories.find((category) => category.id === item.categoriaPrincipalId)?.nombre || "Sin categoría"}<p className={styles.hint}>{item.ciudad || "Localidad pendiente"}</p></td>
              <td data-label="Publicación"><span className={styles.badge}>{publicationLabels[item.publication] || item.publication}</span></td>
              <td data-label="Gestión">{item.ownerUserId ? "Con responsable" : "Plataforma"}</td>
              <td data-label="Revisión">{providerReviewLabel(item.reviewStatus, item.hasPendingChanges)}</td>
            </tr>)}</tbody>
          </table>
        ))}
        {ready && <div className={styles.row}><p className={styles.hint}>Página {page} · {items.length} fichas</p><div className={styles.actions}><button className={styles.button} type="button" disabled={page <= 1} onClick={() => void state.paginate(-1)}>Anterior</button><button className={styles.button} type="button" disabled={!nextCursor || !items.length} onClick={() => void state.paginate(1)}>Siguiente</button></div></div>}
      </div>
    </>
  );
}

function PublicationPanel({ state }) {
  const { provider, busy, dirty, reviewedRevision } = state;
  const [confirmAction, setConfirmAction] = useState(null);
  const [reason, setReason] = useState("");
  const awaitingReview = provider.review.status === "en_revision";
  const needsReason = ["requestChanges", "pause", "archive"].includes(confirmAction);
  function actionButton(action, disabled = false) {
    return <button type="button" className={action === "archive" ? styles.danger : styles.button} disabled={busy || dirty || disabled} onClick={() => { setConfirmAction(action); setReason(""); }}>{ACTION_LABELS[action]}</button>;
  }
  return (
    <div className={styles.panel}>
      <h2>Publicación y revisión</h2>
      <p className={styles.muted}>La aprobación corresponde a la revisión que abrís. No habilita el directorio público.</p>
      <dl className={styles.definition}>
        <dt>Borrador guardado</dt><dd>Revisión {provider.contentRevision}</dd>
        <dt>Versión aprobada</dt><dd>{provider.approved ? `Revisión ${provider.approved.revision} · ${formatProviderDate(provider.approved.approvedAt)}` : "Todavía no hay una versión aprobada"}</dd>
        <dt>Revisión enviada</dt><dd>{provider.review.revision ?? "Sin revisión enviada"}</dd>
      </dl>
      {provider.review.reason && <p className={styles.notice}>Correcciones: {provider.review.reason}</p>}
      {dirty && <p className={styles.notice}>Guardá los cambios antes de realizar acciones de publicación.</p>}
      <div className={`${styles.actions} mt-6`}>
        <button type="button" className={styles.button} disabled={busy} onClick={() => void state.showPreview("draft")}>Ver borrador guardado</button>
        {provider.review.content && <button type="button" className={styles.button} disabled={busy} onClick={() => void state.showPreview("review")}>Ver revisión enviada</button>}
        {provider.approved && <button type="button" className={styles.button} disabled={busy} onClick={() => void state.showPreview("approved")}>Ver versión aprobada</button>}
      </div>
      {state.preview && <ProviderPreview content={state.preview.content} providerId={provider.id} catalog={state.catalog} revision={state.preview.revision} version={{ draft: "borrador guardado", review: "revisión enviada", approved: "versión aprobada" }[state.preview.version]} />}
      {provider.publication.state !== "archivada" && <div className={`${styles.actions} mt-6`}>
        {actionButton("submit")}
        {awaitingReview && actionButton("approve", reviewedRevision !== provider.review.revision)}
        {awaitingReview && actionButton("requestChanges")}
        {provider.publication.state !== "pausada" && actionButton("pause")}
        {provider.publication.state === "pausada" && actionButton("resume", !provider.approved)}
        {actionButton("archive")}
      </div>}
      {awaitingReview && reviewedRevision !== provider.review.revision && <p className={`${styles.hint} mt-3`}>Abrí la revisión enviada para examinar el contenido antes de aprobar.</p>}
      {provider.publication.state === "archivada" && <p className={styles.notice}>La ficha está archivada. Se conservan los datos y el historial; no está disponible para el directorio.</p>}
      {confirmAction && <form className={styles.notice} aria-label="Confirmar acción sobre la ficha" onSubmit={async (event) => { event.preventDefault(); await state.transition(confirmAction, reason); setConfirmAction(null); }}>
        <h3>{ACTION_LABELS[confirmAction]}</h3>
        <p>{confirmAction === "approve" ? `Se aprobará exclusivamente la revisión ${provider.review.revision}. Una pausa vigente se conserva.` : confirmAction === "archive" ? "La ficha dejará de estar disponible. Se conservarán el historial y la cuenta del responsable." : confirmAction === "pause" ? "La ficha quedará retirada de la entrega del directorio. La versión aprobada se conserva." : "La acción quedará registrada en el historial administrativo."}</p>
        {needsReason && <Field label="Motivo de la acción" value={reason} type="textarea" required onChange={setReason} />}
        <div className={`${styles.actions} mt-3`}><button type="submit" className={styles.primary} disabled={busy || dirty || (needsReason && !reason.trim())}>Confirmar {ACTION_LABELS[confirmAction].toLowerCase()}</button><button type="button" className={styles.button} onClick={() => setConfirmAction(null)} disabled={busy}>Cancelar</button></div>
      </form>}
    </div>
  );
}

function OwnerPanel({ provider }) {
  return <div className={styles.panel}><h2>Responsable</h2><p className={styles.muted}>{provider.owner.userId ? "Esta ficha conserva su responsable existente." : "Reserva el Día administra esta ficha. Puede aprobarse sin asignar un responsable."}</p><dl className={styles.definition}><dt>Gestión</dt><dd>{provider.owner.userId ? "Responsable asignado" : "Administrada por la plataforma"}</dd>{provider.owner.userId && <><dt>Identidad del responsable</dt><dd>{provider.owner.userId}</dd></>}<dt>Permisos</dt><dd>Resueltos por el servidor. El correo comercial no asigna acceso.</dd></dl><p className={styles.notice}>Las invitaciones y la gestión de responsables se incorporan en una etapa posterior.</p></div>;
}

export function ProviderHistory({ history, hasMore, onLoadMore, busy }) {
  return <div className={styles.panel}><h2>Historial administrativo</h2><p className={styles.muted}>Acciones y campos modificados. Visible sólo para administración.</p>{!history.length ? <p className={styles.notice}>Todavía no hay acciones registradas en este flujo.</p> : <ol className={styles.history}>{history.map((entry) => <li key={entry.id}><div className={styles.row}><h3>{HISTORY_LABELS[entry.action] || entry.action}</h3><time className={styles.hint}>{formatProviderDate(entry.at)}</time></div><p className={styles.hint}>Actor: {entry.actorUid} · Revisión {entry.revision}</p>{entry.changedFields?.length > 0 && <p className={styles.hint}>Campos: {entry.changedFields.join(", ")}</p>}{entry.reason && <p>{entry.reason}</p>}</li>)}</ol>}{hasMore && <button type="button" className={styles.button} disabled={busy} onClick={onLoadMore}>Ver actividad anterior</button>}</div>;
}

export default function ProviderDirectoryAdmin() {
  const state = useProviderAdmin();
  const [tab, setTab] = useState("Información");
  const [discard, setDiscard] = useState(false);
  const [uploading, setUploading] = useState(false);
  const detail = state.provider || state.creating;
  const open = async (id) => { setTab("Información"); await state.open(id); };
  const create = () => { setTab("Información"); state.create(); };
  return (
    <div className={styles.shell}>
      <div className={`${styles.row} mb-6`}><a href="/admin/gestion-sitio/" className={styles.button}><ArrowLeft size={16} aria-hidden="true" />Administración</a><a href="/dashboard/">Mis invitaciones</a></div>
      {state.error && <div className={`${styles.notice} ${styles.error}`} role="alert"><p>{state.error}</p><button type="button" className={styles.button} disabled={state.busy} onClick={() => { if (state.dirty) setDiscard(true); else void state.reload(); }}>{!detail && state.catalog ? "Volver a intentar la búsqueda" : "Recargar versión actual"}</button></div>}
      {state.message && <p className={`${styles.notice} ${styles.success}`} role="status">{state.message}</p>}
      {!state.access && state.busy && <p role="status">Validando acceso a la beta…</p>}
      {state.access?.enabled && !state.catalog && state.busy && <p role="status">Preparando categorías y fichas…</p>}
      {state.access && !state.access.enabled && <div className={styles.panel}><h1>Beta privada cerrada</h1><p className={styles.muted}>La administración del directorio todavía no está habilitada en este entorno.</p></div>}
      {state.access?.enabled && state.catalog && !detail && <ProviderList state={state} onOpen={open} onCreate={create} />}
      {state.access?.enabled && state.catalog && detail && <>
        <header className={styles.header}><div><p className={styles.eyebrow}>Ficha del negocio · Beta privada</p><h1>{state.provider?.draft.nombre || "Nueva ficha"}</h1><p className={styles.muted}>{state.creating ? "Borrador nuevo · todavía sin guardar" : `Identificador permanente: ${state.provider.id}`}</p></div><button type="button" className={styles.button} onClick={() => { if (state.dirty) setDiscard(true); else void state.back(); }} disabled={state.busy || uploading}>Volver al listado</button></header>
        {state.provider && <Status provider={state.provider} />}
        {discard && <div className={styles.notice} role="alert"><p>Tenés cambios sin guardar. Podés seguir editando o descartarlos para cargar los datos guardados.</p><div className={styles.actions}><button type="button" className={styles.button} onClick={() => setDiscard(false)}>Seguir editando</button><button type="button" className={styles.danger} onClick={() => { setDiscard(false); if (state.error && state.provider) void state.reload(); else void state.back(); }}>Descartar cambios locales</button></div></div>}
        <nav className={styles.tabs} aria-label="Secciones de la ficha">{TABS.filter((label) => !state.creating || label === "Información").map((label) => <button key={label} type="button" disabled={uploading} className={`${styles.tab} ${tab === label ? styles.selectedTab : ""}`} aria-current={tab === label ? "page" : undefined} onClick={() => setTab(label)}>{label}</button>)}</nav>
        {tab === "Información" && <ProviderFields draft={state.draft} setField={state.setField} catalog={state.catalog} providerId={state.provider?.id} disabled={state.busy || uploading || state.provider?.publication.state === "archivada"} internalNotes={state.notes} setInternalNotes={state.setNotes} onError={state.setError} onUploadingChange={setUploading} />}
        {tab === "Publicación" && <PublicationPanel state={state} />}
        {tab === "Responsable" && <OwnerPanel provider={state.provider} />}
        {tab === "Historial" && <ProviderHistory history={state.provider.history || []} hasMore={Boolean(state.provider.historyCursor)} busy={state.busy} onLoadMore={() => void state.loadMoreHistory()} />}
        <div className={`${styles.saveBar} ${styles.row}`}><p role="status" className={styles.hint}>{uploading ? "Cargando imágenes privadas…" : state.busy ? "Procesando…" : state.dirty ? "Cambios sin guardar" : "Todos los cambios están guardados"}</p><button type="button" className={styles.primary} disabled={state.busy || uploading || !state.dirty || state.provider?.publication.state === "archivada"} onClick={() => void state.save()}>Guardar borrador</button></div>
      </>}
    </div>
  );
}
