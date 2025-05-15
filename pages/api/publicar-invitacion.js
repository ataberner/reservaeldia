import fs from 'fs-extra';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo se permite método POST' });
  }

  const { slugBorrador, slugFinal } = req.body;

  if (!slugBorrador || !slugFinal) {
    return res.status(400).json({ error: 'Faltan parámetros' });
  }

  const origen = path.join(process.cwd(), 'public', 'borradores', slugBorrador);
  const destino = path.join(process.cwd(), 'public', 'boda', slugFinal);

  try {
    // Copiar todo el contenido del borrador al destino final
    await fs.copy(origen, destino);
    return res.status(200).json({ url: `/boda/${slugFinal}/index.html` });
  } catch (err) {
    console.error('❌ Error al publicar invitación:', err);
    return res.status(500).json({ error: 'Error al copiar la invitación final' });
  }
}
