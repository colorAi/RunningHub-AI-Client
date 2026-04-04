import React, { useRef, useState, useEffect } from 'react';
import AppNode, { AppNodeData } from './canvas/AppNode';
import { ApiKeyEntry, DecodeConfig, AutoSaveConfig } from '../types';

export interface CanvasNode {
  id: string;
  x: number;
  y: number;
  data: AppNodeData;
}

interface InfiniteCanvasProps {
  nodes: CanvasNode[];
  selectedNodeId: string | null;
  apiKeys: ApiKeyEntry[];
  decodeConfig: DecodeConfig;
  autoSaveConfig: AutoSaveConfig;
  onNodesChange: (nodes: CanvasNode[]) => void;
  onSelectNode: (id: string | null) => void;
}

const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({
  nodes,
  selectedNodeId,
  apiKeys,
  decodeConfig,
  autoSaveConfig,
  onNodesChange,
  onSelectNode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 100, y: 100 }); // 默认偏移，让原点可见
  const [scale, setScale] = useState(1);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragStart, setNodeDragStart] = useState({ x: 0, y: 0 });

  // 鼠标滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, scale * scaleFactor));

    const scaleRatio = newScale / scale;
    const newOffsetX = mouseX - (mouseX - offset.x) * scaleRatio;
    const newOffsetY = mouseY - (mouseY - offset.y) * scaleRatio;

    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  // 画布拖拽开始
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).classList.contains('canvas-bg')) {
      onSelectNode(null);

      // 中键或按住 Shift+左键拖拽画布
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      }
    }
  };

  // 节点拖拽开始
  const handleNodeDragStart = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingNodeId(id);
    setNodeDragStart({ x: e.clientX, y: e.clientY });
  };

  // 鼠标移动
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    } else if (draggingNodeId) {
      const dx = (e.clientX - nodeDragStart.x) / scale;
      const dy = (e.clientY - nodeDragStart.y) / scale;

      onNodesChange(nodes.map(node =>
        node.id === draggingNodeId
          ? { ...node, x: node.x + dx, y: node.y + dy }
          : node
      ));

      setNodeDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  // 鼠标释放
  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  // 全局鼠标释放
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsPanning(false);
      setDraggingNodeId(null);
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // 更新节点数据
  const handleNodeUpdate = (id: string, data: Partial<AppNodeData>) => {
    onNodesChange(nodes.map(node =>
      node.id === id
        ? { ...node, data: { ...node.data, ...data } }
        : node
    ));
  };

  // 删除节点
  const handleNodeDelete = (id: string) => {
    onNodesChange(nodes.filter(node => node.id !== id));
    if (selectedNodeId === id) {
      onSelectNode(null);
    }
  };

  // 缩放控制
  const zoomIn = () => setScale(s => Math.min(5, s * 1.2));
  const zoomOut = () => setScale(s => Math.max(0.1, s / 1.2));
  const resetView = () => {
    setScale(1);
    setOffset({ x: 100, y: 100 });
  };

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* 画布主容器 */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ cursor: isPanning ? 'grabbing' : 'default' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* 背景层 - 随画布变换 */}
        <div
          className="canvas-bg absolute"
          style={{
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `
              linear-gradient(to right, rgba(100, 116, 139, 0.15) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(100, 116, 139, 0.15) 1px, transparent 1px)
            `,
            backgroundSize: `${20 * scale}px ${20 * scale}px`,
            backgroundPosition: `${offset.x}px ${offset.y}px`,
            transform: `translate(0, 0)`,
          }}
        />

        {/* 节点层 - 应用变换 */}
        <div
          className="absolute"
          style={{
            left: 0,
            top: 0,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {nodes.map(node => (
            <AppNode
              key={node.id}
              id={node.id}
              x={node.x}
              y={node.y}
              data={node.data}
              isSelected={selectedNodeId === node.id}
              apiKeys={apiKeys}
              decodeConfig={decodeConfig}
              autoSaveConfig={autoSaveConfig}
              onUpdate={handleNodeUpdate}
              onDelete={handleNodeDelete}
              onSelect={onSelectNode}
              onDragStart={handleNodeDragStart}
            />
          ))}
        </div>
      </div>

      {/* 缩放控制栏 */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-white dark:bg-[#1a1d24] rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-2 z-20">
        <button
          onClick={zoomOut}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors text-slate-600 dark:text-slate-400"
          title="缩小"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <span className="text-sm text-slate-600 dark:text-slate-400 min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors text-slate-600 dark:text-slate-400"
          title="放大"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-1" />
        <button
          onClick={resetView}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors text-slate-600 dark:text-slate-400"
          title="重置视图"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>

      {/* 提示信息 */}
      <div className="absolute top-4 left-4 bg-white/90 dark:bg-[#1a1d24]/90 backdrop-blur-sm rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs text-slate-500 dark:text-slate-400 z-20">
        <p>🖱️ 滚轮缩放 | 中键/Shift+左键 拖拽画布 | 拖拽节点移动</p>
      </div>
    </div>
  );
};

export default InfiniteCanvas;
