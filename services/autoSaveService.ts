/**
 * Auto-save service - 自动保存服务
 * 
 * 使用统一的文件系统接口，支持：
 * - Tauri 桌面应用：使用原生 API
 * - Windows/Linux 浏览器：使用 File System Access API
 * - macOS 浏览器：不支持，提示使用桌面版
 */

import { invoke } from '@tauri-apps/api/core';
import {
  selectRootDirectory,
  saveBinaryFile,
  DirectoryHandle,
  isTauriHandle,
  getDirectoryName as getHandleDirectoryName,
  getFullPath,
  isTauriEnvironment,
  supportsFileSystemAccessAPI,
  createTauriHandleFromPath,
  fileExists
} from './fileSystem';

// 重新导出检测函数
export { isTauriEnvironment as isTauri };

export function isFileSystemAccessSupported(): boolean {
  return isTauriEnvironment() || supportsFileSystemAccessAPI();
}

// IndexedDB 配置 - 仅用于浏览器模式
const DB_NAME = 'rh_autosave_db';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'directoryHandle';
type BrowserDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
};

// 内存状态
let directoryHandle: DirectoryHandle | null = null;
let savedDirectoryPath: string | null = null; // 用于 Tauri 模式持久化

// 序列命名缓存
const sequenceCache = new Map<string, number>();

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
const RESERVED_WINDOWS_FILENAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function sanitizeFilenamePart(value: string, fallback = 'file'): string {
  const cleaned = value
    .replace(INVALID_FILENAME_CHARS, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  const normalized = cleaned || fallback;
  return RESERVED_WINDOWS_FILENAMES.test(normalized) ? `${normalized}_` : normalized;
}

function sanitizeExtension(extension?: string): string {
  if (!extension) {
    return '';
  }

  return extension
    .replace(/^\.+/, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F.\s]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function splitFilename(filename: string): { base: string; extension: string } {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return { base: filename, extension: '' };
  }

  return {
    base: filename.slice(0, lastDot),
    extension: filename.slice(lastDot + 1),
  };
}

function buildSanitizedFilename(baseName: string, extension?: string, fallbackBase = 'file'): string {
  const safeBase = sanitizeFilenamePart(baseName, fallbackBase);
  const safeExtension = sanitizeExtension(extension);
  return safeExtension ? `${safeBase}.${safeExtension}` : safeBase;
}

function sanitizeFilename(filename: string, fallbackBase = 'file'): string {
  const { base, extension } = splitFilename(filename);
  return buildSanitizedFilename(base || fallbackBase, extension, fallbackBase);
}

async function checkTauriDirectoryPathAccess(path: string | null | undefined): Promise<boolean> {
  if (!path) {
    return false;
  }

  try {
    return await invoke<boolean>('check_directory_writable', { path });
  } catch (e) {
    console.error('Failed to verify Tauri directory access:', e);
    return false;
  }
}

// ============================================================================
// IndexedDB 操作（浏览器模式）
// ============================================================================

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

async function saveHandleToDB(handle: BrowserDirectoryHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(handle, HANDLE_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function loadHandleFromDB(): Promise<BrowserDirectoryHandle | null> {
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

// ============================================================================
// Tauri 配置持久化（Tauri 模式）- 使用 Rust 后端配置文件
// ============================================================================

/**
 * 保存目录配置到 Rust 后端（持久化到应用配置目录）
 */
async function saveTauriConfig(path: string): Promise<void> {
  try {
    await invoke('save_directory_config', { path });
  } catch (e) {
    console.error('Failed to save Tauri config:', e);
    throw e;
  }
}

/**
 * 从 Rust 后端加载保存的目录配置
 */
async function loadTauriConfig(): Promise<string | null> {
  try {
    return await invoke<string | null>('get_saved_directory');
  } catch (e) {
    console.error('Failed to load Tauri config:', e);
    return null;
  }
}

/**
 * 清除 Rust 后端的目录配置
 */
async function clearTauriConfig(): Promise<void> {
  try {
    await invoke('clear_save_directory');
  } catch (e) {
    console.error('Failed to clear Tauri config:', e);
  }
}

// ============================================================================
// 公共 API
// ============================================================================

/**
 * 选择保存目录
 * @returns 目录名称（成功）或 null（取消/失败）
 */
export async function selectDirectory(): Promise<string | null> {
  const handle = await selectRootDirectory();
  
  if (!handle) {
    return null;
  }
  
  directoryHandle = handle;
  
  // Tauri 模式：保存路径到配置
  if (isTauriHandle(handle)) {
    savedDirectoryPath = handle.path;
    await saveTauriConfig(handle.path);
  } else {
    // 浏览器模式：保存 handle 到 IndexedDB
    await saveHandleToDB(handle as BrowserDirectoryHandle);
  }
  
  return getHandleDirectoryName(handle);
}

/**
 * 初始化自动保存服务
 * @returns 目录名称（恢复成功）或 null
 */
export async function initAutoSave(fallbackDirectoryPath?: string | null): Promise<string | null> {
  console.log('[AutoSave] Initializing auto-save service...');
  console.log('[AutoSave] Tauri environment:', isTauriEnvironment());
  
  // Tauri 模式：从配置恢复路径
  if (isTauriEnvironment()) {
    console.log('[AutoSave] Tauri mode: loading config from Rust backend...');
    let savedPath = await loadTauriConfig();
    if (!savedPath && fallbackDirectoryPath && await checkTauriDirectoryPathAccess(fallbackDirectoryPath)) {
      console.log('[AutoSave] Rust config missing, trying local fallback path:', fallbackDirectoryPath);
      try {
        await saveTauriConfig(fallbackDirectoryPath);
        savedPath = fallbackDirectoryPath;
      } catch (e) {
        console.error('[AutoSave] Failed to rehydrate Rust config from fallback path:', e);
      }
    }
    console.log('[AutoSave] Loaded path from Rust:', savedPath);
    if (savedPath) {
      try {
        const hasAccess = await checkTauriDirectoryPathAccess(savedPath);
        if (!hasAccess) {
          throw new Error('Saved directory is not writable');
        }
        directoryHandle = createTauriHandleFromPath(savedPath);
        savedDirectoryPath = savedPath;
        const dirName = getDirNameFromPath(savedPath);
        console.log('[AutoSave] Tauri directory restored:', dirName);
        return dirName;
      } catch (e) {
        console.error('[AutoSave] Failed to restore Tauri directory:', e);
        await clearTauriConfig();
      }
    }
    console.log('[AutoSave] No saved directory found in Tauri config');
    return null;
  }
  
  // 浏览器模式：从 IndexedDB 恢复
  if (!supportsFileSystemAccessAPI()) {
    console.log('[AutoSave] Browser does not support File System Access API');
    return null;
  }
  
  console.log('[AutoSave] Browser mode: loading handle from IndexedDB...');
  try {
    const savedHandle = await loadHandleFromDB();
    if (!savedHandle) {
      console.log('[AutoSave] No saved handle found in IndexedDB');
      return null;
    }
    
    // 检查权限
    const permission = await savedHandle.queryPermission({ mode: 'readwrite' });
    console.log('[AutoSave] Permission status:', permission);
    
    if (permission === 'granted') {
      directoryHandle = savedHandle;
      console.log('[AutoSave] Browser directory restored:', savedHandle.name);
      return savedHandle.name;
    }
    
    // 请求权限
    console.log('[AutoSave] Requesting permission...');
    const newPermission = await savedHandle.requestPermission({ mode: 'readwrite' });
    console.log('[AutoSave] New permission status:', newPermission);
    
    if (newPermission === 'granted') {
      directoryHandle = savedHandle;
      return savedHandle.name;
    }
    
    await clearHandleFromDB();
    return null;
  } catch (e: any) {
    console.error('[AutoSave] Failed to init auto-save:', e);
    await clearHandleFromDB();
    return null;
  }
}

/**
 * 检查是否有目录访问权限
 */
export function hasDirectoryAccess(): boolean {
  return directoryHandle !== null;
}

/**
 * 获取当前目录名称
 */
export function getDirectoryName(): string | null {
  if (!directoryHandle) {
    return null;
  }
  return getDirectoryNameFromHandle(directoryHandle);
}

export function getCurrentDirectoryPath(): string | null {
  if (savedDirectoryPath) {
    return savedDirectoryPath;
  }

  if (directoryHandle && isTauriHandle(directoryHandle)) {
    return directoryHandle.path;
  }

  return directoryHandle ? getFullPath(directoryHandle) : null;
}

/**
 * 检查目录访问权限
 */
export async function checkDirectoryAccess(): Promise<boolean> {
  if (!directoryHandle) {
    return false;
  }
  
  // Tauri 模式：检查路径是否有效
  if (isTauriHandle(directoryHandle)) {
    return checkTauriDirectoryPathAccess(directoryHandle.path);
  }
  
  // 浏览器模式：检查权限
  try {
    const permission = await (directoryHandle as BrowserDirectoryHandle).queryPermission({ mode: 'readwrite' });
    return permission === 'granted';
  } catch (e) {
    console.error('Failed to check directory access:', e);
    return false;
  }
}

/**
 * 请求目录权限（浏览器模式）
 */
export async function requestDirectoryPermission(): Promise<boolean> {
  if (isTauriEnvironment()) {
    return directoryHandle !== null;
  }
  
  if (!directoryHandle) {
    return false;
  }
  
  try {
    const permission = await (directoryHandle as BrowserDirectoryHandle).requestPermission({ mode: 'readwrite' });
    return permission === 'granted';
  } catch (e) {
    console.error('Failed to request directory permission:', e);
    return false;
  }
}

/**
 * 清除目录配置
 */
export async function clearDirectory(): Promise<void> {
  directoryHandle = null;
  savedDirectoryPath = null;
  
  if (isTauriEnvironment()) {
    await clearTauriConfig();
  } else {
    await clearHandleFromDB();
  }
}

// ============================================================================
// 文件保存 API
// ============================================================================

export interface FileToSave {
  url: string;
  extension?: string;
  filename?: string;
  sequential?: boolean;
}

/**
 * 从 URL 保存文件
 * 
 * @param url 文件 URL
 * @param filename 可选自定义文件名
 * @param extension 可选文件扩展名
 * @param sequential 是否使用序列命名
 */
export async function saveFileFromUrl(
  url: string,
  filename?: string,
  extension?: string,
  sequential?: boolean
): Promise<boolean> {
  if (!directoryHandle) {
    throw new Error('未选择保存目录');
  }
  
  console.log(`[AutoSave] Starting to save file: ${filename || url}`);
  
  // Tauri 模式：直接使用 Rust 后端下载并保存，解决跨域和 Blob 限制
  // 注意：如果是 blob: URL，Rust 后端无法访问，必须在浏览器端处理
  if (isTauriEnvironment() && !url.startsWith('blob:')) {
    try {
      let finalFilename = filename;
      let ext = sanitizeExtension(extension);
      
      // 如果没有提供文件名，从 URL 解析
      if (!finalFilename) {
        const urlPath = new URL(url).pathname;
        finalFilename = urlPath.split('/').pop() || `file_${Date.now()}`;
      }
      
      // 序列命名逻辑
      if (sequential && filename) {
        if (!ext) ext = 'bin';
        
        const baseName = sanitizeFilenamePart(filename, 'file');
        const cacheKey = `${baseName}.${ext}`;
        let index = sequenceCache.get(cacheKey) || 1;
        
        // 查找下一个可用的序号，调用后端的 check_file_exists
        while (true) {
          const suffix = String(index).padStart(5, '0');
          const candidate = `${baseName}_${suffix}.${ext}`;
          
          const exists = await invoke<boolean>('check_file_exists', { filename: candidate });
          if (exists) {
            index++;
          } else {
            finalFilename = candidate;
            sequenceCache.set(cacheKey, index + 1);
            break;
          }
          
          // 安全限制
          if (index > 100000) throw new Error('Too many sequential files');
        }
      } else if (!filename) {
        // 默认行为：添加时间戳
        const fileExt = finalFilename.includes('.')
          ? finalFilename.substring(finalFilename.lastIndexOf('.') + 1)
          : '';
        const fileBase = finalFilename.includes('.')
          ? finalFilename.substring(0, finalFilename.lastIndexOf('.'))
          : finalFilename;
        
        if (fileExt) ext = fileExt;
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        finalFilename = `${fileBase}_${timestamp}.${ext || fileExt || 'bin'}`;
      }

      if (ext && !sequential) {
        const { base, extension: currentExt } = splitFilename(finalFilename);
        finalFilename = currentExt
          ? buildSanitizedFilename(base, currentExt, 'file')
          : buildSanitizedFilename(base, ext, 'file');
      } else {
        finalFilename = sanitizeFilename(finalFilename, 'file');
      }
      
      console.log(`[AutoSave] Tauri invoking save_file_from_url for ${finalFilename}`);
      const savedPath = await invoke<string>('save_file_from_url', {
        url,
        filename: finalFilename
      });
      
      console.log(`[AutoSave] Tauri saved successfully: ${savedPath}`);
      return true;
    } catch (e) {
      console.error('[AutoSave] Tauri save failed:', e);
      throw e;
    }
  }

  // 浏览器模式行为 (非 Tauri) 或者 Tauri 下处理 blob: URL
  // 下载文件
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败: ${response.statusText}`);
  }
  
  const blob = await response.blob();
  console.log(`[AutoSave] Downloaded file, size: ${blob.size} bytes`);
  
  // 确定文件名
  let finalFilename = filename;
  let ext = sanitizeExtension(extension);
  
  // 如果没有提供文件名，尝试从 URL 或 Blob 类型提取
  if (!finalFilename) {
    if (url.startsWith('blob:')) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      if (!ext && blob.type) {
        const mimeExt = blob.type.split('/')[1]?.replace('jpeg', 'jpg');
        ext = sanitizeExtension(mimeExt) || 'bin';
      }
      if (!ext) ext = 'bin';
      finalFilename = `decoded_${timestamp}.${ext}`;
    } else {
      const urlPath = new URL(url).pathname;
      finalFilename = urlPath.split('/').pop() || `file_${Date.now()}`;
    }
  }
  
  // 序列命名逻辑
  if (sequential && filename) {
    if (!ext && blob.type) {
      const mimeExt = blob.type.split('/')[1]?.replace('jpeg', 'jpg');
      ext = sanitizeExtension(mimeExt) || 'bin';
    }
    if (!ext) ext = 'bin';
    
    const baseName = sanitizeFilenamePart(filename, 'file');
    const cacheKey = `${baseName}.${ext}`;
    let index = sequenceCache.get(cacheKey) || 1;
    
    // 查找下一个可用的序号
    while (true) {
      const suffix = String(index).padStart(5, '0');
      const candidate = `${baseName}_${suffix}.${ext}`;
      
      const exists = await fileExists(directoryHandle, candidate);
      if (exists) {
        index++;
      } else {
        finalFilename = candidate;
        sequenceCache.set(cacheKey, index + 1);
        break;
      }
      
      // 安全限制
      if (index > 100000) throw new Error('Too many sequential files');
    }
  } else if (!url.startsWith('blob:') && !filename) {
    // 默认行为：添加时间戳
    const fileExt = finalFilename.includes('.')
      ? finalFilename.substring(finalFilename.lastIndexOf('.') + 1)
      : '';
    const fileBase = finalFilename.includes('.')
      ? finalFilename.substring(0, finalFilename.lastIndexOf('.'))
      : finalFilename;
    
    if (fileExt) ext = fileExt;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    finalFilename = `${fileBase}_${timestamp}.${ext || fileExt || 'bin'}`;
  }

  if (ext && !sequential) {
    const { base, extension: currentExt } = splitFilename(finalFilename);
    finalFilename = currentExt
      ? buildSanitizedFilename(base, currentExt, 'file')
      : buildSanitizedFilename(base, ext, 'file');
  } else {
    finalFilename = sanitizeFilename(finalFilename, 'file');
  }

  if (isTauriEnvironment()) {
    try {
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      const savedPath = await invoke<string>('save_binary_file', {
        filename: finalFilename,
        data: bytes,
      });

      console.log(`[AutoSave] Tauri binary saved successfully: ${savedPath}`);
      return true;
    } catch (e) {
      console.error('[AutoSave] Tauri binary save failed:', e);
      throw e;
    }
  }
  
  // 保存文件
  const success = await saveBinaryFile(directoryHandle, finalFilename, blob);
  
  if (success) {
    console.log(`[AutoSave] Saved: ${finalFilename}`);
  } else {
    throw new Error('保存文件失败');
  }
  
  return true;
}

/**
 * 保存多个文件
 * @param files 文件数组
 * @returns 成功保存的文件数量
 */
export async function saveMultipleFiles(files: (string | FileToSave)[]): Promise<number> {
  console.log('[AutoSave] saveMultipleFiles called, files count:', files.length);
  console.log('[AutoSave] directoryHandle exists:', !!directoryHandle);
  
  if (!directoryHandle) {
    console.error('[AutoSave] No directory configured. Auto-save is disabled.');
    return 0;
  }
  
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
  
  console.log(`[AutoSave] Saved ${successCount}/${files.length} files`);
  return successCount;
}

// ============================================================================
// 辅助函数
// ============================================================================

function getDirNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || path;
}

function getDirectoryNameFromHandle(handle: DirectoryHandle): string {
  if (isTauriHandle(handle)) {
    return getDirNameFromPath(handle.path);
  }
  return handle.name;
}
