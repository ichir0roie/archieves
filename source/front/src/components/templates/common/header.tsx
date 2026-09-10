"use client";

import { useRouter } from "next/navigation";
import AuthGate from "@/components/auth/AuthGate";
import ArrowBackIosNewRoundedIcon from "@mui/icons-material/ArrowBackIosNewRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import { IconButton, Tooltip } from "@mui/material";
import { JSX } from "react";

interface Props {
  pageName: string;
  showBack?: boolean;
}

function AuthenticatedHeader({ pageName, showBack }: Props): JSX.Element {
  const router = useRouter();

  function handleBack() {
    // A forced redirect (e.g. AuthGate sending an unregistered user to
    // /profile/settings) can replace the only history entry in the tab,
    // leaving nothing for router.back() to go to.
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2.5 bg-white/70 backdrop-blur-md border-b border-slate-200/70">
      {showBack ? (
        <Tooltip title="戻る">
          <IconButton
            size="small"
            onClick={handleBack}
            className="!bg-white/80 shadow-sm"
          >
            <ArrowBackIosNewRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Tooltip title="ホームへ">
          <IconButton
            size="small"
            onClick={() => router.push("/")}
            className="!bg-white/80 shadow-sm"
          >
            <HomeRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <span className="text-base font-semibold text-slate-800 truncate">
        {pageName}
      </span>
    </header>
  );
}

export default function Header(props: Props): JSX.Element {
  return (
    <AuthGate>
      <AuthenticatedHeader {...props} />
    </AuthGate>
  );
}
