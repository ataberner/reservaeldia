import fs from 'fs-extra';
import path from 'path';

export async function copiarPlantillaBase(nombrePlantilla, slugDestino) {
  const origen = path.join('plantillas', nombrePlantilla);
  const destino = path.join('public', 'borradores', slugDestino);

  try {
    await fs.copy(origen, destino);
    console.log(`✅ Plantilla '${nombrePlantilla}' copiada a /public/borradores/${slugDestino}`);
    return destino;
  } catch (error) {
    console.error('❌ Error al copiar plantilla:', error);
    throw error;
  }
}
