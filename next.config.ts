import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    position: 'top-right',
  },
  serverExternalPackages: ['msnodesqlv8', 'mssql/msnodesqlv8'],
};

export default nextConfig;
