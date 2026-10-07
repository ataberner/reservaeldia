// Public error chrome is independent of the invitation's generated design.
export function buildPublicInvitationUnavailablePage(status: number, slug: string): string {
  const title = status >= 500
    ? "No pudimos cargar la invitación"
    : "Invitación no disponible";
  const description = status >= 500
    ? "Ocurrió un problema al cargar la invitación. Intentá nuevamente en unos instantes."
    : "En este momento no podemos mostrar esta invitación. Revisá el enlace o intentá abrirlo nuevamente en unos instantes.";
  const retryUrl = slug ? `/i/${encodeURIComponent(slug)}` : "/";
  const actionLabel = slug ? "Volver a intentar" : "Volver al inicio";

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, noarchive">
  <title>${title} | Reserva el Día</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #FBF7F9; color: #262626; font-family: "DM Sans", system-ui, sans-serif; }
    .invitation-unavailable { min-height: 100vh; min-height: 100svh; display: grid; place-items: center; padding: 32px 20px; }
    .invitation-unavailable__content { width: 100%; max-width: 460px; text-align: center; }
    .invitation-unavailable__brand { margin: 0 0 40px; color: #692B9A; font-size: 15px; font-weight: 600; }
    .invitation-unavailable h1 { margin: 0 0 16px; font-size: clamp(26px, 6vw, 32px); line-height: 1.2; }
    .invitation-unavailable p { line-height: 1.6; }
    .invitation-unavailable__action { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; margin: 16px 0; padding: 12px 24px; border-radius: 12px; background: #692B9A; color: #fff; font-size: 16px; font-weight: 600; text-decoration: none; }
    .invitation-unavailable__action:hover { background: #54227B; }
    .invitation-unavailable__action:focus-visible { outline: 3px solid #692B9A; outline-offset: 4px; }
    .invitation-unavailable__help { margin: 8px 0 0; color: #595959; font-size: 14px; }
  </style>
</head>
<body>
  <main class="invitation-unavailable">
    <div class="invitation-unavailable__content">
      <p class="invitation-unavailable__brand">Reserva el Día</p>
      <h1>${title}</h1>
      <p>${description}</p>
      <a class="invitation-unavailable__action" href="${retryUrl}">${actionLabel}</a>
      <p class="invitation-unavailable__help">Si el problema continúa, consultá con quien te envió la invitación.</p>
    </div>
  </main>
</body>
</html>`;
}
