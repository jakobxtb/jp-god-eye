import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // JP GOD EYE serves both applications from ONE origin: the Vite dev server
  // on :4173 proxies everything under /osiris to this Next.js server. Setting
  // basePath here (rather than rewriting paths in the proxy) is what keeps
  // Next's own asset URLs, router links and API routes correct behind that
  // prefix — and it moves OSIRIS's routes to /osiris/api/*, so they cannot
  // collide with the globe app's own /api/* middleware.
  basePath: '/osiris',
  assetPrefix: '/osiris',
  output: 'standalone',
  serverExternalPackages: ['ws'],
  transpilePackages: ['react-map-gl', 'mapbox-gl', 'maplibre-gl'],
  // Type errors block the build again. They were suppressed while 17 stood
  // unfixed; those are cleared, so the gate can do its job — the AstraPanel
  // crash (createPortal used without an import) shipped precisely because
  // nothing stopped it.
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: wss: data: blob:;" },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ];
  },
};

export default nextConfig;
