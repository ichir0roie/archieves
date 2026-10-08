import type { settings as ja } from "../ja/settings";
import { terms as t } from "./terms";

export const settings: typeof ja = {
  title: t.settings,
  menuPosition: {
    title: "Menu button position",
    description: "Choose the screen corner for the menu button. Until you choose, it is placed automatically to suit the screen width.",
    groupLabel: "Menu button position",
    topLeft: "Top left",
    topRight: "Top right",
    bottomLeft: "Bottom left",
    bottomRight: "Bottom right",
  },
  language: {
    title: "Language",
    description: "Choose the language of the screens. Your choice is saved on this device.",
    groupLabel: "Language",
    ja: "日本語",
    en: "English",
  },
  links: {
    title: "Account",
    profileSettings: `${t.profile} settings`,
    registerMatch: `Register ${t.match.toLowerCase()} info`,
  },
};
