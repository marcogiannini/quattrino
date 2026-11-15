/**
 * Differenze tra browser e app desktop (Tauri). Nel browser si usano i meccanismi standard;
 * nell'app desktop i download tramite link e le finestre di conferma del WebView non sono
 * affidabili su tutti i sistemi, quindi si usano le finestre di dialogo native.
 * I pacchetti Tauri vengono caricati solo quando servono.
 */

export const isDesktopApp = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type SaveResult = 'saved' | 'cancelled';

async function toBytes(data: BlobPart): Promise<Uint8Array> {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(await new Blob([data]).arrayBuffer());
}

export async function saveFile(name: string, data: BlobPart, mime: string): Promise<SaveResult> {
  if (isDesktopApp()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: name });
    if (!path) return 'cancelled';
    await writeFile(path, await toBytes(data));
    return 'saved';
  }
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}

export async function confirmAction(message: string): Promise<boolean> {
  if (isDesktopApp()) {
    const { ask } = await import('@tauri-apps/plugin-dialog');
    return ask(message, { title: 'Quattrino', kind: 'warning' });
  }
  return window.confirm(message);
}
