import { InlineNotice } from './InlineNotice.js';

type ConfirmDialogTone = 'danger' | 'primary';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  busy?: boolean;
  confirmDisabled?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const confirmClasses: Record<ConfirmDialogTone, string> = {
  danger: 'bg-red-600 text-white hover:bg-red-700',
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = '取消',
  tone = 'primary',
  busy = false,
  confirmDisabled = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onClick={onCancel}>
      <section
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h2 id="confirm-dialog-title" className="text-sm font-semibold text-gray-800">
          {title}
        </h2>
        <p className="mt-2 break-words text-sm leading-6 text-gray-600">{description}</p>
        {error && (
          <InlineNotice tone="danger" className="mt-3 rounded">
            {error}
          </InlineNotice>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            className={`rounded px-3 py-1.5 text-sm disabled:opacity-50 ${confirmClasses[tone]}`}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? '处理中...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
