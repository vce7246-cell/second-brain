export function importTargetDirectory(selectedPath: string | null): string {
  if (!selectedPath) return '';
  const normalized = selectedPath.replace(/\\/g, '/');
  const separator = normalized.lastIndexOf('/');
  return separator < 0 ? '' : normalized.slice(0, separator);
}

export function importDestinationPath(directory: string, fileName: string): string {
  return directory ? `${directory}/${fileName}` : fileName;
}
