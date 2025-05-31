/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',           // 👉 exportación estática (modo Netlify, Firebase Hosting, etc.)
  trailingSlash: true,        // 👉 opcional si querés que todas las rutas terminen con /
  images: {
    unoptimized: true,        // ✅ permite usar <Image /> sin errores en modo export
  },
  // Configuración adicional para manejo de errores
  onError: (err) => {
    console.error('Error en Next.js:', err);
  },
};

module.exports = nextConfig;
