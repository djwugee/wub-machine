/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable static export for client-side only deployment
  output: 'export',
  
  // Optimize for production
  reactStrictMode: true,
  
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
  
  // Webpack configuration for audio processing
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    
    return config;
  },
};

export default nextConfig;
