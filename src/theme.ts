export type Palette = { id: string; label: string; base: string };

/** 19 种高饱和配色 */
export const PALETTE: Palette[] = [
  { id: "pink", label: "樱粉", base: "#FF3E8F" },
  { id: "magenta", label: "洋红", base: "#FF4FD8" },
  { id: "fuchsia", label: "紫红", base: "#D946EF" },
  { id: "purple", label: "紫", base: "#A855F7" },
  { id: "violet", label: "紫罗兰", base: "#8B5CF6" },
  { id: "indigo", label: "靛蓝", base: "#6366F1" },
  { id: "blue", label: "蓝", base: "#3B6DFF" },
  { id: "sky", label: "天蓝", base: "#38BDF8" },
  { id: "cyan", label: "青", base: "#22D3EE" },
  { id: "teal", label: "蓝绿", base: "#00CFC1" },
  { id: "emerald", label: "翡翠", base: "#00C98D" },
  { id: "green", label: "绿", base: "#22C55E" },
  { id: "lime", label: "黄绿", base: "#A3E027" },
  { id: "yellow", label: "黄", base: "#FFD814" },
  { id: "amber", label: "琥珀", base: "#FFB020" },
  { id: "orange", label: "橙", base: "#FF7A1A" },
  { id: "coral", label: "珊瑚", base: "#FF8A5B" },
  { id: "red", label: "红", base: "#FF2D55" },
  { id: "rose", label: "玫红", base: "#FF5A5F" },
];

const FALLBACK = PALETTE[6];

export function colorOf(colorId: string): string {
  return (PALETTE.find((item) => item.id === colorId) ?? FALLBACK).base;
}

/** 甘特条和任务块用的渐变，带一点高光更鲜亮 */
export function gradientOf(colorId: string): string {
  const base = colorOf(colorId);
  return `linear-gradient(135deg, ${base}, ${mix(base, "#FFFFFF", 0.32)})`;
}

/** 把颜色按比例混白，用于淡背景 */
export function tint(colorId: string, ratio: number): string {
  return mix(colorOf(colorId), "#FFFFFF", 1 - ratio);
}

function mix(hex: string, other: string, weight: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(other);
  const channel = (index: number) =>
    Math.round(a[index] * weight + b[index] * (1 - weight));
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}
