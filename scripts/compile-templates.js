import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ruta CORREGIDA - ahora dentro de netlify/functions
const templateDir = path.join(__dirname, '../netlify/functions/plantillas');
const outputDir = path.join(__dirname, '../netlify/functions/templates-dist');

// Verificar existencia
console.log('Verificando directorios...');
console.log('Plantillas path:', templateDir);
console.log('Existe plantillas dir?', fs.existsSync(templateDir));

if (!fs.existsSync(templateDir)) {
  console.error('ERROR: No se encontró el directorio de plantillas');
  process.exit(1); // Falla explícitamente si no existe
}

// Crear directorio de salida
fs.mkdirSync(outputDir, { recursive: true });

// Procesar plantillas
const templates = {};
const templateFolders = fs.readdirSync(templateDir);

templateFolders.forEach(folder => {
  const templatePath = path.join(templateDir, folder);
  if (fs.statSync(templatePath).isDirectory()) {
    templates[folder] = {};
    
    const files = fs.readdirSync(templatePath);
    files.forEach(file => {
      const filePath = path.join(templatePath, file);
      templates[folder][file] = fs.readFileSync(filePath, 'utf-8');
    });
  }
});

// Guardar compilación
const outputContent = `export default ${JSON.stringify(templates, null, 2)};`;
fs.writeFileSync(path.join(outputDir, 'templates.js'), outputContent);

console.log('✅ Plantillas compiladas correctamente');