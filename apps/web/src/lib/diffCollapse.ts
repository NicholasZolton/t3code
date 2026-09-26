export function isAutoCollapsedDiffFile(path: string): boolean {
  const parts = path.replaceAll("\\", "/").split("/");
  const filename = parts.pop() ?? "";
  return (
    parts.some((part) => /^(test|tests|__tests__|spec|specs)$/i.test(part)) ||
    /^test_.+\.[^/.]+$/i.test(filename) ||
    /[._-](test|tests|spec)\.[^/.]+$/i.test(filename) ||
    /(?:Test|Tests|Spec)\.[^/.]+$/.test(filename) ||
    /_snapshot\.json$/i.test(filename)
  );
}

export function areAllDiffFilesCollapsed(
  fileKeys: ReadonlyArray<string>,
  collapsedFileKeys: ReadonlySet<string>,
): boolean {
  return fileKeys.length > 0 && fileKeys.every((fileKey) => collapsedFileKeys.has(fileKey));
}

export function toggleAllDiffFiles(
  fileKeys: ReadonlyArray<string>,
  collapsedFileKeys: ReadonlySet<string>,
): ReadonlySet<string> {
  return areAllDiffFilesCollapsed(fileKeys, collapsedFileKeys) ? new Set() : new Set(fileKeys);
}
