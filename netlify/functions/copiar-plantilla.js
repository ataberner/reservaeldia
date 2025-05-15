const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  try {
    // Paso 1: Validar método
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Método no permitido' }),
      };
    }

    // Paso 2: Parsear body
    const { plantillaId, slug } = JSON.parse(event.body || '{}');

    if (!plantillaId || !slug) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan datos obligatorios' }),
      };
    }

    console.log(`📦 Copiando plantilla "${plantillaId}" en carpeta slug: ${slug}`);

    // Paso 3: Definir paths correctos
    const base = path.resolve(__dirname, '../../../'); // sube desde /netlify/functions hasta raíz del proyecto
    const origen = path.join(__dirname, '..', '..', '..', 'plantillas', plantillaId);
    const destino = path.join(base, 'public', 'borradores', slug);

    console.log('📂 Path origen esperado:', origen);
    console.log('📂 Destino:', destino);
    console.log('🧱 ¿Existe el origen?', fs.existsSync(origen));

    if (!fs.existsSync(origen)) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Plantilla no encontrada' }),
      };
    }

    // Paso 4: Crear destino
    fs.mkdirSync(destino, { recursive: true });

    // Paso 5: Función auxiliar para copiar
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

    console.log('✅ Copia realizada con éxito');

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, slug }),
    };
  } catch (error) {
    console.error('❌ Error en la función copiar-plantilla:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor' }),
    };
  }
};
