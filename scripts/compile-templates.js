import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Obtener __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resto del código igual pero con sintaxis ES
const templateDir = path.join(__dirname, '../plantillas');
const outputDir = path.join(__dirname, '../netlify/functions/templates-dist');

console.log('----------------------------------------');
console.log('DEBUG: Buscando plantillas en:', templateDir);
console.log('DEBUG: Directorios encontrados:', fs.readdirSync(templateDir));
console.log('----------------------------------------');

// Crear directorio de salida si no existe
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Leer todas las plantillas
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

// Guardar como módulo JS
const outputContent = `// Generado automáticamente
export default ${JSON.stringify(templates, null, 2)};`;

fs.writeFileSync(path.join(outputDir, 'templates.js'), outputContent);
console.log('✅ Plantillas compiladas correctamente');