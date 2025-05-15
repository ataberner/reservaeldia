const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  try {
    const { plantillaId, slug } = JSON.parse(event.body || '{}');

    if (!plantillaId || !slug) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan datos obligatorios' }),
      };
    }

    // Ruta origen: donde están las plantillas originales
    const origen = path.join(__dirname, 'plantillas', plantillaId);

    // Ruta destino: dentro del sitio público para poder editar
    const destino = path.join(__dirname, '..', '..', 'public', 'borradores', slug);

    console.log('📂 Path origen:', origen);
    console.log('📂 Path destino:', destino);
    console.log('🧱 ¿Existe el origen?', fs.existsSync(origen));

    if (!fs.existsSync(origen)) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Plantilla no encontrada' }),
      };
    }

    fs.mkdirSync(destino, { recursive: true });

    function copiarDirectorio(origen, destino) {
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
    }

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
