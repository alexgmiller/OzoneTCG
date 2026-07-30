"use client";

import { Modal } from "@/components/ui/Modal";
import { ConfirmPanel, type ConfirmPanelProps } from "@/components/ui/ConfirmDialog";

/**
 * Declarative confirmation modal, for call sites that hold their own
 * open/close state and render this conditionally.
 *
 * This is a thin wrapper over <ConfirmPanel /> so there is exactly one
 * confirmation implementation. If you're writing new code and just need
 * "are you sure?", prefer the promise-based `useConfirm()` instead — it
 * doesn't require a piece of state per call site.
 */
export default function ConfirmationModal(props: ConfirmPanelProps) {
  return (
    <Modal open onClose={props.onCancel}>
      <ConfirmPanel {...props} />
    </Modal>
  );
}
