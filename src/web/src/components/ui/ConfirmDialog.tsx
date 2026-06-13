import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, loading = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} size="sm" labelledBy="confirm-title">
      <Modal.Header title={title} onClose={onCancel} id="confirm-title" />
      <Modal.Body>
        <p className="text-[14px] text-text-secondary text-balance">{message}</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </Modal.Footer>
    </Modal>
  );
}
