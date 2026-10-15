import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useScrollLock } from '@/hooks/misc';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** دیالوگ ساده با مدیریت فوکوس، بستن با Esc و قفل اسکرول */
export function Modal({ open, onClose, title, children }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // فوکوس اولیه
    const btn = ref.current?.querySelector<HTMLElement>('button, [href], input');
    btn?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'تأیید',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p>{message}</p>
      <div className="modal-actions">
        <button type="button" className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          انصراف
        </button>
      </div>
    </Modal>
  );
}

export function PanelClose({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="tbtn panel-close" onClick={onClose} aria-label="بستن">
      <X size={18} />
    </button>
  );
}
