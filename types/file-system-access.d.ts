// The directory picker is implemented by Chromium but not included in lib.dom.
interface Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

interface FileSystemDirectoryHandle {
  requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}
