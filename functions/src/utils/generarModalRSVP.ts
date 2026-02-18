// functions/src/utils/generarModalRSVP.ts

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

     <!-- ✅ NUEVO: selector Sí/No con estilo segmentado -->
    <div style="margin-top:12px;">
      <label style="display:block; font-weight:600; margin-bottom:8px;">¿Confirmás asistencia?</label>
      <div id="rsvp-confirma" style="
        display:inline-flex; gap:0; border:1px solid #ddd; border-radius:10px; overflow:hidden;
        box-shadow: inset 0 1px 0 rgba(0,0,0,0.03);
      ">
        <button type="button" data-confirma="si" aria-pressed="true" style="
          padding:10px 14px; border:none; background:${color}; color:#fff; font-weight:600; cursor:pointer;
        ">Sí, voy</button>
        <button type="button" data-confirma="no" aria-pressed="false" style="
          padding:10px 14px; border:none; background:#f6f6f6; color:#444; cursor:pointer;
        ">No puedo</button>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
      <button id="rsvp-cancel" style="padding:8px 12px; border-radius:6px; border:1px solid #ddd; background:#f3f3f3; cursor:pointer;">Cancelar</button>
      <button id="rsvp-send" style="padding:8px 12px; border-radius:6px; border:none; color:#fff; cursor:pointer; background:${color};">${btnText}</button>
    </div>
  </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function () {

function getSlugDePagina() {
  // 0) Log de ayuda
  try { console.log("[RSVP] href:", location.href); } catch (e) {}

  // 1) <html data-slug="..."> (si lo inyectás en el HTML final)
  const ds = document.documentElement?.dataset?.slug;
  if (ds) {
    console.log("[RSVP] slug por data-atributo:", ds);
    return ds;
  }

  // 2) ?slug=... en la URL
  const q = new URLSearchParams(location.search).get("slug");
  if (q) {
    console.log("[RSVP] slug por querystring:", q);
    return q;
  }

  // 3) /publicadas/<slug>/... en un sitio estático (Hosting/Proxy)
  const parts = location.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("publicadas");
  if (i >= 0 && parts[i + 1]) {
    console.log("[RSVP] slug por pathname directo:", parts[i + 1]);
    return parts[i + 1];
  }

  // 4) URL de Firebase Storage:
  //    https://firebasestorage.googleapis.com/v0/b/<bucket>/o/publicadas%2F<slug>%2Findex.html?alt=media&token=...
  //    https://<bucket>.firebasestorage.app/v0/b/<bucket>/o/publicadas%2F<slug>%2Findex.html?alt=media
  try {
    const pathAfterO = location.pathname.split("/o/")[1]; // "publicadas%2F<slug>%2Findex.html"
    if (pathAfterO) {
      const decoded = decodeURIComponent(pathAfterO);      // "publicadas/<slug>/index.html"
      const segs = decoded.split("/").filter(Boolean);
      const j = segs.indexOf("publicadas");
      if (j >= 0 && segs[j + 1]) {
        console.log("[RSVP] slug por URL de Storage:", segs[j + 1]);
        return segs[j + 1];
      }
    }
  } catch (e) {
    console.warn("[RSVP] Error parseando URL de Storage:", e);
  }

  console.warn("[RSVP] No se pudo detectar slug. Fallback: sin-slug");
  return "sin-slug";
}


  var modal = document.getElementById('modal-rsvp');
  if (!modal) return;

  function openModal() { 
  modal.style.display = 'flex'; 
  // 🔁 Reset visual y estado cada vez que se abre
  setConfirmaUI("si", ${JSON.stringify(color)});
}

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


// Estado interno del selector Sí/No
var confirmaValor = "si"; // default

function setConfirmaUI(valor, color) {
  var cont = document.getElementById('rsvp-confirma');
  if (!cont) return;
  var btnSi = cont.querySelector('[data-confirma="si"]');
  var btnNo = cont.querySelector('[data-confirma="no"]');
  confirmaValor = (valor === "no") ? "no" : "si";

  if (btnSi && btnNo) {
    if (confirmaValor === "si") {
      btnSi.style.background = color;
      btnSi.style.color = "#fff";
      btnSi.setAttribute("aria-pressed", "true");

      btnNo.style.background = "#f6f6f6";
      btnNo.style.color = "#444";
      btnNo.setAttribute("aria-pressed", "false");
    } else {
      btnNo.style.background = color;
      btnNo.style.color = "#fff";
      btnNo.setAttribute("aria-pressed", "true");

      btnSi.style.background = "#f6f6f6";
      btnSi.style.color = "#444";
      btnSi.setAttribute("aria-pressed", "false");
    }
  }
}

// 🔹 Dejar "Sí" seleccionado al cargar
setConfirmaUI("si", ${JSON.stringify(color)});

// 🔹 Alternar selección al click
var confirmaWrap = document.getElementById('rsvp-confirma');
if (confirmaWrap) {
  confirmaWrap.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-confirma]');
    if (!btn) return;
    var v = btn.getAttribute('data-confirma');
    setConfirmaUI(v, ${JSON.stringify(color)});
    try { console.log("[RSVP] cambia confirmaValor =", v); } catch(_) {}
  });
}



  // ✅ Envío con Firestore + logs
