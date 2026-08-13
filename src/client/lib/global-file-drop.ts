interface FileDropEventTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface GlobalFileDropCallbacks {
  onDraggingChange: (dragging: boolean) => void;
  onTransferDrop: (transfer: DataTransfer) => void;
}

function hasFiles(event: DragEvent): boolean {
  return Boolean(event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files'));
}

export function bindGlobalFileDrop(
  target: FileDropEventTarget,
  callbacks: GlobalFileDropCallbacks
): () => void {
  const { onDraggingChange, onTransferDrop } = callbacks;

  const dragEnter: EventListener = (rawEvent) => {
    const event = rawEvent as DragEvent;
    if (event.defaultPrevented) {
      onDraggingChange(false);
      return;
    }
    if (!hasFiles(event)) return;
    event.preventDefault();
    onDraggingChange(true);
  };

  const dragOver: EventListener = (rawEvent) => {
    const event = rawEvent as DragEvent;
    if (event.defaultPrevented) {
      onDraggingChange(false);
      return;
    }
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    onDraggingChange(true);
  };

  const dragLeave: EventListener = (rawEvent) => {
    const event = rawEvent as DragEvent;
    if (!event.defaultPrevented && event.relatedTarget === null) onDraggingChange(false);
  };

  const drop: EventListener = (rawEvent) => {
    const event = rawEvent as DragEvent;
    onDraggingChange(false);
    if (event.defaultPrevented || !hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) onTransferDrop(event.dataTransfer);
  };

  const dragEnd: EventListener = () => onDraggingChange(false);
  target.addEventListener('dragenter', dragEnter);
  target.addEventListener('dragover', dragOver);
  target.addEventListener('dragleave', dragLeave);
  target.addEventListener('drop', drop);
  target.addEventListener('dragend', dragEnd);

  return () => {
    target.removeEventListener('dragenter', dragEnter);
    target.removeEventListener('dragover', dragOver);
    target.removeEventListener('dragleave', dragLeave);
    target.removeEventListener('drop', drop);
    target.removeEventListener('dragend', dragEnd);
  };
}
