/**
 * Tauri 文件系统服务
 * 封装 Tauri 的原生 API，提供与 File System Access API 兼容的接口
 */

import { isTauri as coreIsTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile, mkdir, readDir, remove } from '@tauri-apps/plugin-fs';
import { homeDir, join } from '@tauri-apps/api/path';

// ============================================================================
// 平台检测工具
// ============================================================================

/**
 * 检测是否在 Tauri 环境中运行
 */
export const isTauriEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (coreIsTauri()) return true;

  // 方式 1: 检测 __TAURI__ 对象 (Tauri 1.x/2.x)
  if ((window as any).__TAURI__ !== undefined) {
    return true;
  }
  
  // 方式 2: 检测 __TAURI_INTERNALS__ (Tauri 2.x)
  if ((window as any).__TAURI_INTERNALS__ !== undefined) {
    return true;
  }
  
  // 方式 3: 检测 Tauri protocol
  if (window.location.protocol === 'tauri:') {
    return true;
  }
  
  // 方式 4: 检测 tauri:// 或 WebKit (macOS Tauri)
  if (window.location.href.includes('tauri://') || 
      (window.location.href.includes('localhost') && 
       window.navigator.userAgent.includes('Macintosh'))) {
    const isWebKit = /AppleWebKit/.test(window.navigator.userAgent) && 
                     !/Chrome/.test(window.navigator.userAgent);
    if (isWebKit) return true;
  }
  
  return false;
};

/**
 * 检测浏览器是否支持 File System Access API
 */
export const supportsFileSystemAccessAPI = (): boolean => {
  return 'showDirectoryPicker' in window;
};

/**
 * 检测操作系统
 */
export const detectOS = (): 'macos' | 'windows' | 'linux' | 'unknown' => {
  const platform = navigator.platform.toLowerCase();
  
  if (platform.includes('mac') || platform.includes('darwin')) {
    return 'macos';
  }
  if (platform.includes('win')) {
    return 'windows';
  }
  if (platform.includes('linux')) {
    return 'linux';
  }
  
  // 兜底：从 userAgent 检测
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('win')) return 'windows';
  if (ua.includes('linux')) return 'linux';
  
  return 'unknown';
};

// ============================================================================
// TauriDirectoryHandle 适配器类
// ============================================================================

/**
 * Tauri 目录句柄 - 兼容 File System Access API
 */
export class TauriDirectoryHandle {
  readonly kind: 'directory' = 'directory';
  readonly name: string;
  readonly path: string;
  private _rootPath: string;

  constructor(name: string, path: string, rootPath?: string) {
    this.name = name;
    this.path = path;
    this._rootPath = rootPath || path;
  }

  /**
   * 获取子目录句柄
   */
  async getDirectoryHandle(
    name: string, 
    options?: { create?: boolean }
  ): Promise<TauriDirectoryHandle> {
    const subPath = await join(this.path, name);
    
    if (options?.create) {
      try {
        await mkdir(subPath);
      } catch (e) {
        // 目录可能已存在，忽略错误
      }
    }

    return new TauriDirectoryHandle(name, subPath, this._rootPath);
  }

  /**
   * 获取文件句柄
   */
  async getFileHandle(
    name: string, 
    options?: { create?: boolean }
  ): Promise<TauriFileHandle> {
    const filePath = await join(this.path, name);
    return new TauriFileHandle(name, filePath, this._rootPath, options?.create || false);
  }

  /**
   * 遍历目录内容（异步生成器）
   */
  async *values(): AsyncIterableIterator<TauriDirectoryHandle | TauriFileHandle> {
    try {
      const entries = await readDir(this.path);
      
      for (const entry of entries) {
        const entryPath = await join(this.path, entry.name);
        
        if (entry.isDirectory) {
          yield new TauriDirectoryHandle(entry.name, entryPath, this._rootPath);
        } else if (entry.isFile) {
          yield new TauriFileHandle(entry.name, entryPath, this._rootPath);
        }
      }
    } catch (e) {
      console.error('Failed to read directory:', e);
    }
  }

  /**
   * 删除目录条目
   */
  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const entryPath = await join(this.path, name);
    try {
      await remove(entryPath, { recursive: options?.recursive || false });
    } catch (e) {
      console.error('Failed to remove entry:', e);
      throw e;
    }
  }

  /**
   * 请求权限（Tauri 中始终返回 granted）
   */
  async requestPermission(): Promise<'granted'> {
    return 'granted';
  }

  /**
   * 查询权限（Tauri 中始终返回 granted）
   */
  async queryPermission(): Promise<'granted'> {
    return 'granted';
  }
}

