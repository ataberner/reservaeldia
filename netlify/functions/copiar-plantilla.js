import { promises as fs } from 'fs';
import path from 'path';

export async function handler(event, context) {
  try {
    const { plantilla, slug } = JSON.parse(event.body || '{}');

    if (!plantilla || !slug) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan datos obligatorios' })
      };
    }

    const origen = path.resolve('plantillas', plantilla);
    const destino = path.resolve('public', 'borradores', slug);

    await fs.mkdir(destino, { recursive: true });

    const copiarRecursivo = async (origen, destino) => {
      const entries = await fs.readdir(origen, { withFileTypes: true });

      for (const entry of entries) {
        const origenPath = path.join(origen, entry.name);
        const destinoPath = path.join(destino, entry.name);

        if (entry.isDirectory()) {
          await fs.mkdir(destinoPath, { recursive: true });
          await copiarRecursivo(origenPath, destinoPath);
        } else {
          await fs.copyFile(origenPath, destinoPath);
        }
      }
    };

    await copiarRecursivo(origen, destino);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, slug })
    };

  } catch (err) {
    console.error('❌ Error en copiar-plantilla:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno' })
    };
  }
}
