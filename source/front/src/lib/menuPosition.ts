import { useSyncExternalStore } from "react";

export const MENU_POSITIONS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

export type MenuPosition = (typeof MENU_POSITIONS)[number];

const MENU_POSITION_KEY = "menuPosition";
const CHANGE_EVENT = "menuPositionChange";

function isMenuPosition(value: unknown): value is MenuPosition {
  return MENU_POSITIONS.includes(value as MenuPosition);
}

/** 未設定(または localStorage が使えない)なら null。このときは CSS の既定(画面の幅に合わせた位置)になる */
function readMenuPosition(): MenuPosition | null {
  try {
    const value = localStorage.getItem(MENU_POSITION_KEY);
    return isMenuPosition(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveMenuPosition(position: MenuPosition) {
  try {
    localStorage.setItem(MENU_POSITION_KEY, position);
  } catch {
    // 保存できなくても、この画面の間は反映される
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** メニューボタンの位置。サーバーでの描画中は localStorage を読めないので null を返す */
export function useMenuPosition(): MenuPosition | null {
  return useSyncExternalStore(subscribe, readMenuPosition, () => null);
}