// ============================================================================
// TauriFileHandle 适配器类
// ============================================================================

/**
 * Tauri 文件句柄 - 兼容 File System Access API
 */
export class TauriFileHandle {
  readonly kind: 'file' = 'file';
  readonly name: string;
  private path: string;
  private _rootPath: string;
  private shouldCreate: boolean;

  constructor(name: string, path: string, rootPath: string, shouldCreate: boolean = false) {
    this.name = name;
    this.path = path;
    this._rootPath = rootPath;
    this.shouldCreate = shouldCreate;
  }

  /**
   * 获取完整路径
   */
  getFullPath(): string {
    return this.path;
  }

  /**
   * 获取文件内容
   */
  async getFile(): Promise<File> {
    try {
      const content = await readFile(this.path);
      const blob = new Blob([content]);
      return new File([blob], this.name);
    } catch (e) {
      if (this.shouldCreate) {
        return new File([], this.name);
      }
      throw e;
    }
  }

  /**
   * 创建可写流
   */
  async createWritable(): Promise<TauriWritableStream> {
    return new TauriWritableStream(this.path);
  }
}

// ============================================================================
// TauriWritableStream 适配器类
// ============================================================================

/**
 * Tauri 可写流 - 兼容 File System Access API 的 WritableStream
 */
export class TauriWritableStream {
  private path: string;
  private chunks: Uint8Array[] = [];

  constructor(path: string) {
    this.path = path;
  }

  /**
   * 写入数据（支持多种格式）
   */
  async write(data: string | Blob | BufferSource): Promise<void> {
    if (typeof data === 'string') {
      const encoder = new TextEncoder();
      this.chunks.push(encoder.encode(data));
    } else if (data instanceof Blob) {
      const arrayBuffer = await data.arrayBuffer();
      this.chunks.push(new Uint8Array(arrayBuffer));
    } else if (ArrayBuffer.isView(data)) {
      this.chunks.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    } else if (data instanceof ArrayBuffer) {
      this.chunks.push(new Uint8Array(data));
    }
  }

  /**
   * 关闭流并保存文件
   */
  async close(): Promise<void> {
    try {
      // 确保目录存在
      const dirPath = this.path.substring(0, this.path.lastIndexOf('/')) || 
                      this.path.substring(0, this.path.lastIndexOf('\\'));
      if (dirPath) {
        try {
          await mkdir(dirPath);
        } catch (e) {
          // 目录已存在或无法创建
        }
      }

      // 合并所有 chunks
      const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of this.chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // 写入文件
      await writeFile(this.path, combined);
    } catch (e) {
      console.error('Failed to write file:', e);
      throw e;
    }
  }
}

// ============================================================================
// 目录选择函数
// ============================================================================

/**
 * 使用 Tauri 原生对话框选择目录
 */
export const selectDirectoryWithTauri = async (): Promise<TauriDirectoryHandle | null> => {
  try {
    // 获取用户主目录作为默认路径
    const defaultPath = await homeDir();
    
    // 打开目录选择对话框
    const selectedPath = await open({
      directory: true,
      multiple: false,
      defaultPath: defaultPath,
      title: '选择保存目录'
    });

    if (!selectedPath || Array.isArray(selectedPath)) {
      return null;
    }

    return createTauriHandleFromPath(selectedPath);
  } catch (e) {
    console.error('Failed to select directory with Tauri:', e);
    return null;
  }
};

/**
 * 从已知路径创建 Tauri 目录句柄
 */
export const createTauriHandleFromPath = (fullPath: string): TauriDirectoryHandle => {
  const pathParts = fullPath.split(/[\\/]/);
  const dirName = pathParts[pathParts.length - 1] || 'root';
  return new TauriDirectoryHandle(dirName, fullPath, fullPath);
};

/**
 * 检查是否为 Tauri 句柄
 */
export const isTauriHandle = (handle: any): handle is TauriDirectoryHandle => {
  return handle instanceof TauriDirectoryHandle;
};

// ============================================================================
// 调试开关
// ============================================================================

/**
 * 强制使用 Tauri 模式（用于调试）
 */
export const FORCE_TAURI_MODE = false;
