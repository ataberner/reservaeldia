import { useState } from 'react';

export default function TipoSelector({ onSeleccionarTipo }) {
  const [tipoSeleccionado, setTipoSeleccionado] = useState(null);

  const tipos = [
    { id: 'boda', nombre: 'Boda', emoji: '💍' },
    { id: 'cumple', nombre: 'Cumpleaños', emoji: '🎉' },
    { id: 'bautismo', nombre: 'Bautismo', emoji: '🕊️' },
  ];

  const manejarSeleccion = (id) => {
    setTipoSeleccionado(id);
    onSeleccionarTipo(id);
  };

  return (
    
        <div className="tipo-selector-container">
      <h2 className="tipo-selector-titulo">
        ¿Qué tipo de invitación querés hacer?
      </h2>
      <div className="tipo-selector-botones">
        {tipos.map((tipo) => (
          <button
            key={tipo.id}
            onClick={() => manejarSeleccion(tipo.id)}
            className={`tipo-btn ${tipoSeleccionado === tipo.id ? 'selected' : ''}`}
          >
            {tipo.emoji} {tipo.nombre}
          </button>
        ))}
      </div>
      
    </div>
  );
}
