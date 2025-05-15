import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const templateDir = path.join(__dirname, '../netlify/functions/plantillas');
const outputDir = path.join(__dirname, '../netlify/functions/templates-dist');

// Verificar directorios
console.log('Verificando directorios...');
console.log('Plantillas path:', templateDir);
console.log('Existe plantillas dir?', fs.existsSync(templateDir));

if (!fs.existsSync(templateDir)) {
  console.error('ERROR: No se encontró el directorio de plantillas');
  process.exit(1);
}

// Crear directorio de salida
fs.mkdirSync(outputDir, { recursive: true });

// Procesar plantillas
const templates = {};
const templateFolders = fs.readdirSync(templateDir);

templateFolders.forEach(folder => {
  const templatePath = path.join(templateDir, folder);
  const stats = fs.statSync(templatePath);
  
  if (stats.isDirectory()) {
    templates[folder] = {};
    
    const files = fs.readdirSync(templatePath);
    files.forEach(file => {
      const filePath = path.join(templatePath, file);
      
      // SOLUCIÓN CLAVE: Verificar si es archivo antes de leer
      if (fs.statSync(filePath).isFile()) {
        try {
          templates[folder][file] = fs.readFileSync(filePath, 'utf-8');
          console.log(`Procesado: ${filePath}`);
        } catch (err) {
          console.error(`Error leyendo ${filePath}:`, err);
        }
      }
    });
  }
});

// Guardar compilación
const outputContent = `export default ${JSON.stringify(templates, null, 2)};`;
fs.writeFileSync(path.join(outputDir, 'templates.js'), outputContent);

console.log('✅ Plantillas compiladas correctamente');