// ── Shared POS control classes ── every control is h-11+ for the show floor

export const INPUT =
  "h-11 min-w-0 rounded-xl bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent";

export const BTN =
  "h-11 shrink-0 whitespace-nowrap rounded-full bg-surface-2 px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-surface disabled:opacity-40";

export const BTN_ACCENT =
  "h-11 shrink-0 whitespace-nowrap rounded-full bg-accent px-4 text-sm font-semibold text-bg transition-colors duration-150 disabled:opacity-40";

// 44px round icon target for inline remove buttons
export const ICON_BTN =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-surface-2 hover:text-foreground";

// A --surface card section
export const CARD = "space-y-3 rounded-2xl bg-surface p-3";
