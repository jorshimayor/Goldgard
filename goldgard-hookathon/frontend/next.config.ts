import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack(config) {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      (warning: any) => {
        const message = warning?.message;
        const details = warning?.details;
        const text = typeof message === "string" ? message : typeof details === "string" ? details : "";
        const resource = warning?.module?.resource;
        return (
          text.includes("Critical dependency: the request of a dependency is an expression") &&
          typeof resource === "string" &&
          resource.includes("/ox/") &&
          resource.includes("/tempo/") &&
          resource.includes("virtualMasterPool")
        );
      },
    ];

    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
