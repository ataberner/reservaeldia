import fs from 'fs-extra';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo se permite POST' });
  }

  const { plantillaId, slug } = req.body;

  if (!plantillaId || !slug) {
    return res.status(400).json({ error: 'Faltan datos: plantillaId o slug' });
  }

  try {
    const origen = path.join(process.cwd(), 'plantillas', plantillaId);
    const destino = path.join(process.cwd(), 'public', 'borradores', slug);

    await fs.copy(origen, destino);
    return res.status(200).json({ mensaje: 'Plantilla copiada', slug });
  } catch (error) {
    console.error('Error al copiar plantilla:', error);
    return res.status(500).json({ error: 'No se pudo copiar la plantilla' });
  }
}
