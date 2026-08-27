import path from "node:path";
import { fileURLToPath } from "node:url";

const nextjsRoot = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  reactStrictMode: false,
  distDir: isProd ? ".next-build" : ".next",
  ...(isProd ? { output: "standalone" } : {}),
  turbopack: {
    root: nextjsRoot,
  },
  ...(!isProd
    ? {
        allowedDevOrigins: [
          "127.0.0.1",
          "localhost",
          // Chromium in the api container opens http://proxy/pdf-maker.
          "proxy",
        ],
      }
    : {}),

  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer && config.output) {
      // Dev webpack compiles large layout chunks on first request; Docker bind
      // mounts on Windows can exceed the default 120s chunk load timeout.
      config.output.chunkLoadTimeout = 300_000;
    }
    return config;
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-7c765f3726084c52bcd5d180d51f1255.r2.dev",
      },
      {
        protocol: "https",
        hostname: "pptgen-public.ap-south-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "pptgen-public.s3.ap-south-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "img.icons8.com",
      },
      {
        protocol: "https",
        hostname: "present-for-me.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "yefhrkuqbjcblofdcpnr.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "unsplash.com",
      },
    ],
  },
  
};

export default nextConfig;
