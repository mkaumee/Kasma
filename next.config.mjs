/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions body size limit for statement uploads is handled at the
    // route level; keep defaults conservative here.
  },
};

export default nextConfig;
