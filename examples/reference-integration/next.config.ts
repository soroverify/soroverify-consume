import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The SDK and widget are workspace packages consumed through their published
  // dist entry points; transpile them like any regular app dependency so Next
  // bundles them correctly for both server and client.
  transpilePackages: ['@soroverify/sdk', '@soroverify/widget'],
};

export default nextConfig;
