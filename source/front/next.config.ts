import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // テスト・確かめで、ユーザが起こしている next dev と別にもう一つ起こせるようにする(next dev はビルド先ごとに一つしか動かない)
  distDir: process.env.ARCHIEVES_WEB_DIST_DIR ?? ".next",
};

export default nextConfig;
