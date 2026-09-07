export function calcPoint(point: number) {
  if (point > 10) return 10;
  return point;
}

export function scoreToStr(point: number) {
  if (point <= 0) {
    return "M";
  }
  if (point <= 10) {
    return point.toString();
  }
  if (point === 11) {
    return "X";
  }
  throw new Error("Invalid point value");
}
export function scoreToInt(point: number) {
  if (point === 11) {
    return 10;
  }
  return point;
}

// ここを共通化すると、tailwindcssが反応しない
export function bgColorPallet(point: number): string {
  if (point >= 9) return "bg-yellow-500";
  if (point >= 7) return "bg-red-500";
  if (point >= 5) return "bg-blue-500";
  if (point >= 3) return "bg-black";
  if (point >= 1) return "bg-white";
  return "bg-gray-200";
}

export function borderColorPallet(point: number): string {
  if (point >= 9) return "border-yellow-500";
  if (point >= 7) return "border-red-500";
  if (point >= 5) return "border-blue-500";
  if (point >= 3) return "border-gray-700";
  if (point >= 1) return "border-gray-400";
  return "border-gray-200";
}
