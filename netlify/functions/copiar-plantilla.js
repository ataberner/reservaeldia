const path = require('path');
const fs = require('fs-extra');
const templates = require('./templates-dist/templates');

exports.handler = async (event) => {
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

    // Ruta destino en la carpeta pública
    const borradorDir = path.join(process.cwd(), '..', 'public', 'borradores', slug);
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