/**
 * 跨平台文件系统服务
 * 支持 Tauri 桌面应用和浏览器环境
 * 
 * 提供统一的文件系统接口，自动适配不同运行环境：
 * - Tauri 桌面应用：使用原生 API
 * - Windows/Linux 浏览器：使用 File System Access API
 * - macOS 浏览器：不支持，提示使用桌面版
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
 * 检查是否为 macOS 系统
 */
const isMacOS = (): boolean => detectOS() === 'macos';

/**
 * 检查是否为 Windows 系统
 */
const isWindows = (): boolean => detectOS() === 'windows';

// ============================================================================
// 核心功能 - 目录选择
// ============================================================================

/**
 * 选择根目录
 * 根据环境自动选择最佳实现方式
 * 
 * @returns 目录句柄（TauriDirectoryHandle 或 FileSystemDirectoryHandle）或 null
 */
export const selectRootDirectory = async (): Promise<DirectoryHandle | null> => {
  const os = detectOS();
  const inTauri = isTauriEnvironment();
  const supportsWebFS = supportsFileSystemAccessAPI();
  
  console.log('[Platform] ========== 系统检测 ==========');
  console.log('[Platform] 操作系统:', os);
  console.log('[Platform] Tauri 环境:', inTauri);
  console.log('[Platform] WebFS 支持:', supportsWebFS);
  console.log('[Platform] =================================');
  
  // ========== Tauri 桌面应用策略 ==========
  if (inTauri) {
    console.log('[Platform] Tauri 环境检测到 - 使用原生对话框');
    
    try {
      const handle = await selectDirectoryWithTauri();
      if (handle) {
        console.log('[Platform] Tauri 目录选择成功:', handle.name);
      }
      return handle;
    } catch (e) {
      console.error('[Platform] Tauri 选择失败:', e);
      return null;
    }
  }
  
  // ========== macOS 浏览器策略 ==========
  if (isMacOS()) {
    console.log('[Platform] macOS 浏览器检测到 - 不支持 File System Access API');
    
    alert('🍎 macOS 系统提示\n\n' +
          '当前浏览器不支持文件夹访问功能。\n\n' +
          '请使用桌面应用版本：\n' +
          '1. 下载 H-set 桌面版 App\n' +
          '2. 或在 Windows 系统上使用 Chrome/Edge 浏览器');
    return null;
  }
  
  // ========== Windows/Linux 浏览器策略 ==========
  console.log('[Platform] 浏览器环境 - 尝试 Web API');
  
  if (supportsWebFS) {
    try {
      const handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      });
      
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        alert('需要读写权限才能正常使用应用。请重新选择目录并授予权限。');
        return null;
      }
      
      console.log('[Platform] Web API 目录选择成功');
      return handle as FileSystemDirectoryHandle;
    } catch (e) {
      console.error("User cancelled or failed to select folder", e);
      return null;
    }
  }
  
  // ========== 不支持的环境 ==========
  alert('⚠️ 不支持的操作系统或浏览器\n\n' +
        '您的系统：' + os + '\n' +
        'platform: ' + navigator.platform + '\n\n' +
        '支持的平台：\n' +
        '• macOS: 使用桌面应用版本\n' +
        '• Windows: 使用 Chrome/Edge 浏览器或桌面应用');
  return null;
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
