const puppeteer = require('puppeteer');

(async () => {
    const url = 'https://reservaeldia.com.ar/boda/';
    const outputPath = 'preview.jpg'; // Nombre del archivo de salida

    // Lanzar el navegador en modo headless
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Configurar el tamaño de la pantalla para la captura
    await page.setViewport({ width: 1200, height: 630 });

    // Ir a la página
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Capturar la pantalla y guardarla
    await page.screenshot({ path: outputPath, quality: 80, type: 'jpeg' });

    await browser.close();
    console.log('✅ Imagen generada: preview.jpg');
})();
