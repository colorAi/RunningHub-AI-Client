/**
 * Auto-save service using File System Access API
 * Provides directory selection and file saving capabilities
 */

// Store the directory handle in memory (will be lost on page refresh)
let directoryHandle: FileSystemDirectoryHandle | null = null;

// IndexedDB for persisting the directory handle
const DB_NAME = 'rh_autosave_db';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'directoryHandle';

/**
 * Open IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

/**
 * Save directory handle to IndexedDB for persistence
 */
async function saveHandleToDB(handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(handle, HANDLE_KEY);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

/**
 * Load directory handle from IndexedDB
 */
async function loadHandleFromDB(): Promise<FileSystemDirectoryHandle | null> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(HANDLE_KEY);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || null);
        });
    } catch (e) {
        console.error('Failed to load handle from DB:', e);
        return null;
    }
}

/**
 * Clear directory handle from IndexedDB
 */
async function clearHandleFromDB(): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(HANDLE_KEY);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (e) {
        console.error('Failed to clear handle from DB:', e);
    }
}

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported(): boolean {
    return 'showDirectoryPicker' in window;
}

/**
 * Select a directory for auto-save
 * @returns Directory name if successful, null if cancelled or failed
 */
export async function selectDirectory(): Promise<string | null> {
    if (!isFileSystemAccessSupported()) {
        throw new Error('您的浏览器不支持目录选择功能，请使用 Chrome 或 Edge 浏览器');
    }

    try {
        // @ts-ignore - showDirectoryPicker is not in TypeScript types yet
        const handle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'downloads'
        });

        directoryHandle = handle;
        await saveHandleToDB(handle);

        return handle.name;
    } catch (e: any) {
        if (e.name === 'AbortError') {
            // User cancelled
            return null;
        }
        throw e;
    }
}

/**
 * Initialize the service - try to restore the directory handle from IndexedDB
 * @returns Directory name if restored and still has permission, null otherwise
 */
export async function initAutoSave(): Promise<string | null> {
    if (!isFileSystemAccessSupported()) {
        return null;
    }

    try {
        const savedHandle = await loadHandleFromDB();
        if (!savedHandle) {
            return null;
        }

        // Verify we still have permission
        // @ts-ignore - queryPermission is not in TypeScript types yet
        const permission = await savedHandle.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
            directoryHandle = savedHandle;
            return savedHandle.name;
        }

        // Try to request permission
        // @ts-ignore - requestPermission is not in TypeScript types yet
        const newPermission = await savedHandle.requestPermission({ mode: 'readwrite' });
        if (newPermission === 'granted') {
            directoryHandle = savedHandle;
            return savedHandle.name;
        }

        // Permission denied, clear the saved handle
        await clearHandleFromDB();
        return null;
    } catch (e) {
        console.error('Failed to init auto-save:', e);
        return null;
    }
}

/**
 * Check if we have a valid directory handle
 */
export function hasDirectoryAccess(): boolean {
    return directoryHandle !== null;
}

/**
 * Get the current directory name
 */
export function getDirectoryName(): string | null {
    return directoryHandle?.name || null;
}

/**
 * Clear the directory handle
 */
export async function clearDirectory(): Promise<void> {
    directoryHandle = null;
    await clearHandleFromDB();
}

/**
 * Save a file from URL to the selected directory
 * @param url URL of the file to download
 * @param filename Optional custom filename (will extract from URL if not provided)
 * @param extension Optional file extension for blob URLs
 */
// Cache for sequential file indexing to avoid redundant checks
const sequenceCache = new Map<string, number>();

/**
 * Save a file from URL to the selected directory
 * @param url URL of the file to download
 * @param filename Optional custom filename (will extract from URL if not provided)
 * @param extension Optional file extension for blob URLs
 * @param sequential If true, ensures filename is unique by appending sequential number
 */