if (sendBtn) {
  sendBtn.addEventListener('click', function() {
    var nombre = (document.getElementById('rsvp-nombre') || {}).value || '';
    var mensaje = (document.getElementById('rsvp-mensaje') || {}).value || '';

    if (!nombre.trim()) {
      alert('Por favor ingresá tu nombre.');
      return;
    }

    const confirma = (confirmaValor === "si"); 
    const slug = getSlugDePagina();
    console.log("[RSVP] Enviando RSVP… slug =", slug);

    // (opcional) si seguís usando sheetUrl, mantenemos el POST “en paralelo”
    var sheetUrl = ${JSON.stringify(cfg.sheetUrl || "")};
    if (sheetUrl) {
      try {
        fetch(sheetUrl, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            nombre: nombre.trim(),
            mensaje: mensaje.trim(),
            slug: slug,
            ts: Date.now()
          })
        }).catch(function(e){ console.warn("[RSVP] sheetUrl error:", e); });
      } catch (e) {
        console.warn("[RSVP] sheetUrl throw:", e);
      }
    }

    // 🔌 Importar Firebase dinámicamente y guardar en Firestore
    Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js"),
    ])
    .then(([appMod, fsMod]) => {
      const { initializeApp } = appMod;
      const { getFirestore, collection, addDoc, serverTimestamp } = fsMod;

      // ⚙️ Config mínima (apiKey y projectId son suficientes para el cliente)
      const firebaseConfig = {
        apiKey: "AIzaSyALCvU48_HRp26cXpQcTX5S33Adpwfl3z4",
        authDomain: "reservaeldia.com.ar",
        projectId: "reservaeldia-7a440",
        appId: "1:860495975406:web:3a49ad0cf55d60313534ff"
      };

      const app = initializeApp(firebaseConfig);
      const db  = getFirestore(app);

      const payload = {
        nombre: nombre.trim(),
        mensaje: (mensaje && mensaje.trim()) || null,
        confirma,
        createdAt: serverTimestamp(),
        userAgent: navigator.userAgent.slice(0, 512)
      };

      console.log("[RSVP] Payload keys =", Object.keys(payload));
      console.log("[RSVP] Payload =", JSON.stringify(payload));

      return addDoc(collection(db, "publicadas", slug, "rsvps"), payload);
    })
    .then((docRef) => {
      console.log("[RSVP] RSVP guardado con ID:", docRef.id, "en /publicadas/"+slug+"/rsvps");
      alert('¡Gracias por confirmar tu asistencia, ' + nombre + '!');
      closeModal();
    })
    .catch((err) => {
      console.error("[RSVP] Error guardando en Firestore:", err);
      alert('Hubo un error al guardar tu confirmación. Probá de nuevo.');
    });
  });
}
 
  

});
</script>
`;
}
