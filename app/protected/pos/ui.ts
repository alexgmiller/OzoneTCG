// ── Shared POS control classes ── every control is h-11+ for the show floor

export const INPUT =
  "h-11 min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground";

export const BTN =
  "h-11 shrink-0 whitespace-nowrap rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted disabled:opacity-40";

// Selectable chip; selection is always the teal accent
export const chip = (on: boolean) =>
  `h-11 shrink-0 whitespace-nowrap rounded-lg border px-3 text-sm transition-colors duration-150 ${
    on
      ? "border-accent-primary bg-accent-primary-soft font-medium text-primary"
      : "border-border text-muted-foreground hover:text-foreground"
  }`;

// 44px round icon target for inline remove buttons
export const ICON_BTN =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground";
