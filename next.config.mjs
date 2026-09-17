import environmentContract from "./shared/firebaseEnvironment.cjs";
const isDev = process.env.NODE_ENV === "development";
if (isDev) {
  environmentContract.readClientEnvironment();
  if (!process.env.RESERVA_LOCAL_SESSION) throw new Error("Iniciar desarrollo con npm run dev (sesión aislada requerida).");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep dev and build outputs isolated to avoid .next collisions.
  distDir: isDev ? process.env.NEXT_DEV_DIST_DIR || ".next-dev" : ".next",
  ...(isDev ? {} : { output: "export" }),
  experimental: {
    externalDir: true,
  },
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  ...(isDev ? {
    async headers() {
      return [{ source: "/:path*", headers: [
        { key: "Content-Security-Policy", value: environmentContract.localContentSecurityPolicy() },
        { key: "X-DNS-Prefetch-Control", value: "off" },
      ] }];
    },
  } : {}),
};

export default nextConfig;
