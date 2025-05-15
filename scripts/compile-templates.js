const fs = require('fs');
const path = require('path');
const templateDir = path.join(__dirname, '../plantillas');
const outputDir = path.join(__dirname, '../netlify/functions/templates-dist');

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
    
    // Leer todos los archivos de la plantilla
    const files = fs.readdirSync(templatePath);
    files.forEach(file => {
      const filePath = path.join(templatePath, file);
      templates[folder][file] = fs.readFileSync(filePath, 'utf-8');
    });
  }
});

// Guardar como módulo JS
const outputContent = `// Generado automáticamente
module.exports = ${JSON.stringify(templates, null, 2)};`;

fs.writeFileSync(path.join(outputDir, 'templates.js'), outputContent);
console.log('✅ Plantillas compiladas correctamente');