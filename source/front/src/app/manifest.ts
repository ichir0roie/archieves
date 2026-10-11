import type { MetadataRoute } from "next";
import { T } from "@/lib/text/server";

/** ホーム画面に追加(インストール)したときの名前・説明・アイコン */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: T.appTitle,
    short_name: T.appName,
    description: T.appDescription,
    lang: "ja",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#f4f5f7",
    categories: [
      "sports",
      "health",
      "fitness",
    ],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
