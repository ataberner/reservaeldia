const fs = require('fs');
const path = require('path');

exports.handler = async () => {
  try {
    const base = path.resolve(__dirname, '../../../');
    const testPath = path.join(base, 'plantillas');

    console.log('🧪 Path de prueba:', testPath);
    const existe = fs.existsSync(testPath);
    console.log('📁 ¿Existe carpeta plantillas?', existe);

    if (!existe) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No se encontró la carpeta plantillas' }),
      };
    }

    const archivos = fs.readdirSync(testPath);
    console.log('📄 Archivos encontrados:', archivos);

    return {
      statusCode: 200,
      body: JSON.stringify({ archivos }),
    };
  } catch (err) {
    console.error('💥 Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno' }),
    };
  }
};
