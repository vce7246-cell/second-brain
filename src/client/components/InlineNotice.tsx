import type { ReactNode } from 'react';

type InlineNoticeTone = 'danger' | 'warning' | 'info';

interface InlineNoticeProps {
  children: ReactNode;
  tone?: InlineNoticeTone;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
  className?: string;
}

const toneClasses: Record<InlineNoticeTone, string> = {
  danger: 'border-red-100 bg-red-50 text-red-600 hover:[&_button]:bg-red-100',
  warning: 'border-yellow-100 bg-yellow-50 text-yellow-700 hover:[&_button]:bg-yellow-100',
  info: 'border-blue-100 bg-blue-50 text-blue-700 hover:[&_button]:bg-blue-100',
};

export function InlineNotice({
  children,
  tone = 'info',
  actionLabel,
  onAction,
  onClose,
  className = '',
}: InlineNoticeProps) {
  return (
    <div className={`flex items-center gap-2 border px-2 py-1.5 text-xs ${toneClasses[tone]} ${className}`}>
      <span className="min-w-0 flex-1">{children}</span>
      {actionLabel && onAction && (
        <button className="shrink-0 rounded px-1.5 py-0.5 underline" onClick={onAction}>
          {actionLabel}
        </button>
      )}
      {onClose && (
        <button className="shrink-0 rounded px-1.5 py-0.5" onClick={onClose}>
          关闭
        </button>
      )}
    </div>
  );
}
