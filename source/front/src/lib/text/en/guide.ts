import type { guide as ja } from "../ja/guide";
import { terms as t } from "./terms";

/** Guide (app/guide/page.tsx). */
export const guide: typeof ja = {
  title: "How to use",
  sections: [
    {
      title: "Add to home screen (install)",
      items: [
        "iPhone / iPad: open this app in Safari, tap the Share button and choose \"Add to Home Screen\"",
        "Android: in the Chrome menu, choose \"Install app\" or \"Add to Home screen\"",
        "Computer: click the install icon in the address bar of Chrome or Edge",
        "Opened from the home screen, the browser frame disappears and the app runs full screen like a regular app",
      ],
    },
    {
      title: "Record",
      items: [
        "Tap \"Start game\" on the home screen and choose the bow type, distance, target and number of arrows",
        "Target input: press where the arrow hit. While pressing, a zoom appears above your finger; move to aim and release to record",
        "Number input: check \"Enter numbers only\" in the game settings to enter scores with number buttons (arrow positions are not recorded)",
        "Scores in progress stay on the device and are saved together when you tap \"Finish\". If you close the app midway, resume from \"Continue the game in progress\" on the home screen",
        "Record past dates with \"Enter later\" on the score screen",
      ],
    },
    {
      title: "Review",
      items: [
        `${t.scoreLog}: see each game's score sheet and where the arrows hit. Tap an end row to show only that end's arrows on the target`,
        "Write comments on a game, round or end from the comment icon",
        `${t.statistics}: follow your score trend and averages in charts`,
        `${t.diary}: keep notes on how the day went alongside your scores`,
      ],
    },
    {
      title: "Export and AI",
      items: [
        `Download your records as an SQLite file from \"${t.export}\" in ${t.settings}`,
        `Let AI such as Claude or ChatGPT read your records with \"AI tokens\" in ${t.settings}`,
      ],
    },
    {
      title: "Need help?",
      items: [
        `Send questions or bug reports from \"${t.feedback}\" in the menu. Replies appear on that screen`,
      ],
    },
  ],
};
