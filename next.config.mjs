/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the tracing root to this project — a stray lockfile in the home dir otherwise
  // makes Next guess the wrong workspace root.
  outputFileTracingRoot: import.meta.dirname,
  // Only pull the icons actually used, not the whole lucide barrel (cuts module count / compile time).
  experimental: { optimizePackageImports: ['lucide-react'] },
}

export default nextConfig
