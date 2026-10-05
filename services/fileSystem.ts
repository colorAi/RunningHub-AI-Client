/**
 * 跨平台文件系统服务
 * 支持 Tauri 桌面应用和浏览器环境
 * 
 * 提供统一的文件系统接口，自动适配不同运行环境：
 * - Tauri 桌面应用：使用原生 API
 * - 支持目录选择的浏览器（包括 macOS Chromium）：使用 File System Access API
 * - 其他浏览器：提示使用支持目录选择的浏览器或桌面版
 */

import { 
  isTauriEnvironment, 
  supportsFileSystemAccessAPI, 
  detectOS,
  selectDirectoryWithTauri,
  createTauriHandleFromPath,
  TauriDirectoryHandle,
  TauriFileHandle,
  isTauriHandle
} from './tauriFileSystem';

// 重新导出 Tauri 相关类型和函数
export { 
  TauriDirectoryHandle, 
  TauriFileHandle, 
  isTauriHandle,
  isTauriEnvironment,
  supportsFileSystemAccessAPI,
  detectOS,
  createTauriHandleFromPath
};

// 统一目录句柄类型
export type DirectoryHandle = FileSystemDirectoryHandle | TauriDirectoryHandle;
// 统一文件句柄类型
export type FileHandle = FileSystemFileHandle | TauriFileHandle;

/**
 * Prefer native dialogs in Tauri; browsers are selected by capability, never OS.
 * Keep the picker call before any await so the button's user activation is retained.
 * Cancellation returns null, while actionable errors are reported to the caller.
 */
export const selectRootDirectory = async (): Promise<DirectoryHandle | null> => {
  if (isTauriEnvironment()) return selectDirectoryWithTauri();

  if (!supportsFileSystemAccessAPI()) {
    throw new Error('当前浏览器或页面环境不支持选择文件夹，请使用最新版 Chrome、Edge 或桌面应用，并通过 HTTPS 或本机地址打开。');
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      throw new Error('未获得文件夹写入权限，请重新选择目录并允许读写。');
    }
    return handle;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === 'AbortError') return null;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new Error('浏览器未允许访问文件夹，请在本机地址或 HTTPS 页面中点击“选择目录”，并允许读写。');
    }
    throw error;
  }
};

// ============================================================================
// 核心功能 - 文件保存
// ============================================================================

/**
 * 保存文本文件
 * 
 * @param dirHandle 目录句柄
 * @param filename 文件名
 * @param content 文件内容（字符串）
 * @returns 是否保存成功
 */
