/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: `next build` writes a fully offline-capable site to `out/`.
  output: "export",
  trailingSlash: false,
  images: { unoptimized: true },
};

export default nextConfig;
