import type { home as ja } from "../ja/home";

export const home: typeof ja = {
  welcome: (name: string) => `Welcome, ${name}`,
  tagline: "Record and manage your scores",
  signedOut: {
    lead: "An archery score tracker: tap the target face on your phone to record each arrow.",
    features: [
      "Tap where the arrow hit on the target to keep both the score and the position",
      "Review each game's total, X and 10 counts, and how your arrows group",
      "Follow your score trend and averages in charts",
      "Compare scores and share records with your club mates",
    ],
  },
};
