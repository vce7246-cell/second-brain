import { useCallback, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog.js';

interface ConfirmActionOptions {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
}

interface ConfirmActionState extends ConfirmActionOptions {
  action: () => void;
}

export function useConfirmAction() {
  const [state, setState] = useState<ConfirmActionState | null>(null);

  const confirmAction = useCallback((options: ConfirmActionOptions, action: () => void) => {
    setState({ ...options, action });
  }, []);

  const closeConfirm = useCallback(() => setState(null), []);

  const confirmDialog = (
    <ConfirmDialog
      open={Boolean(state)}
      title={state?.title ?? ''}
      description={state?.description ?? ''}
      confirmLabel={state?.confirmLabel ?? '确认'}
      tone={state?.tone}
      onCancel={closeConfirm}
      onConfirm={() => {
        const action = state?.action;
        setState(null);
        action?.();
      }}
    />
  );

  return { confirmAction, confirmDialog };
}
