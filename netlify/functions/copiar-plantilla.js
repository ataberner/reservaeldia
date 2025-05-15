import fs from 'fs-extra';
import path from 'path';

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { plantillaId, slug } = req.body;

  if (!plantillaId || !slug) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  try {
    const origen = path.join(process.cwd(), 'plantillas', plantillaId);
    const destino = path.join(process.cwd(), 'public', 'borradores', slug);

    await fs.copy(origen, destino);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('❌ Error copiando plantilla:', err);
    return res.status(500).json({ error: 'Error al copiar la plantilla' });
  }
};
