// Canonical UI primitives. Import from here, not from individual files.
// See .claude/design-system.md for when to use each.

export { Button, buttonVariants } from "./button";
export type { ButtonProps } from "./button";
export { Input, Textarea, Select } from "./input";
export { Chip } from "./Chip";
export { Segmented } from "./Segmented";
export type { SegmentedOption } from "./Segmented";
export { Badge } from "./badge";
export type { BadgeProps } from "./badge";
export { PageHeader } from "./PageHeader";
export { Page } from "./Page";
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
