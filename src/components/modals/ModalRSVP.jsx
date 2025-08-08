// src/components/modals/ModalRSVP.jsx
import React, { useEffect } from "react";


export default function ModalRSVP({ visible, onClose }) {
  if (!visible) return null;

useEffect(() => {
  console.log("🧾 ModalRSVP montado");
}, []);


  return (
    <div
      id="modal-rsvp"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          padding: "24px",
          borderRadius: "8px",
          maxWidth: "90%",
          width: "400px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
          fontFamily: "sans-serif",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: "bold" }}>Confirmar asistencia</h2>
        <input
          id="nombre-rsvp"
          placeholder="Tu nombre"
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
        />
        <input
          id="mensaje-rsvp"
          placeholder="Mensaje (opcional)"
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 12px",
              background: "#eee",
              border: "none",
              borderRadius: "4px",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              const nombre = document.getElementById("nombre-rsvp").value;
              const mensaje = document.getElementById("mensaje-rsvp").value;
              if (!nombre.trim()) {
                alert("Por favor ingresá tu nombre.");
                return;
              }
              alert(`¡Gracias por confirmar tu asistencia, ${nombre}!`);
              onClose();
            }}
            style={{
              padding: "8px 12px",
              background: "#773dbe",
              color: "white",
              border: "none",
              borderRadius: "4px",
            }}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
