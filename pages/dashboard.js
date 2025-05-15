import { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import TipoSelector from '../components/TipoSelector';
import PlantillaGrid from '../components/PlantillaGrid';

export default function Dashboard() {
  const [tipoSeleccionado, setTipoSeleccionado] = useState(null);
  const [slugInvitacion, setSlugInvitacion] = useState(null); // ← nuevo estado

  return (
    <DashboardLayout>
      {!slugInvitacion && (
        <>
          <TipoSelector onSeleccionarTipo={setTipoSeleccionado} />
          {tipoSeleccionado && (
            <PlantillaGrid
              tipo={tipoSeleccionado}
              onSeleccionarPlantilla={(slug) => setSlugInvitacion(slug)}
            />
          )}
        </>
      )}

      {slugInvitacion && (
        <div style={{ border: '1px solid #ccc', borderRadius: '16px', overflow: 'hidden' }}>
          <iframe
            src={`/borradores/${slugInvitacion}/index.html`}
            title="Vista previa de invitación"
            width="100%"
            height="1000"
            style={{ border: 'none' }}
          />
        </div>
      )}
    </DashboardLayout>
  );
}
