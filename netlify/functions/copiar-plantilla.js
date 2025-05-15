const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Método no permitido' }),
      };
    }

    const { plantillaId, slug } = JSON.parse(event.body || '{}');

    if (!plantillaId || !slug) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan datos obligatorios' }),
      };
    }

    console.log(`📦 Copiando plantilla "${plantillaId}" en carpeta slug: ${slug}`);

    // Rutas dentro del entorno de ejecución de Netlify
    const origen = path.join(__dirname, 'plantillas', plantillaId);
    const destino = path.join(__dirname, 'borradores', slug); // temporal, para debug

    console.log('📂 Path origen:', origen);
    console.log('📂 Path destino:', destino);
    console.log('🧱 ¿Existe el origen?', fs.existsSync(origen));

    if (!fs.existsSync(origen)) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Plantilla no encontrada' }),
      };
    }

    // Crear carpeta destino
    fs.mkdirSync(destino, { recursive: true });

    // Copiar archivos
    const copiarDirectorio = (origen, destino) => {
      const archivos = fs.readdirSync(origen);
      archivos.forEach((archivo) => {
        const origenPath = path.join(origen, archivo);
        const destinoPath = path.join(destino, archivo);

        if (fs.lstatSync(origenPath).isDirectory()) {
          fs.mkdirSync(destinoPath, { recursive: true });
          copiarDirectorio(origenPath, destinoPath);
        } else {
          fs.copyFileSync(origenPath, destinoPath);
        }
      });
    };

    copiarDirectorio(origen, destino);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, slug }),
    };

  } catch (error) {
    console.error('❌ Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor' }),
    };
  }
};
