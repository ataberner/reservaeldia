// functions/src/utils/generarModalRSVP.ts
import React, { useEffect } from "react";


export type RSVPConfig = {
    enabled: boolean;
    title?: string;
    subtitle?: string;
    buttonText?: string;
    primaryColor?: string; // color del botón/cabecera
    sheetUrl?: string;     // opcional si vas a enviar a Google Sheets o similar
};

export function generarModalRSVPHTML(cfg: RSVPConfig): string {
    if (!cfg?.enabled) return "";

    const title = cfg.title ?? "Confirmar asistencia";
    const subtitle = cfg.subtitle ?? "";
    const btnText = cfg.buttonText ?? "Enviar";
    const color = cfg.primaryColor ?? "#773dbe";

    // Nota: el botón que abre el modal debe tener [data-rsvp-open]
    // (el listener de abajo lo busca)
    return `
<div id="modal-rsvp" style="
  position: fixed; inset: 0; display:none;
  background: rgba(0,0,0,.6); z-index: 9999;
  align-items: center; justify-content: center;">
  <div style="
    background: #fff; width: 90%; max-width: 420px; border-radius: 10px;
    padding: 20px; font-family: sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.2);">
    <div style="display:flex; justify-content: space-between; align-items:center;">
      <h2 style="margin:0; font-size:20px;">${title}</h2>
      <button id="rsvp-close" aria-label="Cerrar" style="border:none; background:transparent; font-size:18px; cursor:pointer;">✕</button>
    </div>
    ${subtitle ? `<p style="margin:8px 0 16px; color:#555;">${subtitle}</p>` : ""}

    <div style="display:flex; flex-direction:column; gap:10px;">
      <input id="rsvp-nombre" placeholder="Tu nombre" style="padding:10px; border:1px solid #ccc; border-radius:6px;" />
      <input id="rsvp-mensaje" placeholder="Mensaje (opcional)" style="padding:10px; border:1px solid #ccc; border-radius:6px;" />
    </div>

    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
      <button id="rsvp-cancel" style="padding:8px 12px; border-radius:6px; border:1px solid #ddd; background:#f3f3f3; cursor:pointer;">Cancelar</button>
      <button id="rsvp-send" style="padding:8px 12px; border-radius:6px; border:none; color:#fff; cursor:pointer; background:${color};">${btnText}</button>
    </div>
  </div>
</div>

<script>
(function() {
  var modal = document.getElementById('modal-rsvp');
  if (!modal) return;

  function openModal() { modal.style.display = 'flex'; }
  function closeModal() { modal.style.display = 'none'; }

  // Botones internos
  var closeBtn = document.getElementById('rsvp-close');
  var cancelBtn = document.getElementById('rsvp-cancel');
  var sendBtn = document.getElementById('rsvp-send');

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  // Click fuera del cuadro
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeModal();
  });

  // Abridores: cualquier elemento con data-rsvp-open
document.querySelectorAll('[data-rsvp-open], [data-accion="abrir-rsvp"], .rsvp-boton').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      openModal();
    });
  });

  // Envío básico
  if (sendBtn) {
    sendBtn.addEventListener('click', function() {
      var nombre = (document.getElementById('rsvp-nombre') || {}).value || '';
      var mensaje = (document.getElementById('rsvp-mensaje') || {}).value || '';
      if (!nombre.trim()) {
        alert('Por favor ingresá tu nombre.');
        return;
      }

      // Si tenés endpoint/sheet configurado, podrías hacer fetch aquí:
      var sheetUrl = ${JSON.stringify(cfg.sheetUrl || "")};
      if (sheetUrl) {
        fetch(sheetUrl, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ nombre: nombre.trim(), mensaje: mensaje.trim(), ts: Date.now() })
        }).catch(function() { /* swallow */ });
      }

      alert('¡Gracias por confirmar tu asistencia, ' + nombre + '!');
      closeModal();
    });
  }
})();
</script>
`;
}
