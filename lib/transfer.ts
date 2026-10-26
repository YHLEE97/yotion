const MAX_TEXT = 32_768;
export type TransferSample = {
  id: string;
  capturedAt: string;
  kind: 'paste' | 'drop';
  userAgent: string;
  types: string[];
  items: { kind: string; type: string }[];
  strings: { type: string; value: string; truncated: boolean }[];
  files: { name: string; type: string; size: number; lastModified: number }[];
};

export function captureTransfer(data: DataTransfer, kind: TransferSample['kind']): TransferSample {
  return {
    id: crypto.randomUUID(), capturedAt: new Date().toISOString(), kind,
    userAgent: navigator.userAgent, types: Array.from(data.types),
    items: Array.from(data.items).map(({ kind, type }) => ({ kind, type })),
    strings: Array.from(data.types).filter(type => type !== 'Files').map(type => {
      const value = data.getData(type);
      return { type, value: value.slice(0, MAX_TEXT), truncated: value.length > MAX_TEXT };
    }),
    files: Array.from(data.files).map(({ name, type, size, lastModified }) => ({ name, type, size, lastModified })),
  };
}

export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
