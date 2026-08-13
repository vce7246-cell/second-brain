interface ViewStateProps {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'danger';
  busy?: boolean;
  compact?: boolean;
}

export function ViewState({
  title,
  detail,
  actionLabel,
  onAction,
  tone = 'neutral',
  busy = false,
  compact = false,
}: ViewStateProps) {
  const titleColor = tone === 'danger' ? 'text-red-600' : 'text-gray-600';
  const shellClass = compact
    ? 'px-3 py-2 text-xs'
    : 'flex h-full min-h-40 items-center justify-center px-6 text-sm';

  return (
    <div className={shellClass}>
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        {busy && (
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500"
            aria-hidden="true"
          />
        )}
        <p className={`font-medium ${titleColor}`}>{title}</p>
        {detail && <p className="text-xs leading-5 text-gray-400">{detail}</p>}
        {actionLabel && onAction && (
          <button
            className="rounded border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
