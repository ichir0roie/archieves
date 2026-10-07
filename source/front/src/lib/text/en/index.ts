import type { Texts } from "..";
import { common } from "./common";
import { game } from "./game";
import { home } from "./home";
import { profile } from "./profile";
import { settings } from "./settings";
import { stats } from "./stats";

export const texts: Texts = {
  ...common,
  home,
  stats,
  game,
  profile,
  settings,
};
