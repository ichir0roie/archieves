"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Fab, ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import TrackChangesRoundedIcon from "@mui/icons-material/TrackChangesRounded";
import { NAV_ITEMS } from "@/modules/nav/navItems";

export default function Navigation() {
  const router = useRouter();
  const pathname = usePathname();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  function go(href: string) {
    setAnchorEl(null);
    router.push(href);
  }

  return (
    <>
      <nav className="hidden md:fixed md:inset-y-0 md:left-0 md:z-20 md:flex md:w-60 md:flex-col md:gap-1 md:border-r md:border-slate-200/70 md:bg-white/80 md:p-4 md:backdrop-blur-md">
        <div className="flex items-center gap-2 px-2 pb-6">
          <TrackChangesRoundedIcon className="!text-indigo-600" />
          <span className="text-lg font-bold text-slate-800">Archieves</span>
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <button
              key={item.label}
              onClick={() => go(item.href)}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-base font-semibold transition-colors ${
                active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="fixed bottom-5 right-5 z-30 md:hidden">
        <Fab
          color="primary"
          aria-label="メニュー"
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <MenuRoundedIcon />
        </Fab>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <MenuItem key={item.label} onClick={() => go(item.href)}>
                <ListItemIcon>
                  <Icon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{item.label}</ListItemText>
              </MenuItem>
            );
          })}
        </Menu>
      </div>
    </>
  );
}
