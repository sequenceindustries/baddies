/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Media is always served via signed URLs from the storage provider, so
  // no image domains need to be allow-listed at build time for user
  // content (see src/lib/providers/storage).
};

module.exports = nextConfig;
