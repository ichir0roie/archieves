import type { diary as ja } from "../ja/diary";
import { terms as t } from "./terms";

export const diary: typeof ja = {
  title: t.diary,
  listTitle: "All entries",
  toList: "See all entries",
  description: "Write down what you thought today. Only you can see your entries unless you share them in your profile settings.",
  body: "Entry",
  submit: "Write",
  submitting: "Sending...",
  recent: "Recent entries",
  empty: "No entries yet",
};
