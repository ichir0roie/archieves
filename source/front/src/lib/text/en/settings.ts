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
  },
  deleteAccount: {
    title: "Delete account",
    description: `Deletes your account along with all of your ${t.record.toLowerCase()}s, ${t.diary.toLowerCase()} entries, ${t.comment.toLowerCase()}s and what you sent through ${t.feedback}. This cannot be undone. ${t.export} anything you want to keep first.`,
    submit: "Delete my account",
    confirmTitle: "Delete account",
    confirm: `Your account and all of your ${t.record.toLowerCase()}s will be deleted. This cannot be undone.`,
    deleting: "Deleting...",
  },
  export: {
    title: t.export,
    description: `Download your ${t.record.toLowerCase()}s as an SQLite file (.db). It describes its own tables and columns, so other apps and AI tools can read it. You can import it again above.`,
    submit: "Download (.db)",
    exporting: "Preparing...",
  },
};
