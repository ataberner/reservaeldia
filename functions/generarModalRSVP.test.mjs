import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const { generarModalRSVPHTML } = requireBuiltModule("lib/utils/generarModalRSVP.js");

const PUBLIC_RSVP_ENDPOINT =
  "https://us-central1-reservaeldia-7a440.cloudfunctions.net/publicRsvpSubmit";

test("serializes the current public RSVP endpoint and preview flag into the modal runtime config", () => {
  const html = generarModalRSVPHTML(
    {
      enabled: true,
      presetId: "minimal",
      modal: {
        title: "Confirmar asistencia",
      },
    },
    { previewMode: true }
  );

  assert.match(html, /"previewMode":true/);
  assert.match(
    html,
    new RegExp(`"submitEndpoint":"${PUBLIC_RSVP_ENDPOINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`)
  );
});

test("keeps the runtime fallback endpoint and preview-only submit bypass stable", () => {
  const html = generarModalRSVPHTML(
    {
      enabled: true,
      presetId: "minimal",
    },
    { previewMode: true }
  );

  assert.match(html, /function resolveSubmitEndpoint\(\)/);
  assert.match(
    html,
    new RegExp(
      `return "${PUBLIC_RSVP_ENDPOINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}";`
    )
  );
  assert.match(
    html,
    /Vista previa: la respuesta no se envio\. Publica la invitacion para recibir RSVPs reales\./
  );
});

test("keeps the current RSVP opener selector contract active", () => {
  const html = generarModalRSVPHTML({
    enabled: true,
    presetId: "minimal",
  });

  assert.match(
    html,
    /\.querySelectorAll\('\[data-rsvp-open\], \[data-accion="abrir-rsvp"\], \.rsvp-boton'\)/
  );
});
