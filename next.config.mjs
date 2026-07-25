/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow statement file uploads (up to 20 MB) through Server Actions.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
