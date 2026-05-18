export interface ColorOption {
  id: string;
  label: string;
  gradient: string;   // inline CSS gradient
  sample: string;     // hex for the swatch preview
}

export const PLAYLIST_COLORS: ColorOption[] = [
  { id: "red",    label: "Red",    gradient: "linear-gradient(135deg,#ef4444,#be185d)", sample: "#ef4444" },
  { id: "orange", label: "Orange", gradient: "linear-gradient(135deg,#f97316,#b45309)", sample: "#f97316" },
  { id: "yellow", label: "Yellow", gradient: "linear-gradient(135deg,#eab308,#92400e)", sample: "#eab308" },
  { id: "green",  label: "Green",  gradient: "linear-gradient(135deg,#22c55e,#065f46)", sample: "#22c55e" },
  { id: "teal",   label: "Teal",   gradient: "linear-gradient(135deg,#14b8a6,#0e4f5e)", sample: "#14b8a6" },
  { id: "blue",   label: "Blue",   gradient: "linear-gradient(135deg,#3b82f6,#1e3a8a)", sample: "#3b82f6" },
  { id: "indigo", label: "Indigo", gradient: "linear-gradient(135deg,#6366f1,#3730a3)", sample: "#6366f1" },
  { id: "purple", label: "Purple", gradient: "linear-gradient(135deg,#a855f7,#6b21a8)", sample: "#a855f7" },
  { id: "pink",   label: "Pink",   gradient: "linear-gradient(135deg,#ec4899,#9d174d)", sample: "#ec4899" },
  { id: "rose",   label: "Rose",   gradient: "linear-gradient(135deg,#f43f5e,#881337)", sample: "#f43f5e" },
  { id: "amber",  label: "Amber",  gradient: "linear-gradient(135deg,#f59e0b,#78350f)", sample: "#f59e0b" },
  { id: "slate",  label: "Slate",  gradient: "linear-gradient(135deg,#64748b,#0f172a)", sample: "#64748b" },
];

export const PLAYLIST_EMOJIS = [
  "🎵","🎶","🎸","🎹","🎺","🥁",
  "🎤","🎧","🎷","🎼","🎻","🎙️",
  "🔥","❤️","💜","💙","💚","⭐",
  "🌙","🌸","🌊","⚡","🎯","🦋",
  "🎪","🌈","🎃","🐉","🌺","✨",
];

export function getGradient(colorId: string): string {
  return PLAYLIST_COLORS.find((c) => c.id === colorId)?.gradient
    ?? PLAYLIST_COLORS[0].gradient;
}
