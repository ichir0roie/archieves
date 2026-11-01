import type { Texts } from "..";
import { common } from "./common";
import { diary } from "./diary";
import { game } from "./game";
import { guide } from "./guide";
import { home } from "./home";
import { legal } from "./legal";
import { profile } from "./profile";
import { settings } from "./settings";
import { stats } from "./stats";
import { support } from "./support";

export const texts: Texts = {
  ...common,
  home,
  stats,
  game,
  guide,
  profile,
  settings,
  support,
  diary,
  legal,
};
