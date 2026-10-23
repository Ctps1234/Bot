import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O driver SQLite (nativo do Node ou better-sqlite3) nunca deve ser empacotado
  // pelo webpack/turbopack — ele precisa ser resolvido em runtime pelo Node.
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    // Server Actions são o caminho de escrita da aplicação.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
