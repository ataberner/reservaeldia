import { useState, useEffect } from 'react';

export default function TipoSelector({ onSeleccionarTipo }) {
  const [tipoSeleccionado, setTipoSeleccionado] = useState('boda');

  const tipos = [
    { id: 'boda', nombre: 'Boda', img: '/assets/img/selector/boda1.png' },
    { id: 'cumple', nombre: 'Cumpleaños', img: '/assets/img/selector/cumpleanos1.png' },
    { id: 'ceremonia', nombre: 'Ceremonia', img: '/assets/img/selector/religioso.png' },
  ];

  const manejarSeleccion = (id) => {
    setTipoSeleccionado(id);
    onSeleccionarTipo(id);
  };

  useEffect(() => {
    manejarSeleccion('boda'); // Selecciona Boda por defecto al cargar
  }, []);

  return (
    <div className="flex flex-col items-center mt-12 pb-4">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">
        ¿Qué tipo de invitación querés hacer?
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tipos.map((tipo) => (
          <div
            key={tipo.id}
            onClick={() => manejarSeleccion(tipo.id)}
            className={`relative w-52 h-32 sm:w-56 sm:h-36 rounded-xl overflow-hidden shadow-md cursor-pointer transition-all duration-300 hover:scale-105 
              ${tipoSeleccionado === tipo.id ? 'ring-4 ring-purple-500' : ''}`}
          >
            <img
              src={tipo.img}
              alt={tipo.nombre}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent flex items-end justify-center">
              <p className="text-white text-base sm:text-lg font-semibold mb-2">
                {tipo.nombre}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
