// Usar ES Modules para consistencia (si tu package.json tiene "type": "module")
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

// Obtener __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar plantillas compiladas
import templates from './templates-dist/templates.js';

export const handler = async (event) => {
  // Validación del método HTTP
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Método no permitido' })
    };
  }

  try {
    const { plantillaId, slug } = JSON.parse(event.body);
    
    // Verificar si la plantilla existe
    if (!templates[plantillaId]) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: `Plantilla "${plantillaId}" no encontrada` })
      };
    }

    // SOLUCIÓN CLAVE: Usar /tmp en producción y public/borradores en desarrollo
    const isProduction = process.env.NETLIFY === 'true';
    const borradorDir = isProduction
      ? path.join('/tmp', 'borradores', slug) // Netlify permite escribir en /tmp
      : path.join(__dirname, '..', '..', 'public', 'borradores', slug); // Desarrollo local

    await fs.ensureDir(borradorDir);

    // Escribir cada archivo de la plantilla
    const fileWrites = Object.entries(templates[plantillaId]).map(
      async ([filename, content]) => {
        const filePath = path.join(borradorDir, filename);
        await fs.writeFile(filePath, content);
        console.log(`Archivo creado: ${filePath}`);
      }
    );

    await Promise.all(fileWrites);

    // En producción, necesitamos devolver el contenido en lugar de la ruta
    if (isProduction) {
      const htmlContent = templates[plantillaId]['index.html'];
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: true,
          content: htmlContent, // Enviamos el HTML directamente
          slug: slug
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true,
        url: `/borradores/${slug}/index.html`
      })
    };
  } catch (error) {
    console.error('Error en copiar-plantilla:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Error interno del servidor',
        details: error.message 
      })
    };
  }
};