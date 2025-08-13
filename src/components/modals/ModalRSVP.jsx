// src/components/modals/ModalRSVP.jsx
import React, { useEffect, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase"; // <- ya lo usás en el proyecto

/**
 * Props:
 * - visible: boolean (muestra/oculta modal)
 * - onClose: function (cierra el modal)
 * - slug: string (identificador único de la invitación publicada)
 * - opcionesExtra: objeto opcional { cantidadMax, requiereMensaje, ... } (por si querés extender)
 */
export default function ModalRSVP({ visible, onClose, slug, opcionesExtra = {} }) {
  const [nombre, setNombre] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cantidad, setCantidad] = useState(1); // ej: cantidad de asistentes
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      console.log("🧾 ModalRSVP abierto con slug:", slug);
      // Resetea el formulario al abrir
      setNombre("");
      setMensaje("");
      setCantidad(1);
    }
  }, [visible, slug]);


  if (!visible) return null;

  const onSubmit = async () => {
    console.log("📥 Datos ingresados:", {
      nombre,
      mensaje,
      cantidad,
      slug
    });
    const nombreLimpio = (nombre || "").trim();
    const mensajeLimpio = (mensaje || "").trim();

    if (!slug) {
      console.error("ModalRSVP: falta slug de invitación");
      return;
    }
    if (!nombreLimpio) {
      alert("Por favor, ingresá tu nombre.");
      return;
    }
    if (opcionesExtra.requiereMensaje && !mensajeLimpio) {
      alert("Este evento requiere que dejes un mensaje.");
      return;
    }
    if (cantidad < 1) {
      alert("La cantidad debe ser al menos 1.");
      return;
    }

    try {
      setLoading(true);

      console.log(`🚀 Guardando en Firestore: publicadas/${slug}/rsvps`);

      // Colección: publicadas/{slug}/rsvps
      const colRef = collection(db, "publicadas", slug, "rsvps");
      await addDoc(colRef, {
        nombre: nombreLimpio,
        mensaje: mensajeLimpio || null,
        cantidad: Number(cantidad),
        // Podés guardar más campos: email, teléfono, menú, etc.
        createdAt: serverTimestamp(),
        // Referencia a la invitación:
        slug,
      });

      console.log("✅ RSVP guardado con ID:", ref.id);

      // UX: feedback rápido y cerrar
      alert(`¡Gracias por confirmar, ${nombreLimpio}!`);
      onClose?.();
    } catch (err) {
      console.error("❌ Error guardando RSVP:", err.code, err.message);
      alert("Hubo un error al guardar tu confirmación. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="modal-rsvp"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          backgroundColor: "white",
          padding: "24px",
          borderRadius: "12px",
          maxWidth: "92%",
          width: "420px",
          boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
          fontFamily: "Inter, system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Confirmar asistencia</h2>

        {/* Nombre */}
        <label style={{ fontSize: 12, color: "#555" }}>Nombre*</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Tu nombre"
          style={{ padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          disabled={loading}
        />

        {/* Cantidad */}
        <label style={{ fontSize: 12, color: "#555" }}>Cantidad de asistentes</label>
        <input
          type="number"
          min={1}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          style={{ padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          disabled={loading}
        />

        {/* Mensaje opcional */}
        <label style={{ fontSize: 12, color: "#555" }}>Mensaje (opcional)</label>
        <input
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          placeholder="¿Querés dejar algún mensaje?"
          style={{ padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          disabled={loading}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button
            onClick={onClose}
            style={{ padding: "10px 12px", background: "#eee", border: "none", borderRadius: "8px" }}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            onClick={onSubmit}
            style={{
              padding: "10px 14px",
              background: "#773dbe",
              color: "white",
              border: "none",
              borderRadius: "8px",
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
            disabled={loading}
          >
            {loading ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
