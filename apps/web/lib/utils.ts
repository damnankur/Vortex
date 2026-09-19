import React from "react";

export const BRUTAL_AVATAR_COLORS = [
  "#FFE600", // Yellow
  "#00E5FF", // Cyan
  "#00F0A0", // Mint
  "#FF5376", // Coral
  "#A78BFA", // Lavender
  "#FF9F1C", // Orange
  "#38BDF8", // Sky
  "#F472B6", // Pink
];

export function avatarStyle(name: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const color = BRUTAL_AVATAR_COLORS[Math.abs(hash) % BRUTAL_AVATAR_COLORS.length];
  return { background: color, color: "#000000" };
}

export function getUserColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return BRUTAL_AVATAR_COLORS[Math.abs(hash) % BRUTAL_AVATAR_COLORS.length] || "#FFE600";
}

export function serverInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
