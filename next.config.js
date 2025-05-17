/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // ✅ Esto activa el modo de exportación estática
  trailingSlash: true // ✅ (opcional) para que Firebase sirva rutas tipo /boda/agus-euge-2025/
};

module.exports = nextConfig;