export const saveTextFile = async (
  dirHandle: DirectoryHandle, 
  filename: string, 
  content: string
): Promise<boolean> => {
  try {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (e) {
    console.error("Failed to save text file", filename, e);
    return false;
  }
};

/**
 * 保存二进制文件
 * 
 * @param dirHandle 目录句柄
 * @param filename 文件名
 * @param blob 二进制数据（Blob）
 * @returns 是否保存成功
 */
export const saveBinaryFile = async (
  dirHandle: DirectoryHandle, 
  filename: string, 
  blob: Blob
): Promise<boolean> => {
  try {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (e) {
    console.error("Failed to save binary file", filename, e);
    return false;
  }
};

/**
 * 从 URL 保存文件
 * 
 * @param dirHandle 目录句柄
 * @param url 文件 URL
 * @param filename 文件名（可选，自动从 URL 提取）
 * @returns 是否保存成功
 */
export const saveFileFromUrl = async (
  dirHandle: DirectoryHandle,
  url: string,
  filename?: string
): Promise<boolean> => {
  try {
    console.log(`[FileSystem] Starting to save file: ${filename || url}`);
    
    // 下载文件
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载失败: ${response.statusText}`);
    }

    const blob = await response.blob();
    console.log(`[FileSystem] Downloaded file, size: ${blob.size} bytes`);

    // 确定文件名
    let finalFilename = filename;
    
    if (!finalFilename) {
      if (url.startsWith('blob:')) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const ext = blob.type ? blob.type.split('/')[1]?.replace('jpeg', 'jpg') : 'bin';
        finalFilename = `download_${timestamp}.${ext || 'bin'}`;
      } else {
        const urlPath = new URL(url).pathname;
        finalFilename = urlPath.split('/').pop() || `file_${Date.now()}`;
      }
    }

    // 保存文件
    const fileHandle = await dirHandle.getFileHandle(finalFilename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    console.log(`[FileSystem] Saved: ${finalFilename}`);
    return true;
  } catch (e) {
    console.error('[FileSystem] Save failed:', e);
    throw e;
  }
};

// ============================================================================
// 核心功能 - 文件读取
// ============================================================================

/**
 * 加载文件为 Object URL
 * 
 * @param dirHandle 目录句柄
 * @param filename 文件名
 * @returns Object URL 或 null
 */
export const loadFileAsUrl = async (
  dirHandle: DirectoryHandle, 
  filename: string
): Promise<string | null> => {
  try {
    const fileHandle = await dirHandle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return URL.createObjectURL(file);
  } catch (e) {
    return null;
  }
};

/**
 * 加载文件为文本
 * 
 * @param dirHandle 目录句柄
 * @param filename 文件名
 * @returns 文件内容文本或 null
 */
export const loadFileAsText = async (
  dirHandle: DirectoryHandle, 
  filename: string
): Promise<string | null> => {
  try {
    const fileHandle = await dirHandle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (e) {
    return null;
  }
};

// ============================================================================
// 核心功能 - 目录操作
// ============================================================================

/**
 * 检查文件是否存在
 * 
 * @param dirHandle 目录句柄
 * @param filename 文件名
 * @returns 文件是否存在
 */
export const fileExists = async (
  dirHandle: DirectoryHandle, 
  filename: string
): Promise<boolean> => {
  try {
    await dirHandle.getFileHandle(filename);
    return true;
  } catch (e: any) {
    if (e.name === 'NotFoundError') {
      return false;
    }
    throw e;
  }
};

/**
 * 删除文件
 * 
 * @param dirHandle 目录句柄
 * @param filename 文件名
 * @returns 是否删除成功
 */
export const deleteFile = async (
  dirHandle: DirectoryHandle, 
  filename: string
): Promise<boolean> => {
  try {
    await dirHandle.removeEntry(filename);
    return true;
  } catch (e) {
    console.error('Failed to delete file:', filename, e);
    return false;
  }
};

/**
 * 列出目录中的所有文件
 * 
 * @param dirHandle 目录句柄
 * @returns 文件和目录名称列表
 */
export const listFiles = async (
  dirHandle: DirectoryHandle
): Promise<{ name: string; kind: 'file' | 'directory' }[]> => {
  const results: { name: string; kind: 'file' | 'directory' }[] = [];
  
  try {
    const iterable = dirHandle as DirectoryHandle & {
      values: () => AsyncIterable<{ name: string; kind: 'file' | 'directory' }>;
    };
    for await (const entry of iterable.values()) {
      results.push({
        name: entry.name,
        kind: entry.kind
      });
    }
  } catch (e) {
    console.error('Failed to list files:', e);
  }
  
  return results;
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 获取目录名称
 * 
 * @param dirHandle 目录句柄
 * @returns 目录名称
 */
export const getDirectoryName = (dirHandle: DirectoryHandle): string => {
  return dirHandle.name;
};

/**
 * 获取 Tauri 目录的完整路径
 * 
 * @param dirHandle 目录句柄
 * @returns 完整路径（仅 Tauri 环境）或 null
 */
export const getFullPath = (dirHandle: DirectoryHandle): string | null => {
  if (isTauriHandle(dirHandle)) {
    return dirHandle.path;
  }
  return null;
};
