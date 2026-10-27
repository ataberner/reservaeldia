import { useEffect, useRef, useState } from "react";
import TemplateCardShell from "@/components/templates/TemplateCardShell";
import { useDashboardHomeTemplates } from "@/hooks/useDashboardHomeTemplates";
import { buildInvitationTypeLabel, INVITATION_TYPES } from "@/domain/invitationTypes";
import { buildDraftSlug, createDraftFromTemplate } from "@/domain/templates/service";

export default function CreateUserDraftModal({ owner, onClose, onCreated }) {
  const dialogRef = useRef(null);
  const submittingRef = useRef(false);
  const requestedSlugsRef = useRef(new Map());
  const [tipo, setTipo] = useState("boda");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState("");
  const { templates, loading, error } = useDashboardHomeTemplates({ tipo });

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const createDraft = async () => {
    if (!owner?.uid || !selectedTemplate?.id || submittingRef.current) return;
    submittingRef.current = true;
    setCreating(true);
    setCreationError("");
    const templateId = selectedTemplate.id;
    if (!requestedSlugsRef.current.has(templateId)) {
      requestedSlugsRef.current.set(templateId, buildDraftSlug(selectedTemplate.nombre));
    }

    try {
      const { slug } = await createDraftFromTemplate({
        templateId,
        templateName: selectedTemplate.nombre,
        ownerUid: owner.uid,
        requestedSlug: requestedSlugsRef.current.get(templateId),
      });
      onCreated({ ownerUid: owner.uid, slug });
    } catch (failure) {
      setCreationError(failure?.message || "No se pudo crear el borrador.");
    } finally {
      submittingRef.current = false;
      setCreating(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="create-user-draft-title"
      aria-describedby="create-user-draft-owner"
      onCancel={(event) => {
        event.preventDefault();
        if (!submittingRef.current) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="create-user-draft-title" className="text-base font-semibold">Crear borrador</h2>
          <p id="create-user-draft-owner" className="mt-1 break-all text-sm text-slate-600">
            Para {owner.email || owner.uid}. Elegí una plantilla inicial.
          </p>
        </div>
        <button type="button" onClick={onClose} disabled={creating} aria-label="Cerrar selector de plantillas"
          className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
          ×
        </button>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
        Categoría
        <select value={tipo} disabled={creating} onChange={(event) => {
          setTipo(event.target.value);
          setSelectedTemplate(null);
          setCreationError("");
        }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {INVITATION_TYPES.map((type) => (
            <option key={type} value={type}>{buildInvitationTypeLabel(type)}</option>
          ))}
        </select>
      </label>

      <div className="my-4" aria-busy={loading}>
        {loading ? <p className="text-sm text-slate-500">Cargando plantillas...</p> :
          error ? <p role="alert" className="text-sm text-rose-700">{error}</p> :
          templates.length === 0 ? <p className="text-sm text-slate-500">No hay plantillas disponibles en esta categoría.</p> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {templates.map((template) => (
                <div key={template.id} className={selectedTemplate?.id === template.id
                  ? "rounded-2xl ring-2 ring-indigo-500 ring-offset-2" : ""}>
                  <TemplateCardShell
                    title={template.nombre}
                    imageSrc={template.portada}
                    actionLabel={selectedTemplate?.id === template.id ? "Seleccionada" : "Seleccionar"}
                    disabled={creating}
                    onClick={() => {
                      setSelectedTemplate(template);
                      setCreationError("");
                    }}
                  />
                </div>
              ))}
            </div>
          )}
      </div>

      {creationError && <p role="alert" className="mb-3 text-sm text-rose-700">{creationError}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
        <p className="text-xs text-slate-500" aria-live="polite">
          {selectedTemplate ? `Plantilla: ${selectedTemplate.nombre || "Plantilla"}` : "Seleccioná una plantilla para continuar."}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={creating}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={createDraft} disabled={!selectedTemplate || creating || loading}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
            {creating ? "Creando..." : "Crear borrador"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
