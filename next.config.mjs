/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pg'],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
