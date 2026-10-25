import { parseOptionalNumber } from "@/domain/providers/adminForm";
import ProviderPhotos from "./ProviderPhotos";
import styles from "./ProviderAdmin.module.css";

export function Field({ label, value, onChange, type = "text", hint, wide = false, options, ...props }) {
  return (
    <label className={`${styles.field} ${wide ? styles.wide : ""}`}>
      <span>{label}</span>
      {options ? (
        <select value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...props}>
          {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...props} />
      ) : (
        <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...props} />
      )}
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}

function Choices({ label, options, values = [], onChange }) {
  return (
    <fieldset className={styles.wide}>
      <legend className={styles.hint}>{label}</legend>
      <div className={styles.choices}>
        {options.map((option) => (
          <label key={option.id} className={styles.choice}>
            <input type="checkbox" checked={values.includes(option.id)} onChange={(event) => onChange(event.target.checked ? [...values, option.id] : values.filter((value) => value !== option.id))} />
            {option.nombre}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function ProviderFields({ draft, setField, catalog, providerId, disabled, internalNotes, setInternalNotes, onError, onUploadingChange }) {
  const categories = catalog.categories || [];
  const category = categories.find((entry) => entry.id === draft.categoriaPrincipalId);
  const venue = category?.tipo === "lugar";
  const selectedCategoryIds = [draft.categoriaPrincipalId, ...draft.categoriaIds];
  const services = (catalog.services || []).filter((entry) => entry.categoriaIds.some((id) => selectedCategoryIds.includes(id)));
  const additional = categories.filter((entry) => entry.id !== draft.categoriaPrincipalId && (entry.tipo === category?.tipo || draft.categoriaIds.includes(entry.id)));
  const field = (path, label, props = {}) => {
    const value = path.split(".").reduce((object, key) => object?.[key], draft);
    return <Field label={label} value={value} onChange={(next) => setField(path, next)} {...props} />;
  };
  const numberField = (path, label, props = {}) => {
    const value = path.split(".").reduce((object, key) => object?.[key], draft);
    return <Field label={label} value={value} type="number" onChange={(next) => setField(path, parseOptionalNumber(next))} {...props} />;
  };
  const triState = (path, label) => {
    const value = path.split(".").reduce((object, key) => object?.[key], draft);
    return <Field label={label} value={value === null ? "" : String(value)} options={[["", "Sin confirmar"], ["true", "Sí"], ["false", "No"]]} onChange={(next) => setField(path, next === "" ? null : next === "true")} />;
  };

  return (
    <fieldset disabled={disabled}>
      <div className={styles.panel}>
        <h2>Datos del negocio</h2>
        <p className={styles.muted}>Podés guardar una ficha incompleta y continuar después.</p>
        <div className={styles.grid}>
          {field("nombre", "Nombre comercial", { autoComplete: "organization", maxLength: Math.max(200, draft.nombre.length) })}
          <Field label="Categoría principal" value={draft.categoriaPrincipalId} onChange={(value) => {
            setField("categoriaPrincipalId", value || null);
            setField("categoriaIds", [value, ...draft.categoriaIds.filter((id) => id !== draft.categoriaPrincipalId && id !== value)].filter(Boolean));
          }} options={[["", "Elegir categoría"], ...categories.map((entry) => [entry.id, entry.nombre])]} />
          {field("descripcionCorta", "Descripción breve", { type: "textarea", wide: true, maxLength: 600 })}
          {field("descripcion", "Descripción completa", { type: "textarea", wide: true, rows: 6, maxLength: Math.max(20000, draft.descripcion.length) })}
          {field("contacto.whatsapp", "WhatsApp", { type: "tel", hint: "Número internacional con código de país, por ejemplo +549…" })}
          {field("contacto.email", "Correo comercial", { type: "email", autoComplete: "email" })}
          <Field label="Teléfono" type="tel" value={draft.contacto.telefonoOriginal} onChange={(value) => {
            setField("contacto.telefonoOriginal", value);
            setField("contacto.telefonoNormalizado", null);
          }} />
          {field("contacto.sitioWeb", "Sitio web", { type: "url", placeholder: "https://" })}
        </div>
        <details className={styles.details}>
          <summary>Categorías adicionales y redes sociales</summary>
          <div className={styles.grid}>
            {category && <Choices label="Categorías adicionales compatibles" options={additional} values={draft.categoriaIds.filter((id) => id !== draft.categoriaPrincipalId)} onChange={(values) => setField("categoriaIds", [draft.categoriaPrincipalId, ...values].filter(Boolean))} />}
            {["instagram", "facebook", "tiktok", "youtube", "pinterest", "linkedin", "linktree"].map((network) => (
              <Field key={network} label={network.charAt(0).toUpperCase() + network.slice(1)} value={draft.redesSociales[network]} type="url" placeholder="https://" onChange={(value) => setField(`redesSociales.${network}`, value)} />
            ))}
          </div>
        </details>
      </div>

      <div className={styles.panel}>
        <h2>Ubicación y cobertura</h2>
        <p className={styles.muted}>{venue ? "Informá la ubicación del establecimiento." : "La localidad de referencia es pública. La dirección particular no se muestra."}</p>
        <div className={styles.grid}>
          {field("ubicacion.ciudad", "Localidad")}
          {field("ubicacion.nivel1Nombre", "Provincia")}
          {field("ubicacion.paisCodigo", "País (código)", { maxLength: 2, placeholder: "AR", hint: "Código internacional de dos letras." })}
          {field("ubicacion.paisNombre", "Nombre del país", { placeholder: "Argentina" })}
          {venue ? field("ubicacion.direccionCompleta", "Dirección del establecimiento", { wide: true }) : (
            <Field label="Zonas de cobertura" type="textarea" wide value={draft.cobertura.join("\n")} onChange={(value) => setField("cobertura", value.split("\n"))} hint="Una zona por línea. Puede ser distinta de la ubicación del negocio." />
          )}
        </div>
        {venue && (
          <details className={styles.details}>
            <summary>Capacidad y características del espacio</summary>
            <p className={styles.muted}>Dejá en blanco lo que todavía no esté confirmado.</p>
            <div className={styles.grid}>
              {numberField("espacio.capacidadMinima", "Capacidad mínima", { min: 1, step: 1 })}
              {numberField("espacio.capacidadMaxima", "Capacidad máxima", { min: 1, step: 1 })}
              {triState("espacio.cubierto", "Espacio cubierto")}
              {triState("espacio.aireLibre", "Espacio al aire libre")}
              <Choices label="Características confirmadas" options={catalog.features || []} values={draft.espacio.caracteristicas} onChange={(values) => setField("espacio.caracteristicas", values)} />
              {numberField("ubicacion.coordenadas.latitud", "Latitud", { min: -90, max: 90, step: "any" })}
              {numberField("ubicacion.coordenadas.longitud", "Longitud", { min: -180, max: 180, step: "any" })}
              <label className={`${styles.choice} ${styles.wide}`}><input type="checkbox" checked={draft.espacio.coordenadasVerificadas} onChange={(event) => setField("espacio.coordenadasVerificadas", event.target.checked)} />Comprobé que las coordenadas corresponden al establecimiento</label>
            </div>
          </details>
        )}
      </div>

      <div className={styles.panel}>
        <h2>Servicios</h2>
        {services.length ? <Choices label="Servicios confirmados del negocio" options={services} values={draft.servicios} onChange={(values) => setField("servicios", values)} /> : <p className={styles.muted}>Esta categoría todavía no tiene servicios específicos. Podés describirlos en la descripción completa y guardar o enviar a revisión.</p>}
        {draft.servicios.some((id) => !services.some((service) => service.id === id)) && (
          <div className={styles.notice}>
            <p>Hay servicios de una categoría anterior. Revisalos antes de guardar.</p>
            {draft.servicios.filter((id) => !services.some((service) => service.id === id)).map((id) => <button key={id} type="button" className={styles.button} onClick={() => setField("servicios", draft.servicios.filter((value) => value !== id))}>Quitar {id}</button>)}
          </div>
        )}
      </div>

      <ProviderPhotos providerId={providerId} images={draft.imagenes} setImages={(images) => setField("imagenes", images)} limits={catalog.imageUpload} onError={onError} onUploadingChange={onUploadingChange} />

      <div className={styles.panel}>
        <h2>Información adicional</h2>
        <details className={styles.details}>
          <summary>Precio orientativo</summary>
          <div className={styles.grid}>
            <Field label="Cómo mostrar el precio" value={draft.precio.modalidad} onChange={(value) => setField("precio", value === "consultar" ? { ...draft.precio, modalidad: value, importe: null, moneda: null, unidad: null } : { ...draft.precio, modalidad: value })} options={[["consultar", "Consultar presupuesto"], ["desde", "Desde…"]]} />
            {draft.precio.modalidad === "desde" && <>
              {numberField("precio.importe", "Importe desde", { min: 0.01, step: "any" })}
              {field("precio.moneda", "Moneda", { placeholder: "ARS", maxLength: 3 })}
              <Field label="Unidad del precio" value={draft.precio.unidad} onChange={(value) => setField("precio.unidad", value || null)} options={[["", "Elegir unidad"], ["evento", "Por evento"], ["persona", "Por persona"], ["hora", "Por hora"], ["unidad", "Por unidad"]]} />
            </>}
          </div>
          <p className={styles.hint}>La fecha se registra al guardar cambios de precio. Los precios no son obligatorios.</p>
        </details>
        <details className={styles.details}>
          <summary>Información para contratar</summary>
          <div className={styles.grid}>
            {field("contratacion.anticipacion", "¿Con cuánta anticipación conviene consultar?", { type: "textarea" })}
            {field("contratacion.incluye", "¿Qué incluye el servicio?", { type: "textarea" })}
            {field("contratacion.duracion", "¿Cuál es la duración habitual?", { type: "textarea" })}
            {field("contratacion.reserva", "¿Cómo se reserva?", { type: "textarea" })}
          </div>
        </details>
        <details className={styles.details}>
          <summary>Notas internas de administración</summary>
          <div className={styles.grid}><Field label="Notas internas" value={internalNotes} type="textarea" wide onChange={setInternalNotes} hint="Privadas. No forman parte de la ficha ni de su vista previa. No guardar contraseñas ni enlaces secretos." /></div>
        </details>
      </div>
    </fieldset>
  );
}
