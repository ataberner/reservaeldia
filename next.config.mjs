const isDev = process.env.NODE_ENV === "development";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep dev and build outputs isolated to avoid .next collisions.
  distDir: isDev ? ".next-dev" : ".next",
  ...(isDev ? {} : { output: "export" }),
  ...(isDev
    ? {
        async headers() {
          return [
            {
              source: "/(.*)",
              headers: [
                {
                  key: "Cross-Origin-Opener-Policy",
                  value: "same-origin-allow-popups",
                },
              ],
            },
          ];
        },
      }
    : {}),
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
