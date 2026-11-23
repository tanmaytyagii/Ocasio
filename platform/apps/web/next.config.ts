import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    const upstream = new URL(process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:4100');
    if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) {
      throw new Error('INTERNAL_API_URL must be an HTTP(S) origin without credentials or a path');
    }
    return [{source:'/api/v1/:path*',destination:`${upstream.origin}/api/v1/:path*`}];
  },
  async headers() {
    return [{source:'/:path*',headers:[
      {key:'X-Content-Type-Options',value:'nosniff'},
      {key:'X-Frame-Options',value:'DENY'},
      {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
    ]}];
  },
};

export default nextConfig;
