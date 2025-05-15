import fs from 'fs/promises';
import path from 'path';
import { datosInvitacion } from './datos.js';

const plantillaPath = path.join('plantillas', 'boda-clasica', 'index.html');
const destinoPath = path.join('public', 'boda', 'agus-y-euge-2025');

async function generarInvitacion() {
  try {
    // 1. Leer el HTML base
    let html = await fs.readFile(plantillaPath, 'utf-8');

    // 2. Reemplazar campos con data-id="..."
    for (const [key, value] of Object.entries(datosInvitacion)) {
      const regex = new RegExp(`(<[^>]+data-id=["']${key}["'][^>]*>)(.*?)(</[^>]+>)`, 'g');
      html = html.replace(regex, `$1${value}$3`);
    }

    // 3. Crear la carpeta destino si no existe
    await fs.mkdir(destinoPath, { recursive: true });

    // 4. Escribir el archivo nuevo
    await fs.writeFile(path.join(destinoPath, 'index.html'), html, 'utf-8');

    console.log('✅ Invitación generada correctamente en:', destinoPath);
  } catch (error) {
    console.error('❌ Error al generar la invitación:', error);
  }
}

generarInvitacion();
