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
 */
export async function saveFileFromUrl(url: string, filename?: string): Promise<boolean> {
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

        // Determine filename
        let finalFilename = filename;
        if (!finalFilename) {
            const urlPath = new URL(url).pathname;
            finalFilename = urlPath.split('/').pop() || `file_${Date.now()}`;
        }

        // Ensure unique filename by adding timestamp if needed
        const ext = finalFilename.includes('.')
            ? finalFilename.substring(finalFilename.lastIndexOf('.'))
            : '';
        const baseName = finalFilename.includes('.')
            ? finalFilename.substring(0, finalFilename.lastIndexOf('.'))
            : finalFilename;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        finalFilename = `${baseName}_${timestamp}${ext}`;

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

/**
 * Save multiple files from URLs
 * @param urls Array of file URLs to save
 * @returns Number of successfully saved files
 */
export async function saveMultipleFiles(urls: string[]): Promise<number> {
    let successCount = 0;

    for (const url of urls) {
        try {
            await saveFileFromUrl(url);
            successCount++;
        } catch (e) {
            console.error(`[AutoSave] Failed to save ${url}:`, e);
        }
    }

    return successCount;
}
