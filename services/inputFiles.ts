import { open } from '@tauri-apps/plugin-dialog';
import { createTauriHandleFromPath, isTauriEnvironment, TauriFileHandle } from './tauriFileSystem';

export async function selectInputDirectory() {
  if (isTauriEnvironment()) {
    const path = await open({ directory: true, recursive: true, multiple: false, title: '选择导入文件夹' });
    return typeof path === 'string' ? createTauriHandleFromPath(path) : null;
  }
  try {
    return await (window as any).showDirectoryPicker({ mode: 'read' });
  } catch (error: any) {
    if (error.name === 'AbortError') return null;
    throw error;
  }
}

export async function selectInputFiles(options: {
  description: string;
  accept: Record<string, string[]>;
  multiple: boolean;
}): Promise<File[]> {
  if (isTauriEnvironment()) {
    const selected = await open({
      directory: false,
      multiple: options.multiple,
      filters: [{ name: options.description, extensions: Object.values(options.accept).flat().map(ext => ext.replace(/^\./, '')) }],
    });
    const paths = typeof selected === 'string' ? [selected] : selected || [];
    return Promise.all(paths.map(path => {
      const name = path.split(/[\\/]/).pop() || 'file';
      return new TauriFileHandle(name, path, '').getFile();
    }));
  }
  try {
    const handles = await (window as any).showOpenFilePicker({
      types: [{ description: options.description, accept: options.accept }],
      multiple: options.multiple,
    });
    return Promise.all(handles.map((handle: FileSystemFileHandle) => handle.getFile()));
  } catch (error: any) {
    if (error.name === 'AbortError') return [];
    throw error;
  }
}
