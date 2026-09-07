import type SvgIcon from "@mui/material/SvgIcon";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import LeaderboardRoundedIcon from "@mui/icons-material/LeaderboardRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";

export interface NavItem {
  label: string;
  href: string;
  icon: typeof SvgIcon;
}

/** Primary destinations, shared by the desktop sidebar and the mobile popup menu. */
export const NAV_ITEMS: NavItem[] = [
  {
    label: "記録",
    href: "/score-log",
    icon: HistoryRoundedIcon,
  },
  {
    label: "統計",
    href: "/analysis",
    icon: BarChartRoundedIcon,
  },
  {
    label: "プロフィール",
    href: "/profile/me",
    icon: PersonRoundedIcon,
  },
  {
    label: "ランキング",
    href: "/ranking",
    icon: LeaderboardRoundedIcon,
  },
  {
    label: "インポート",
    href: "/import",
    icon: UploadFileRoundedIcon,
  },
];
