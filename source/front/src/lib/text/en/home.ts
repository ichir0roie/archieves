import type { home as ja } from "../ja/home";

export const home: typeof ja = {
  welcome: (name: string) => `Welcome, ${name}`,
  tagline: "Record and manage your scores",
};
