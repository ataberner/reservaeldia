/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Opcional: configura imágenes si las usas
  images: {
    unoptimized: true // Necesario para export estático
  }
};

export default nextConfig;