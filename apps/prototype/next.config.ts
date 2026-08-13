import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Export statique — permet d'empaqueter l'app dans un APK (Capacitor/WebView).
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
