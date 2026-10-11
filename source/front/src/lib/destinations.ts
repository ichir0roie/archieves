/** メニュー(Nav)とホームのボタンに並べる行き先。label は T.nav のキー */
export const DESTINATIONS = [
  { href: "/game/setup", label: "startGame" },
  { href: "/score-log", label: "scoreLog" },
  { href: "/analysis", label: "analysis" },
  { href: "/profile/me", label: "profile" },
  { href: "/ranking", label: "ranking" },
  { href: "/announcements", label: "announcements" },
  { href: "/feedback", label: "feedback" },
  { href: "/settings", label: "settings" },
] as const;
