const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const baseURL = 'https://reservaeldia.com.ar/boda/eugeyagus/';  // Cambia esto por tu dominio
const basePath = path.join(__dirname, 'boda');  // Ruta local de las carpetas de bodas

(async () => {
    const browser = await puppeteer.launch();

    // Buscar todas las carpetas dentro de /boda/
    const folders = fs.readdirSync(basePath).filter(folder =>
        fs.statSync(path.join(basePath, folder)).isDirectory()
    );

    for (const folder of folders) {
        const url = `${baseURL}${folder}/`;
        const outputPath = path.join(basePath, folder, 'preview.jpg');

        console.log(`📸 Generando screenshot para: ${url}`);

        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 630 });
        await page.goto(url, { waitUntil: 'networkidle2' });

        await page.screenshot({ path: outputPath, quality: 80, type: 'jpeg' });

        console.log(`✅ Imagen guardada en: ${outputPath}`);
        await page.close();
    }

    await browser.close();
    console.log('🎉 Capturas completadas.');
})();