export async function saveFileFromUrl(url: string, filename?: string, extension?: string, sequential?: boolean): Promise<boolean> {
    if (!directoryHandle) {
        throw new Error('未选择保存目录');
    }

    try {
        // Fetch the file
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`下载失败: ${response.statusText}`);
        }

        const blob = await response.blob();

        // Determine filename and extension
        let finalFilename = filename;
        let ext = extension || '';

        // If no filename provided, try to extract from URL or Blob
        if (!finalFilename) {
            if (url.startsWith('blob:')) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                if (!ext && blob.type) {
                    const mimeExt = blob.type.split('/')[1]?.replace('jpeg', 'jpg');
                    ext = mimeExt || 'bin';
                }
                finalFilename = `decoded_${timestamp}.${ext}`;
            } else {
                const urlPath = new URL(url).pathname;
                finalFilename = urlPath.split('/').pop() || `file_${Date.now()}`;
            }
        }

        // Logic for Sequential Naming or Timestamping
        if (sequential && filename) {
            // We expect filename to be the "base name" without index or extension if sequential is true
            // E.g. "test_T001"

            // Ensure extension is present
            if (!ext && blob.type) {
                const mimeExt = blob.type.split('/')[1]?.replace('jpeg', 'jpg');
                ext = mimeExt || 'bin';
            }
            if (!ext) ext = 'bin'; // Fallback

            const baseName = filename;
            const cacheKey = `${baseName}.${ext}`;
            let index = sequenceCache.get(cacheKey) || 1;

            // Find next available index
            while (true) {
                const suffix = String(index).padStart(5, '0');
                const candidate = `${baseName}_${suffix}.${ext}`;
                try {
                    // Check if file exists without creating
                    await directoryHandle.getFileHandle(candidate);
                    // If no error, file exists, try next
                    index++;
                } catch (e: any) {
                    if (e.name === 'NotFoundError') {
                        // File does not exist, use this name
                        finalFilename = candidate;
                        sequenceCache.set(cacheKey, index + 1); // Update cache for next time
                        break;
                    }
                    throw e; // Other errors
                }
                // Safety break
                if (index > 100000) throw new Error('Too many sequential files');
            }
        } else if (!url.startsWith('blob:') && !filename) {
            // Default behavior for generic URLs without custom name: append timestamp
            const fileExt = finalFilename.includes('.')
                ? finalFilename.substring(finalFilename.lastIndexOf('.') + 1)
                : '';
            const fileBase = finalFilename.includes('.')
                ? finalFilename.substring(0, finalFilename.lastIndexOf('.'))
                : finalFilename;

            // If extension was undetermined effectively, update it
            if (fileExt) ext = fileExt;

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            finalFilename = `${fileBase}_${timestamp}.${ext}`;
        }

        // Final sanity check for extension if provided explicitly but not in filename
        // (Only if we didn't just construct it in sequential block)
        if (extension && !finalFilename.endsWith(`.${extension}`) && !sequential) {
            // If filename was passed fully formed like "foo.png", we don't double append
            // If filename was just "foo", we might need to append
            if (!finalFilename.includes('.')) {
                finalFilename = `${finalFilename}.${extension}`;
            }
        }

        // Create file in directory
        const fileHandle = await directoryHandle.getFileHandle(finalFilename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();

        console.log(`[AutoSave] Saved: ${finalFilename}`);
        return true;
    } catch (e: any) {
        console.error('[AutoSave] Save failed:', e);
        throw e;
    }
}

export interface FileToSave {
    url: string;
    extension?: string;
    filename?: string;
    sequential?: boolean;
}

/**
 * Save multiple files from URLs
 * @param files Array of file info objects with url and optional extension
 * @returns Number of successfully saved files
 */
export async function saveMultipleFiles(files: (string | FileToSave)[]): Promise<number> {
    let successCount = 0;

    for (const file of files) {
        try {
            if (typeof file === 'string') {
                await saveFileFromUrl(file);
            } else {
                await saveFileFromUrl(file.url, file.filename, file.extension, file.sequential);
            }
            successCount++;
        } catch (e) {
            const url = typeof file === 'string' ? file : file.url;
            console.error(`[AutoSave] Failed to save ${url}:`, e);
        }
    }

    return successCount;
}

