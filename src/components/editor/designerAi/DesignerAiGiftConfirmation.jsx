import React, { useEffect, useRef } from "react";

function GiftValue({ value, method }) {
  let host = "";
  if (method === "giftListLink" && value) {
    try { host = new URL(value).host; } catch { /* Normalized by the gift owner. */ }
  }
  return <span className="block min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
    {host ? <strong className="block">{host}</strong> : null}
    {value || "Sin valor"}
  </span>;
}

export default function DesignerAiGiftConfirmation({ proposal, onConfirm, onCancel }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section role="region" aria-labelledby="designer-gift-confirm-title"
    className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 text-left"
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <h3 id="designer-gift-confirm-title" ref={heading} tabIndex={-1} className="text-base font-semibold outline-none">Revisá los cambios de Regalos</h3>
    <p className="mt-2 break-words text-sm">{proposal.documentName}. Confirmá los destinos y los cambios que se aplicarán a esta invitación.</p>
    {proposal.savedCount ? <p className="mt-2 text-sm">Ya se guardaron {proposal.savedCount} cambios. Revisá solamente los pendientes.</p> : null}
    <ol className="mt-3 space-y-3 text-sm">
      {proposal.steps.map((step, index) => <li key={index} className="min-w-0 rounded-xl border border-[#E5E5E5] bg-[#FBF7F9] p-3">
        <strong>{index + 1}. {step.label}</strong>
        {step.persistOnly ? <p>El cambio está visible; falta confirmar su guardado.</p> : null}
        <p>Regalos: {step.beforeEnabled ? "activados" : "desactivados"} → {step.afterEnabled ? "activados" : "desactivados"}</p>
        {step.rows.map(row => <div key={row.method} className="mt-3 min-w-0 border-t border-[#E5E5E5] pt-2">
          <strong>{row.label}</strong>
          <div className="mt-1 grid min-w-0 grid-cols-1 gap-2">
            <div className="min-w-0"><span className="font-medium">Actual</span><GiftValue value={row.before} method={row.method} /><span>{row.beforeVisible ? "Visible" : row.beforeSelected ? "Seleccionado, Regalos desactivados" : "Oculto"}</span></div>
            <div className="min-w-0"><span className="font-medium">Propuesto</span><GiftValue value={row.after} method={row.method} /><span>{row.afterVisible ? "Visible" : row.afterSelected ? "Seleccionado, Regalos desactivados" : "Oculto"}</span></div>
          </div>
        </div>)}
      </li>)}
    </ol>
    <p className="mt-4 text-sm font-semibold">Al confirmar se aplicará este conjunto de cambios:</p>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm [overflow-wrap:anywhere]">{proposal.summary.map((item, index) => <li key={index}>{item}</li>)}</ul>
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" onClick={onConfirm} className="min-h-11 rounded-xl bg-[#692B9A] px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Confirmar cambios</button>
      <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-[#d9c0ec] px-4 py-2 text-sm font-medium text-[#692B9A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Cancelar</button>
    </div>
  </section>;
}
