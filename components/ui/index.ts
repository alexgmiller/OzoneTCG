// Canonical UI primitives. Import from here, not from individual files.
// See .claude/design-system.md for when to use each.

export { SectionHeader } from "./SectionHeader";
export { MoneyDisplay } from "./MoneyDisplay";
export type { MoneyTone } from "./MoneyDisplay";
export { StatCard } from "./StatCard";
export { Skeleton } from "./Skeleton";
export { Modal } from "./Modal";
export { EmptyState } from "./EmptyState";
export { ToastProvider, useToast } from "./Toast";
export type { ToastTone } from "./Toast";
export { ConfirmProvider, useConfirm } from "./ConfirmDialog";
export type { ConfirmOptions } from "./ConfirmDialog";

// Phase 3 primitives
export { SegmentedControl } from "./SegmentedControl";
export { TabStrip } from "./TabStrip";
export { Chip, ChipRow } from "./Chip";
export { RangePicker, DEFAULT_RANGES } from "./RangePicker";
export { HeroValue } from "./HeroValue";
export { CountStat, CountStatRow } from "./CountStat";
export { CardTile } from "./CardTile";
export type { CardTileDelta } from "./CardTile";
export { SearchBar } from "./SearchBar";
export { IconButton } from "./IconButton";
export { ContextMenu } from "./ContextMenu";
export type { ContextMenuItem } from "./ContextMenu";
export { useLongPress } from "./useLongPress";
export type { PressPoint } from "./useLongPress";
