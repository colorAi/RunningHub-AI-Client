import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Copy,
  Cuboid,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Minus,
  Music4,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Unlink2,
  Upload,
  Video,
  Workflow,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ApiKeyEntry,
  AutoSaveConfig,
  SkillCapability,
  SkillOutputType,
  SkillParamDefinition,
  SkillRunOutput,
  SkillRunUsage,
} from '../types';
import { createSkillDefaults, createSkillTitle, executeSkillTask, loadSkillsCatalog } from '../services/skills';

type SkillFieldValue = string | number | boolean | string[];
type CardStatus = 'idle' | 'running' | 'success' | 'error';

interface Point {
  x: number;
  y: number;
}

interface SkillCardState {
  id: string;
  endpoint: string;
  position: Point;
  values: Record<string, SkillFieldValue>;
  files: Record<string, File[]>;
  status: CardStatus;
  outputs: SkillRunOutput[];
  logs: string[];
  error: string | null;
  taskId: string | null;
  usage?: SkillRunUsage;
  savedCount: number;
}

interface SkillConnection {
  id: string;
  sourceNodeId: string;
  targetCardId: string;
  targetParamKey: string;
}

interface PersistedSkillCard {
  id: string;
  endpoint: string;
  position: Point;
  values: Record<string, SkillFieldValue>;
}

interface PersistedBoardState {
  version: 4;
  cards: PersistedSkillCard[];
  connections: SkillConnection[];
  viewport: Point & { scale: number };
}

interface SkillsViewProps {
  apiKeys: ApiKeyEntry[];
  autoSaveConfig: AutoSaveConfig;
}

type BoardSelection =
  | { kind: 'skill'; id: string }
  | { kind: 'output'; id: string }
  | null;

interface OutputNodeView {
  id: string;
  sourceCardId: string;
  outputIndex: number;
  output: SkillRunOutput;
}

interface DragConnectionState {
  sourceNodeId: string;
  start: Point;
  current: Point;
}

interface HoveredInputPort {
  cardId: string;
  paramKey: string;
}

const STORAGE_KEY = 'rh_skills_board_v4';
const LEGACY_STORAGE_KEY = 'rh_skills_board_v2';
const MAX_SLOTS = 18;
const MIN_SCALE = 0.45;
const MAX_SCALE = 1.8;
const SKILL_NODE_WIDTH = 276;
const SKILL_HEADER_HEIGHT = 42;
const SKILL_META_HEIGHT = 30;
const SKILL_SECTION_HEIGHT = 20;
const SKILL_PORT_ROW_HEIGHT = 26;
const SKILL_FOOTER_HEIGHT = 38;
const MEDIA_TYPES = new Set(['IMAGE', 'VIDEO', 'AUDIO']);

const typeLabelMap: Record<SkillOutputType, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  '3d': '3D',
  string: '文本',
};

const niceLabelMap: Record<string, string> = {
  prompt: '提示词',
  text: '文本内容',
  imageUrl: '主图',
  imageUrls: '参考图组',
  firstFrameImage: '首帧',
  lastFrameImage: '尾帧',
  videoUrl: '源视频',
  audioUrl: '音频',
  resolution: '分辨率',
  duration: '时长',
  aspectRatio: '画幅比例',
  seed: '随机种子',
  strength: '强度',
  faceCount: '面数',
  enablePbr: 'PBR 材质',
  generateType: '生成模式',
};

const getOutputIcon = (type: SkillOutputType) => {
  switch (type) {
    case 'image':
      return ImageIcon;
    case 'video':
      return Video;
    case 'audio':
      return Music4;
    case '3d':
      return Cuboid;
    case 'string':
    default:
      return FileText;
  }
};

const getVisibleParams = (capability: SkillCapability) => {
  const seen = new Set<string>();
  return capability.params.filter(param => {
    if (seen.has(param.key)) return false;
    seen.add(param.key);
    return true;
  });
};

const prettifyLabel = (key: string) => {
  if (niceLabelMap[key]) return niceLabelMap[key];
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
};

const parseLines = (value: string) =>
  value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);

const dedupeList = (items: string[]) => Array.from(new Set(items.map(item => item.trim()).filter(Boolean)));

const normalizeUrls = (value: SkillFieldValue, multiple?: boolean): string[] => {
  if (Array.isArray(value)) {
    return dedupeList(value.map(item => String(item)));
  }
  if (typeof value !== 'string') {
    return [];
  }
  if (multiple) {
    return dedupeList(parseLines(value));
  }
  return value.trim() ? [value.trim()] : [];
};

const looksLikeImage = (url: string, fileType?: string) =>
  /\.(png|jpg|jpeg|webp|gif|bmp|svg)(\?.*)?$/i.test(url) || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes((fileType || '').toLowerCase());

const looksLikeVideo = (url: string, fileType?: string) =>
  /\.(mp4|webm|mov|avi|mkv)(\?.*)?$/i.test(url) || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes((fileType || '').toLowerCase());

const looksLikeAudio = (url: string, fileType?: string) =>
  /\.(mp3|wav|ogg|flac|aac)(\?.*)?$/i.test(url) || ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes((fileType || '').toLowerCase());

const getOutputNodeId = (cardId: string, index: number) => `${cardId}::output::${index}`;

const defaultCardPosition = (index: number): Point => ({
  x: 80 + (index % 3) * 320,
  y: 80 + Math.floor(index / 3) * 240,
});

const getStatusPill = (status: CardStatus) => {
  if (status === 'running') return 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200';
  if (status === 'success') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200';
  if (status === 'error') return 'border-rose-400/40 bg-rose-400/10 text-rose-200';
  return 'border-white/10 bg-white/5 text-slate-300';
};

const getMediaParams = (capability: SkillCapability) => getVisibleParams(capability).filter(param => MEDIA_TYPES.has(param.type));

const getSkillNodeHeight = (inputCount: number, outputCount: number) =>
  SKILL_HEADER_HEIGHT
  + SKILL_META_HEIGHT
  + SKILL_SECTION_HEIGHT
  + Math.max(inputCount, 1) * SKILL_PORT_ROW_HEIGHT
  + SKILL_SECTION_HEIGHT
  + Math.max(outputCount, 1) * SKILL_PORT_ROW_HEIGHT
  + SKILL_FOOTER_HEIGHT;

const buildConnectionPath = (start: Point, end: Point) => {
  const offset = Math.max(80, Math.abs(end.x - start.x) * 0.45);
  return `M ${start.x} ${start.y} C ${start.x + offset} ${start.y}, ${end.x - offset} ${end.y}, ${end.x} ${end.y}`;
};

const SkillsView: React.FC<SkillsViewProps> = ({ apiKeys, autoSaveConfig }) => {
  const [catalog, setCatalog] = useState<SkillCapability[]>([]);
  const [catalogVersion, setCatalogVersion] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [taskFilter, setTaskFilter] = useState('all');
  const [outputFilter, setOutputFilter] = useState<'all' | SkillOutputType>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [cards, setCards] = useState<SkillCardState[]>([]);
  const [cardsReady, setCardsReady] = useState(false);
  const [connections, setConnections] = useState<SkillConnection[]>([]);
  const [viewport, setViewport] = useState<Point & { scale: number }>({ x: 80, y: 60, scale: 0.9 });
  const [selectedNode, setSelectedNode] = useState<BoardSelection>(null);
  const [pendingOutputId, setPendingOutputId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [connectionDrag, setConnectionDrag] = useState<DragConnectionState | null>(null);
  const [hoveredInputPort, setHoveredInputPort] = useState<HoveredInputPort | null>(null);
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'params' | 'result' | 'logs'>('params');

  const cardsRef = useRef(cards);
  const connectionsRef = useRef(connections);
  const viewportRef = useRef(viewport);
  const canvasRef = useRef<HTMLDivElement>(null);
  const connectionDragRef = useRef<DragConnectionState | null>(null);
  const hoveredInputPortRef = useRef<HoveredInputPort | null>(null);
  const dragStateRef = useRef<
    | {
        id: string;
        startMouse: Point;
        startPosition: Point;
      }
    | null
  >(null);
  const panStateRef = useRef<
    | {
        startMouse: Point;
        startViewport: Point;
      }
    | null
  >(null);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    connectionDragRef.current = connectionDrag;
  }, [connectionDrag]);

  useEffect(() => {
    hoveredInputPortRef.current = hoveredInputPort;
  }, [hoveredInputPort]);

  const availableApiKey = useMemo(() => apiKeys.map(item => item.apiKey.trim()).find(Boolean) || '', [apiKeys]);
  const activeAccountInfo = apiKeys[0]?.accountInfo || { remainCoins: '0', remainMoney: '0' };

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        setLoadingCatalog(true);
        const result = await loadSkillsCatalog();
        if (!active) return;
        setCatalog(result.endpoints);
        setCatalogVersion(result.version);
        setCatalogError(null);
      } catch (error: any) {
        if (!active) return;
        setCatalogError(error.message || '读取 skills 目录失败');
      } finally {
        if (active) setLoadingCatalog(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!catalog.length || cardsReady) return;

    const createCard = (capability: SkillCapability, persisted?: Partial<PersistedSkillCard>, index = 0): SkillCardState => ({
      id: persisted?.id || crypto.randomUUID(),
      endpoint: capability.endpoint,
      position: persisted?.position || defaultCardPosition(index),
      values: { ...createSkillDefaults(capability), ...(persisted?.values || {}) },
      files: {},
      status: 'idle',
      outputs: [],
      logs: [],
      error: null,
      taskId: null,
      savedCount: 0,
      usage: undefined,
    });

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedBoardState;
        const restored = parsed.cards
          .map((item, index) => {
            const capability = catalog.find(entry => entry.endpoint === item.endpoint);
            return capability ? createCard(capability, item, index) : null;
          })
          .filter((item): item is SkillCardState => !!item)
          .slice(0, MAX_SLOTS);

        setCards(restored);
        setConnections(parsed.connections || []);
        setViewport(parsed.viewport || { x: 80, y: 60, scale: 0.9 });
        setSelectedNode(restored[0] ? { kind: 'skill', id: restored[0].id } : null);
        setCardsReady(true);
        return;
      }

      if (legacy) {
        const parsed = JSON.parse(legacy) as Array<{ id: string; endpoint: string; values: Record<string, SkillFieldValue> }>;
        const restored = parsed
          .map((item, index) => {
            const capability = catalog.find(entry => entry.endpoint === item.endpoint);
            return capability ? createCard(capability, { ...item, position: defaultCardPosition(index) }, index) : null;
          })
          .filter((item): item is SkillCardState => !!item)
          .slice(0, MAX_SLOTS);

        setCards(restored);
        setSelectedNode(restored[0] ? { kind: 'skill', id: restored[0].id } : null);
      }
    } catch {
      // ignore broken persistence
    }

    setCardsReady(true);
  }, [catalog, cardsReady]);

  useEffect(() => {
    if (!cardsReady) return;
    const payload: PersistedBoardState = {
      version: 4,
      cards: cards.map(card => ({
        id: card.id,
        endpoint: card.endpoint,
        position: card.position,
        values: card.values,
      })),
      connections,
      viewport,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [cards, cardsReady, connections, viewport]);

  const taskOptions = useMemo(() => ['all', ...Array.from(new Set(catalog.map(item => item.task))).sort()], [catalog]);
  const outputOptions = useMemo(() => ['all', ...Array.from(new Set(catalog.map(item => item.output_type))).sort()] as Array<'all' | SkillOutputType>, [catalog]);
  const categoryOptions = useMemo(() => ['all', ...Array.from(new Set(catalog.map(item => item.category))).sort()], [catalog]);

  const filteredCatalog = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return catalog
      .filter(item => {
        if (taskFilter !== 'all' && item.task !== taskFilter) return false;
        if (outputFilter !== 'all' && item.output_type !== outputFilter) return false;
        if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
        if (!keyword) return true;
        return [item.endpoint, item.name_cn, item.name_en, item.task, item.category, ...(item.tags || [])].join(' ').toLowerCase().includes(keyword);
      })
      .sort((left, right) => {
        if (left.popularity !== right.popularity) return left.popularity - right.popularity;
        return left.endpoint.localeCompare(right.endpoint);
      });
  }, [catalog, search, taskFilter, outputFilter, categoryFilter]);

  const capabilityMap = useMemo(
    () =>
      catalog.reduce<Record<string, SkillCapability>>((acc, item) => {
        acc[item.endpoint] = item;
        return acc;
      }, {}),
    [catalog],
  );

  const outputNodes = useMemo<OutputNodeView[]>(
    () =>
      cards.flatMap(card =>
        card.outputs.map((output, outputIndex) => {
          const id = getOutputNodeId(card.id, outputIndex);
          return {
            id,
            sourceCardId: card.id,
            outputIndex,
            output,
          };
        }),
      ),
    [cards],
  );

  useEffect(() => {
    if (!pendingOutputId) return;
    const exists = outputNodes.some(item => item.id === pendingOutputId);
    if (!exists) setPendingOutputId(null);
  }, [pendingOutputId, outputNodes]);

  const selectedCard = selectedNode?.kind === 'skill' ? cards.find(card => card.id === selectedNode.id) || null : null;
  const selectedCapability = selectedCard ? capabilityMap[selectedCard.endpoint] : null;
  const selectedOutputNode = selectedNode?.kind === 'output' ? outputNodes.find(item => item.id === selectedNode.id) || null : null;
  const activeResultNode = selectedOutputNode
    || (selectedCard ? outputNodes.find(item => item.sourceCardId === selectedCard.id) || null : null)
    || null;

  useEffect(() => {
    if (!selectedNode) return;
    setInspectorOpen(true);
    setInspectorTab(selectedNode.kind === 'output' ? 'result' : 'params');
  }, [selectedNode]);

  const hasValue = (value: SkillFieldValue | undefined) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'boolean') return true;
    return value !== undefined && value !== null && String(value).trim() !== '';
  };

  const getCompletionSummary = (card: SkillCardState, capability: SkillCapability) => {
    const params = getVisibleParams(capability);
    const requiredParams = params.filter(param => param.required);
    const completedRequired = requiredParams.filter(param => {
      const incomingCount = getConnectionsForParam(card.id, param.key).length;
      const fileCount = card.files[param.key]?.length || 0;
      return incomingCount > 0 || fileCount > 0 || hasValue(card.values[param.key]);
    }).length;

    return {
      totalParams: params.length,
      requiredParams: requiredParams.length,
      completedRequired,
      mediaInputs: getMediaParams(capability).length,
    };
  };

  const clientToWorld = (clientX: number, clientY: number): Point | null => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const currentViewport = viewportRef.current;
    return {
      x: (clientX - rect.left - currentViewport.x) / currentViewport.scale,
      y: (clientY - rect.top - currentViewport.y) / currentViewport.scale,
    };
  };

  const getOutputPortPointBySourceId = (sourceNodeId: string): Point | null => {
    const [cardId, indexText] = sourceNodeId.split('::output::');
    const outputIndex = Number(indexText);
    const sourceCard = cardsRef.current.find(item => item.id === cardId);
    const sourceCapability = sourceCard ? capabilityMap[sourceCard.endpoint] : null;
    if (!sourceCard || !sourceCapability || !Number.isFinite(outputIndex)) {
      return null;
    }

    return getSkillOutputPortPoint(sourceCard, sourceCapability, outputIndex);
  };

  const getInputPortPoint = (card: SkillCardState, capability: SkillCapability, paramKey: string): Point => {
    const params = getMediaParams(capability);
    const rowIndex = Math.max(0, params.findIndex(param => param.key === paramKey));
    return {
      x: card.position.x,
      y: card.position.y + SKILL_HEADER_HEIGHT + SKILL_META_HEIGHT + SKILL_SECTION_HEIGHT + rowIndex * SKILL_PORT_ROW_HEIGHT + SKILL_PORT_ROW_HEIGHT / 2,
    };
  };

  const getSkillOutputPortPoint = (card: SkillCardState, capability: SkillCapability, outputIndex: number): Point => {
    const inputCount = Math.max(getMediaParams(capability).length, 1);
    return {
      x: card.position.x + SKILL_NODE_WIDTH,
      y:
        card.position.y
        + SKILL_HEADER_HEIGHT
        + SKILL_META_HEIGHT
        + SKILL_SECTION_HEIGHT
        + inputCount * SKILL_PORT_ROW_HEIGHT
        + SKILL_SECTION_HEIGHT
        + outputIndex * SKILL_PORT_ROW_HEIGHT
        + SKILL_PORT_ROW_HEIGHT / 2,
    };
  };

  const updateCard = (cardId: string, updater: (card: SkillCardState) => SkillCardState) => {
    setCards(prev => prev.map(card => (card.id === cardId ? updater(card) : card)));
  };

  const appendLog = (cardId: string, message: string) => {
    const time = new Date().toLocaleTimeString();
    updateCard(cardId, card => ({
      ...card,
      logs: [...card.logs, `[${time}] ${message}`].slice(-80),
    }));
  };

  const getOutputByNodeId = (nodeId: string, snapshot = cardsRef.current): SkillRunOutput | null => {
    const [cardId, indexText] = nodeId.split('::output::');
    const outputIndex = Number(indexText);
    const card = snapshot.find(item => item.id === cardId);
    return Number.isFinite(outputIndex) ? card?.outputs[outputIndex] || null : null;
  };

  const getConnectionsForParam = (cardId: string, key: string, linkSnapshot = connectionsRef.current) =>
    linkSnapshot.filter(item => item.targetCardId === cardId && item.targetParamKey === key);

  const getResolvedValue = (
    card: SkillCardState,
    param: SkillParamDefinition,
    snapshot = cardsRef.current,
    linkSnapshot = connectionsRef.current,
  ): SkillFieldValue => {
    const incoming = getConnectionsForParam(card.id, param.key, linkSnapshot)
      .map(item => getOutputByNodeId(item.sourceNodeId, snapshot))
      .map(item => item?.fileUrl || '')
      .filter(Boolean);

    if (incoming.length === 0) {
      return card.values[param.key];
    }

    if (param.multiple) {
      return dedupeList([...normalizeUrls(card.values[param.key], true), ...incoming]);
    }

    return incoming[0];
  };

  const buildResolvedValues = (card: SkillCardState, capability: SkillCapability, snapshot = cardsRef.current, linkSnapshot = connectionsRef.current) =>
    getVisibleParams(capability).reduce<Record<string, SkillFieldValue>>((acc, param) => {
      acc[param.key] = getResolvedValue(card, param, snapshot, linkSnapshot);
      return acc;
    }, { ...card.values });

  const addCard = (capability: SkillCapability) => {
    if (cards.length >= MAX_SLOTS) {
      alert(`技能节点已满（最多 ${MAX_SLOTS} 个），请先移除一些技能。`);
      return;
    }

    const nextCard: SkillCardState = {
      id: crypto.randomUUID(),
      endpoint: capability.endpoint,
      position: defaultCardPosition(cards.length),
      values: createSkillDefaults(capability),
      files: {},
      status: 'idle',
      outputs: [],
      logs: [],
      error: null,
      taskId: null,
      savedCount: 0,
      usage: undefined,
    };

    setCards(prev => [...prev, nextCard]);
    setSelectedNode({ kind: 'skill', id: nextCard.id });
  };

  const removeCard = (cardId: string) => {
    setCards(prev => prev.filter(card => card.id !== cardId));
    setConnections(prev => prev.filter(item => item.targetCardId !== cardId && !item.sourceNodeId.startsWith(`${cardId}::output::`)));
    if (selectedNode?.id === cardId) {
      const next = cards.find(card => card.id !== cardId);
      setSelectedNode(next ? { kind: 'skill', id: next.id } : null);
    }
  };

  const updateFieldValue = (cardId: string, key: string, value: SkillFieldValue) => {
    updateCard(cardId, card => ({ ...card, values: { ...card.values, [key]: value } }));
  };

  const updateFieldFiles = (cardId: string, key: string, files: File[]) => {
    updateCard(cardId, card => ({ ...card, files: { ...card.files, [key]: files } }));
  };

  const connectOutputToSkill = (outputNodeId: string, targetCardId: string, targetParamKey: string) => {
    const output = getOutputByNodeId(outputNodeId);
    if (!output?.fileUrl) return;

    setConnections(prev => [
      ...prev.filter(item => !(item.targetCardId === targetCardId && item.targetParamKey === targetParamKey)),
      {
        id: crypto.randomUUID(),
        sourceNodeId: outputNodeId,
        targetCardId,
        targetParamKey,
      },
    ]);
    setPendingOutputId(null);
    setSelectedNode({ kind: 'skill', id: targetCardId });
  };

  const disconnectParam = (targetCardId: string, targetParamKey: string) => {
    setConnections(prev => prev.filter(item => !(item.targetCardId === targetCardId && item.targetParamKey === targetParamKey)));
  };

  const startConnectionDragFromSourceId = (event: React.MouseEvent, sourceNodeId: string, startPoint: Point) => {
    event.stopPropagation();
    const point = clientToWorld(event.clientX, event.clientY) || startPoint;
    setPendingOutputId(null);
    setSelectedNode({ kind: 'output', id: sourceNodeId });
    setConnectionDrag({
      sourceNodeId,
      start: startPoint,
      current: point,
    });
    setHoveredInputPort(null);
  };

  const beginConnectFlow = (outputNodeId: string) => {
    setPendingOutputId(outputNodeId);
    setSelectedNode({ kind: 'output', id: outputNodeId });
    setInspectorOpen(true);
    setInspectorTab('result');
  };

  const runCard = async (cardId: string) => {
    const currentCard = cardsRef.current.find(item => item.id === cardId);
    if (!currentCard) return;
    const capability = capabilityMap[currentCard.endpoint];
    if (!capability) return;

    if (!availableApiKey) {
      updateCard(cardId, card => ({ ...card, status: 'error', error: '请先在个人中心配置 API Key' }));
      return;
    }

    setSelectedNode({ kind: 'skill', id: cardId });
    updateCard(cardId, card => ({
      ...card,
      status: 'running',
      error: null,
      outputs: [],
      logs: [],
      taskId: null,
      usage: undefined,
      savedCount: 0,
    }));

    try {
      const result = await executeSkillTask({
        apiKey: availableApiKey,
        capability,
        values: buildResolvedValues(currentCard, capability),
        files: currentCard.files,
        autoSaveEnabled: autoSaveConfig.enabled,
        onLog: message => appendLog(cardId, message),
        onTaskCreated: taskId => updateCard(cardId, card => ({ ...card, taskId })),
      });

      updateCard(cardId, card => ({
        ...card,
        status: 'success',
        outputs: result.outputs,
        usage: result.usage,
        savedCount: result.savedCount,
        error: null,
        taskId: result.taskId,
      }));

      const firstOutputId = getOutputNodeId(cardId, 0);
      setSelectedNode(result.outputs.length > 0 ? { kind: 'output', id: firstOutputId } : { kind: 'skill', id: cardId });
    } catch (error: any) {
      const message = error.message || '技能运行失败';
      updateCard(cardId, card => ({ ...card, status: 'error', error: message }));
      appendLog(cardId, message);
    }
  };

  const runAllCards = async () => {
    if (runningAll) return;
    setRunningAll(true);
    try {
      for (const card of cardsRef.current) {
        await runCard(card.id);
      }
    } finally {
      setRunningAll(false);
    }
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const activeConnectionDrag = connectionDragRef.current;
      if (activeConnectionDrag) {
        const nextPoint = clientToWorld(event.clientX, event.clientY);
        if (nextPoint) {
          setConnectionDrag({
            ...activeConnectionDrag,
            current: nextPoint,
          });
        }
        return;
      }

      const panState = panStateRef.current;
      if (panState) {
        setViewport(prev => ({
          ...prev,
          x: panState.startViewport.x + (event.clientX - panState.startMouse.x),
          y: panState.startViewport.y + (event.clientY - panState.startMouse.y),
        }));
        return;
      }

      const dragState = dragStateRef.current;
      if (!dragState) return;

      const scale = viewportRef.current.scale;
      const dx = (event.clientX - dragState.startMouse.x) / scale;
      const dy = (event.clientY - dragState.startMouse.y) / scale;

      setCards(prev =>
        prev.map(card =>
          card.id === dragState.id
            ? {
                ...card,
                position: {
                  x: dragState.startPosition.x + dx,
                  y: dragState.startPosition.y + dy,
                },
              }
            : card,
        ),
      );
    };

    const handleMouseUp = () => {
      const activeConnectionDrag = connectionDragRef.current;
      const activeHoveredPort = hoveredInputPortRef.current;
      if (activeConnectionDrag && activeHoveredPort) {
        connectOutputToSkill(activeConnectionDrag.sourceNodeId, activeHoveredPort.cardId, activeHoveredPort.paramKey);
      }
      setConnectionDrag(null);
      setHoveredInputPort(null);
      dragStateRef.current = null;
      panStateRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, viewport.scale * (event.deltaY > 0 ? 0.92 : 1.08)));
    const worldX = (mouseX - viewport.x) / viewport.scale;
    const worldY = (mouseY - viewport.y) / viewport.scale;

    setViewport({
      scale: nextScale,
      x: mouseX - worldX * nextScale,
      y: mouseY - worldY * nextScale,
    });
  };

  const renderPreview = (output: SkillRunOutput | null) => {
    if (!output) {
      return (
        <div className="flex h-full items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-sm text-slate-400">
          选择一个结果，或先运行任意技能查看预览。
        </div>
      );
    }

    if (output.kind === 'text') {
      return (
        <div className="h-full overflow-auto rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-5">
          <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-100">{output.text}</pre>
        </div>
      );
    }

    const url = output.fileUrl || '';
    if (looksLikeImage(url, output.fileType)) {
      return <img src={url} alt="Preview" className="h-full w-full rounded-3xl border border-white/10 bg-black/50 object-contain" />;
    }
    if (looksLikeVideo(url, output.fileType)) {
      return <video src={url} controls className="h-full w-full rounded-3xl border border-white/10 bg-black object-contain" />;
    }
    if (looksLikeAudio(url, output.fileType)) {
      return (
        <div className="flex h-full items-center justify-center rounded-3xl border border-white/10 bg-slate-950/70 p-8">
          <audio src={url} controls className="w-full max-w-xl" />
        </div>
      );
    }

    return (
      <div className="flex h-full items-center justify-center rounded-3xl border border-white/10 bg-slate-950/70 p-8 text-sm text-slate-300">
        当前结果是文件资源，可以在右侧面板打开或复制地址。
      </div>
    );
  };

  const renderField = (card: SkillCardState, capability: SkillCapability, param: SkillParamDefinition) => {
    const inputClass = 'w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400/50';
    const shellClass = 'rounded-2xl border border-white/8 bg-white/[0.03] p-3.5';
    const label = prettifyLabel(param.key);
    const currentValue = card.values[param.key];
    const currentFiles = card.files[param.key] || [];
    const resolvedValue = getResolvedValue(card, param);
    const incoming = getConnectionsForParam(card.id, param.key);

    if (param.type === 'LIST') {
      return (
        <div key={param.key} className={shellClass}>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</label>
          <select
            value={String(currentValue || param.default || param.options?.[0] || '')}
            onChange={event => updateFieldValue(card.id, param.key, event.target.value)}
            className={inputClass}
          >
            {(param.options || []).map(option => (
              <option key={option} value={option} className="bg-slate-950">
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (param.type === 'BOOLEAN') {
      return (
        <div key={param.key} className={`${shellClass} flex items-center justify-between gap-4`}>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</div>
            <div className="mt-1 text-xs text-slate-500">开关参数</div>
          </div>
          <button
            type="button"
            onClick={() => updateFieldValue(card.id, param.key, !Boolean(currentValue))}
            className={`relative h-7 w-12 rounded-full transition ${Boolean(currentValue) ? 'bg-cyan-500/90' : 'bg-slate-700'}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${Boolean(currentValue) ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
      );
    }

    if (MEDIA_TYPES.has(param.type)) {
      const accepts = param.type === 'IMAGE' ? 'image/*' : param.type === 'VIDEO' ? 'video/*' : 'audio/*';
      const rawText = Array.isArray(currentValue) ? currentValue.join('\n') : String(currentValue || '');
      const resolvedText = Array.isArray(resolvedValue) ? resolvedValue.join('\n') : String(resolvedValue || '');

      return (
        <div key={param.key} className={shellClass}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</label>
            <label className="cursor-pointer rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-400/20">
              <span className="inline-flex items-center gap-1"><Upload className="h-3 w-3" /> 上传</span>
              <input
                type="file"
                accept={accepts}
                multiple={!!param.multiple}
                className="hidden"
                onChange={event => updateFieldFiles(card.id, param.key, Array.from(event.target.files || []))}
              />
            </label>
          </div>

          {incoming.length > 0 && (
            <div className="mb-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/8 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">节点连接输入</div>
              <div className="space-y-2">
                {incoming.map(connection => {
                  const linkedOutput = getOutputByNodeId(connection.sourceNodeId);
                  return (
                    <div key={connection.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                      <div className="min-w-0 text-xs text-slate-300">
                        <div className="truncate">{linkedOutput?.fileUrl || '等待上游输出'}</div>
                        <div className="mt-1 text-[11px] text-slate-500">运行时会自动注入这个参数</div>
                      </div>
                      <button type="button" onClick={() => disconnectParam(card.id, param.key)} className="text-rose-300 hover:text-rose-200">
                        <Unlink2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <textarea value={resolvedText} readOnly rows={param.multiple ? 3 : 2} className={`${inputClass} mt-3 text-xs text-cyan-50`} />
            </div>
          )}

            <textarea
              value={rawText}
              rows={param.multiple ? 4 : 2}
              onChange={event => updateFieldValue(card.id, param.key, param.multiple ? dedupeList(parseLines(event.target.value)) : event.target.value)}
              className={inputClass}
              placeholder={param.multiple ? '每行一个 URL，或通过节点连接注入。' : '填写素材 URL，或通过节点连接注入。'}
            />

          {currentFiles.length > 0 && (
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-400">
              <span className="truncate">{currentFiles.map(file => file.name).join(', ')}</span>
              <button type="button" onClick={() => updateFieldFiles(card.id, param.key, [])} className="text-rose-300 hover:text-rose-200">
                清除
              </button>
            </div>
          )}
        </div>
      );
    }

    if (param.type === 'INT' || param.type === 'FLOAT') {
      return (
        <div key={param.key} className={shellClass}>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</label>
          <input
            type="number"
            min={param.min}
            max={param.max}
            step={param.type === 'FLOAT' ? '0.01' : '1'}
            value={String(currentValue ?? param.default ?? '')}
            onChange={event => updateFieldValue(card.id, param.key, event.target.value)}
            className={inputClass}
          />
        </div>
      );
    }

    if (/(prompt|text|content|script|description)/i.test(param.key)) {
      return (
        <div key={param.key} className={shellClass}>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</label>
            <textarea
              value={String(currentValue || '')}
              rows={5}
              onChange={event => updateFieldValue(card.id, param.key, event.target.value)}
              className={inputClass}
              placeholder={`输入 ${label}`}
            />
        </div>
      );
    }

    return (
      <div key={param.key} className={shellClass}>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</label>
        <input
          type="text"
          value={String(currentValue || '')}
          onChange={event => updateFieldValue(card.id, param.key, event.target.value)}
          className={inputClass}
        />
      </div>
    );
  };

  const renderConnections = () => (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
        {connections.map(connection => {
          const targetCard = cards.find(item => item.id === connection.targetCardId);
          const start = getOutputPortPointBySourceId(connection.sourceNodeId);
          if (!start || !targetCard) return null;

          const capability = capabilityMap[targetCard.endpoint];
          if (!capability) return null;

          const end = getInputPortPoint(targetCard, capability, connection.targetParamKey);
          const path = buildConnectionPath(start, end);

          return (
            <g key={connection.id}>
              <path d={path} fill="none" stroke="rgba(34,211,238,0.75)" strokeWidth={2.5} />
              <path d={path} fill="none" stroke="rgba(34,211,238,0.22)" strokeWidth={10} />
            </g>
          );
        })}
        {connectionDrag && (
          <g>
            <path d={buildConnectionPath(connectionDrag.start, connectionDrag.current)} fill="none" stroke="rgba(244,114,182,0.95)" strokeWidth={2.5} strokeDasharray="8 6" />
            <path d={buildConnectionPath(connectionDrag.start, connectionDrag.current)} fill="none" stroke="rgba(244,114,182,0.18)" strokeWidth={10} />
          </g>
        )}
      </g>
    </svg>
  );

  const renderConnectTargets = (outputNode: OutputNodeView) => (
    <div className="rounded-3xl border border-cyan-400/18 bg-cyan-400/[0.06] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">Continue With</div>
          <div className="mt-1 text-xs text-cyan-50/70">选择下游节点的接收参数后，会自动建立连接。</div>
        </div>
        <button
          type="button"
          onClick={() => setPendingOutputId(null)}
          className="rounded-full border border-white/10 p-1 text-slate-300"
        >
          <Minus className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-3">
        {cards
          .filter(card => card.id !== outputNode.sourceCardId)
          .map(card => {
            const capability = capabilityMap[card.endpoint];
            const compatibleParams = capability ? getVisibleParams(capability).filter(param => MEDIA_TYPES.has(param.type)) : [];
            if (!capability || compatibleParams.length === 0) return null;

            return (
              <div key={card.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 text-sm font-medium text-slate-100">{createSkillTitle(capability)}</div>
                <div className="flex flex-wrap gap-2">
                  {compatibleParams.map(param => (
                    <button
                      key={param.key}
                      type="button"
                      onClick={() => connectOutputToSkill(outputNode.id, card.id, param.key)}
                      className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100"
                    >
                      杩炴帴鍒?{prettifyLabel(param.key)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );

  const renderLogsPanel = (card: SkillCardState) => (
    <div className="space-y-4">
      {card.usage && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-xs text-slate-300">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Usage</div>
          <div>耗时: {card.usage.taskCostTime || '-'}</div>
          <div className="mt-1">金币: {card.usage.consumeCoins || '0'}</div>
          <div className="mt-1">余额消耗: {card.usage.consumeMoney || '0'}</div>
          <div className="mt-1">三方消耗: {card.usage.thirdPartyConsumeMoney || '0'}</div>
          <div className="mt-1">自动保存: {card.savedCount}</div>
        </div>
      )}

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Execution Log</div>
        {card.logs.length > 0 ? (
          <div className="max-h-[420px] space-y-2 overflow-auto text-xs text-slate-300">
            {card.logs.map((log, index) => (
              <div key={`${card.id}-log-${index}`} className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                {log}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-slate-500">
            当前还没有执行日志。
          </div>
        )}
      </div>
    </div>
  );

  const inspectorHasContent = Boolean(selectedCard || selectedOutputNode);

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-[#0b1016] text-slate-100">
      <aside className={`relative shrink-0 border-r border-white/10 bg-[#0d141c] transition-all duration-200 ${libraryCollapsed ? 'w-[52px]' : 'w-[290px]'}`}>
        <button
          type="button"
          onClick={() => setLibraryCollapsed(prev => !prev)}
          className="absolute right-2 top-2 z-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-slate-300"
        >
          {libraryCollapsed ? '展开' : '隐藏'}
        </button>
        {!libraryCollapsed ? (
        <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-300">
              <Workflow className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-200">Skills Graph</div>
              <div className="mt-1 text-xs text-slate-500">节点式技能创作台</div>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="搜索技能..."
                className="w-full rounded-2xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none focus:border-cyan-400/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={taskFilter} onChange={event => setTaskFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300 outline-none">
                {taskOptions.map(option => (
                  <option key={option} value={option} className="bg-slate-950">
                    {option === 'all' ? '全部任务' : option}
                  </option>
                ))}
              </select>
              <select value={outputFilter} onChange={event => setOutputFilter(event.target.value as 'all' | SkillOutputType)} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300 outline-none">
                {outputOptions.map(option => (
                  <option key={option} value={option} className="bg-slate-950">
                    {option === 'all' ? '全部输出' : typeLabelMap[option]}
                  </option>
                ))}
              </select>
            </div>
            <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300 outline-none">
              {categoryOptions.map(option => (
                <option key={option} value={option} className="bg-slate-950">
                  {option === 'all' ? '全部分类' : option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loadingCatalog ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载技能目录...
            </div>
          ) : catalogError ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{catalogError}</div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                <span>{filteredCatalog.length} Skills</span>
                <span>v{catalogVersion || '--'}</span>
              </div>
              {filteredCatalog.map(capability => {
                const Icon = getOutputIcon(capability.output_type);
                return (
                  <button
                    key={capability.endpoint}
                    type="button"
                    onClick={() => addCard(capability)}
                    className="w-full rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-left transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-100">{createSkillTitle(capability)}</div>
                        <div className="mt-1 truncate text-[11px] uppercase tracking-[0.18em] text-slate-500">{capability.endpoint}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-300">{capability.task}</span>
                          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-300">{typeLabelMap[capability.output_type]}</span>
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-black/20 p-2 text-cyan-300">
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 px-4 py-4 text-xs text-slate-400">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <div className="mb-1 uppercase tracking-[0.22em] text-slate-500">账户</div>
            <div>余额: ¥{activeAccountInfo.remainMoney ?? '0.00'}</div>
            <div className="mt-1">算力币: {activeAccountInfo.remainCoins ?? '0'}</div>
          </div>
        </div>
        </div>
        ) : (
        <div className="flex h-full flex-col items-center justify-start gap-3 px-2 py-14">
          <Workflow className="h-5 w-5 text-cyan-300" />
          <div className="[writing-mode:vertical-rl] text-[11px] uppercase tracking-[0.28em] text-slate-500">Skills</div>
        </div>
        )}
      </aside>

      <div className="relative flex min-w-0 flex-1">
        <section className="relative min-h-0 flex-1 bg-[#0a0f15]">
          <div className="absolute left-4 top-4 z-30 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLibraryCollapsed(false)}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/12 px-3 py-2 text-xs font-medium text-cyan-100"
            >
              <Plus className="h-3.5 w-3.5" />
              添加技能
            </button>
            <button
              type="button"
              onClick={runAllCards}
              disabled={runningAll || cards.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/12 px-3 py-2 text-xs font-medium text-cyan-100 disabled:opacity-50"
            >
              {runningAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {runningAll ? '执行中' : '运行全部'}
            </button>
            <button
              type="button"
              onClick={() => setInspectorOpen(prev => !prev)}
              disabled={!inspectorHasContent}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-slate-200 disabled:opacity-40"
            >
              {inspectorOpen ? '收起面板' : '打开面板'}
            </button>
            <button type="button" onClick={() => setViewport(prev => ({ ...prev, scale: Math.min(MAX_SCALE, prev.scale * 1.1) }))} className="rounded-xl border border-white/10 bg-black/35 p-2 text-slate-200">
              <ZoomIn className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setViewport(prev => ({ ...prev, scale: Math.max(MIN_SCALE, prev.scale / 1.1) }))} className="rounded-xl border border-white/10 bg-black/35 p-2 text-slate-200">
              <ZoomOut className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setViewport({ x: 80, y: 60, scale: 0.9 })} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-slate-200">
              <RefreshCw className="h-3.5 w-3.5" />
              重置视图
            </button>
            {(pendingOutputId || connectionDrag) && (
              <div className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
                <Link2 className="h-3.5 w-3.5" />
                {connectionDrag ? '拖到目标节点的输入口即可完成连接。' : '继续处理模式已开启，选择目标节点后在右侧选择接收参数。'}
                <button
                  type="button"
                  onClick={() => {
                    setPendingOutputId(null);
                    setConnectionDrag(null);
                    setHoveredInputPort(null);
                  }}
                  className="rounded-full border border-white/10 p-1"
                >
                  <Minus className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <div
            ref={canvasRef}
            className="absolute inset-0 overflow-hidden"
            onWheel={handleWheel}
            onMouseDown={event => {
              if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
                event.preventDefault();
                panStateRef.current = {
                  startMouse: { x: event.clientX, y: event.clientY },
                  startViewport: { x: viewportRef.current.x, y: viewportRef.current.y },
                };
                return;
              }
              if (event.target === canvasRef.current) {
                setSelectedNode(null);
                setInspectorOpen(false);
              }
            }}
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)
              `,
              backgroundSize: `${36 * viewport.scale}px ${36 * viewport.scale}px`,
              backgroundPosition: `${viewport.x}px ${viewport.y}px`,
            }}
          >
            {cards.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center px-6">
                <div className="max-w-md rounded-[28px] border border-white/10 bg-[#0f1620]/92 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                    <Workflow className="h-6 w-6" />
                  </div>
                  <div className="mt-4 text-lg font-semibold text-slate-100">先搭一个最小流程</div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">
                    先从左侧技能库加入节点，再在右侧抽屉里配置参数和查看结果。画布只保留流程本身，结果详情统一放进右侧面板。
                  </div>
                  <button
                    type="button"
                    onClick={() => setLibraryCollapsed(false)}
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-400/12 px-4 py-2.5 text-sm text-cyan-100"
                  >
                    <Plus className="h-4 w-4" />
                    打开技能库
                  </button>
                </div>
              </div>
            )}

            {renderConnections()}

            <div
              className="absolute left-0 top-0"
              style={{
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                transformOrigin: '0 0',
              }}
            >
              {cards.map(card => {
                const capability = capabilityMap[card.endpoint];
                if (!capability) return null;
                const Icon = getOutputIcon(capability.output_type);
                const compatibleParams = getMediaParams(capability);
                const selected = selectedNode?.kind === 'skill' && selectedNode.id === card.id;
                const outputCount = Math.max(card.outputs.length, 1);
                const nodeHeight = getSkillNodeHeight(compatibleParams.length, outputCount);
                const summary = getCompletionSummary(card, capability);

                return (
                  <div
                    key={card.id}
                    className={`absolute rounded-[18px] border bg-[#11161c] shadow-[0_16px_32px_rgba(0,0,0,0.4)] ${selected ? 'border-cyan-400/60 ring-2 ring-cyan-400/15' : 'border-white/10'}`}
                    style={{ left: card.position.x, top: card.position.y, width: SKILL_NODE_WIDTH, minHeight: nodeHeight }}
                  >
                    <div
                      className="cursor-move rounded-t-[18px] border-b border-white/10 bg-gradient-to-r from-[#202833] to-[#121820] px-3 py-2.5"
                      onMouseDown={event => {
                        event.stopPropagation();
                        dragStateRef.current = {
                          id: card.id,
                          startMouse: { x: event.clientX, y: event.clientY },
                          startPosition: { ...card.position },
                        };
                        setSelectedNode({ kind: 'skill', id: card.id });
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${card.status === 'running' ? 'bg-cyan-400' : card.status === 'success' ? 'bg-emerald-400' : card.status === 'error' ? 'bg-rose-400' : 'bg-slate-500'}`} />
                            <div className="truncate text-[13px] font-semibold text-slate-100">{createSkillTitle(capability)}</div>
                          </div>
                          <div className="mt-1 truncate text-[10px] uppercase tracking-[0.18em] text-slate-500">{capability.endpoint}</div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/25 p-1.5 text-cyan-200">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                      </div>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedNode({ kind: 'skill', id: card.id })}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedNode({ kind: 'skill', id: card.id });
                        }
                      }}
                      className="block w-full px-3 py-3 text-left"
                    >
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                          <div className="uppercase tracking-[0.16em] text-slate-500">Required</div>
                          <div className="mt-1 text-sm font-semibold text-slate-100">{summary.completedRequired}/{summary.requiredParams}</div>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                          <div className="uppercase tracking-[0.16em] text-slate-500">Media In</div>
                          <div className="mt-1 text-sm font-semibold text-slate-100">{summary.mediaInputs}</div>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                          <div className="uppercase tracking-[0.16em] text-slate-500">Results</div>
                          <div className="mt-1 text-sm font-semibold text-slate-100">{card.outputs.length}</div>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-500">
                          <span>Inputs</span>
                          <span>{typeLabelMap[capability.output_type]}</span>
                        </div>
                        <div className="space-y-1.5">
                          {compatibleParams.length > 0 ? compatibleParams.map(param => {
                            const linked = getConnectionsForParam(card.id, param.key).length > 0;
                            const hovered = connectionDrag && hoveredInputPort?.cardId === card.id && hoveredInputPort?.paramKey === param.key;

                            return (
                              <div key={param.key} className={`group flex items-center gap-3 rounded-xl border px-2.5 py-1.5 text-xs transition ${hovered ? 'border-cyan-400/50 bg-cyan-400/12' : linked ? 'border-cyan-400/20 bg-cyan-400/6' : 'border-white/8 bg-white/[0.02]'}`}>
                                <button
                                  type="button"
                                  onMouseEnter={() => {
                                    if (connectionDragRef.current) setHoveredInputPort({ cardId: card.id, paramKey: param.key });
                                  }}
                                  onMouseLeave={() => {
                                    if (hoveredInputPortRef.current?.cardId === card.id && hoveredInputPortRef.current?.paramKey === param.key) {
                                      setHoveredInputPort(null);
                                    }
                                  }}
                                  className={`relative h-3.5 w-3.5 shrink-0 rounded-full border-2 transition ${hovered ? 'border-cyan-300 bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.6)]' : linked ? 'border-cyan-400 bg-cyan-400/90' : 'border-slate-500 bg-slate-800'}`}
                                >
                                  <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70" />
                                </button>
                                <div className="min-w-0 flex-1 truncate text-xs text-slate-200">{prettifyLabel(param.key)}</div>
                                <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{param.type}</span>
                              </div>
                            );
                          }) : (
                            <div className="rounded-xl border border-dashed border-white/10 px-3 py-2 text-xs text-slate-500">
                              当前没有可连接的媒体输入。
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-slate-500">Results</div>
                        <div className="space-y-1.5">
                          {card.outputs.length > 0 ? card.outputs.map((output, outputIndex) => {
                            const outputNodeId = getOutputNodeId(card.id, outputIndex);
                            const startPoint = getSkillOutputPortPoint(card, capability, outputIndex);
                            const isSelectedOutput = selectedNode?.kind === 'output' && selectedNode.id === outputNodeId;
                            const isActiveSource = connectionDrag?.sourceNodeId === outputNodeId;

                            return (
                              <div key={outputNodeId} className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs ${isSelectedOutput ? 'border-fuchsia-400/40 bg-fuchsia-400/[0.08]' : 'border-fuchsia-400/14 bg-fuchsia-400/[0.04]'}`}>
                                <button
                                  type="button"
                                  onClick={event => {
                                    event.stopPropagation();
                                    setSelectedNode({ kind: 'output', id: outputNodeId });
                                  }}
                                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                >
                                  {output.kind === 'file' && output.fileUrl && looksLikeImage(output.fileUrl, output.fileType) ? (
                                    <img src={output.fileUrl} alt="Result" className="h-8 w-8 rounded-lg border border-white/10 bg-black/30 object-cover" />
                                  ) : (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/25 text-slate-300">
                                      {output.kind === 'text' ? <FileText className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-slate-100">
                                      {output.kind === 'text' ? `文本结果 ${outputIndex + 1}` : `${output.fileType || '文件'} 结果 ${outputIndex + 1}`}
                                    </div>
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  onClick={event => {
                                    event.stopPropagation();
                                    beginConnectFlow(outputNodeId);
                                  }}
                                  disabled={output.kind !== 'file' || !output.fileUrl}
                                  className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-200 disabled:opacity-40"
                                >
                                  继续处理
                                </button>
                                {output.kind === 'file' && output.fileUrl && (
                                  <button
                                    type="button"
                                    onMouseDown={event => startConnectionDragFromSourceId(event, outputNodeId, startPoint)}
                                    onClick={event => event.stopPropagation()}
                                    className={`relative h-3.5 w-3.5 shrink-0 rounded-full border-2 transition ${isActiveSource ? 'border-fuchsia-200 bg-fuchsia-400 shadow-[0_0_12px_rgba(244,114,182,0.7)]' : 'border-fuchsia-300 bg-fuchsia-500/95 hover:shadow-[0_0_12px_rgba(244,114,182,0.45)]'}`}
                                    title="拖拽连接到下游节点"
                                  >
                                    <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70" />
                                  </button>
                                )}
                              </div>
                            );
                          }) : (
                            <div className="rounded-xl border border-dashed border-white/10 px-3 py-2 text-xs text-slate-500">
                              运行后结果会显示在这里。
                            </div>
                          )}
                        </div>
                      </div>

                      {card.error && <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{card.error}</div>}
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2.5">
                      <button type="button" onClick={() => runCard(card.id)} disabled={card.status === 'running'} className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-400/12 px-3 py-1.5 text-[11px] text-cyan-100 disabled:opacity-50">
                        {card.status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        运行
                      </button>
                      <button type="button" onClick={() => removeCard(card.id)} className="rounded-xl border border-white/10 bg-black/20 p-1.5 text-slate-300 hover:text-rose-200">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className={`absolute inset-y-0 right-0 z-40 flex w-[380px] shrink-0 flex-col border-l border-white/10 bg-[#0d141c] shadow-[-24px_0_60px_rgba(0,0,0,0.35)] transition-transform duration-200 ${inspectorOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-200">Inspector</div>
              <div className="mt-1 text-xs text-slate-500">参数、结果和日志都收在这里。</div>
            </div>
            <button type="button" onClick={() => setInspectorOpen(false)} className="rounded-xl border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-slate-200">
              收起
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {!inspectorHasContent && (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
                选中一个技能节点或结果后，这里会显示对应的参数和结果详情。
              </div>
            )}

            {selectedOutputNode && (
              <div className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Result</div>
                  <div className="text-sm text-slate-200">结果 #{selectedOutputNode.outputIndex + 1}</div>
                  <div className="mt-2 text-xs text-slate-500">这里负责查看结果详情，或者继续送往下一个技能节点。</div>
                </div>

                <div className="h-[260px]">{renderPreview(selectedOutputNode.output)}</div>

                {selectedOutputNode.output.kind === 'file' && selectedOutputNode.output.fileUrl && (
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Output URL</div>
                    <div className="break-all text-xs text-slate-300">{selectedOutputNode.output.fileUrl}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => navigator.clipboard.writeText(selectedOutputNode.output.fileUrl || '')} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
                        <Copy className="h-3.5 w-3.5" />
                        复制
                      </button>
                      <button type="button" onClick={() => window.open(selectedOutputNode.output.fileUrl, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
                        <ExternalLink className="h-3.5 w-3.5" />
                        打开
                      </button>
                      <button type="button" onClick={() => beginConnectFlow(selectedOutputNode.id)} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-400/12 px-3 py-2 text-xs text-cyan-100">
                        <ArrowRight className="h-3.5 w-3.5" />
                        继续处理
                      </button>
                    </div>
                  </div>
                )}

                {pendingOutputId === selectedOutputNode.id && renderConnectTargets(selectedOutputNode)}
              </div>
            )}

            {selectedCard && selectedCapability && !selectedOutputNode && (
              <div className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">{createSkillTitle(selectedCapability)}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{selectedCapability.endpoint}</div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${getStatusPill(selectedCard.status)}`}>
                      {selectedCard.status}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => runCard(selectedCard.id)} disabled={selectedCard.status === 'running'} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-400/12 px-3 py-2 text-xs text-cyan-100 disabled:opacity-50">
                      {selectedCard.status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      运行当前节点
                    </button>
                    <button type="button" onClick={() => removeCard(selectedCard.id)} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
                      <Trash2 className="h-3.5 w-3.5" />
                      删除节点
                    </button>
                  </div>

                  {selectedCard.taskId && (
                    <div className="mt-3 text-xs text-slate-400">
                      Task ID: <span className="text-slate-200">{selectedCard.taskId}</span>
                    </div>
                  )}

                  {selectedCard.error && (
                    <div className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{selectedCard.error}</div>
                  )}
                </div>

                <div className="flex gap-2 rounded-2xl border border-white/10 bg-black/20 p-1">
                  <button type="button" onClick={() => setInspectorTab('params')} className={`flex-1 rounded-xl px-3 py-2 text-xs ${inspectorTab === 'params' ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-300'}`}>参数</button>
                  <button type="button" onClick={() => setInspectorTab('result')} className={`flex-1 rounded-xl px-3 py-2 text-xs ${inspectorTab === 'result' ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-300'}`}>结果</button>
                  <button type="button" onClick={() => setInspectorTab('logs')} className={`flex-1 rounded-xl px-3 py-2 text-xs ${inspectorTab === 'logs' ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-300'}`}>日志</button>
                </div>

                {inspectorTab === 'params' && (
                  <div className="space-y-4">
                    {pendingOutputId && (
                      <div className="rounded-3xl border border-cyan-400/18 bg-cyan-400/[0.06] p-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">接收这个结果</div>
                        <div className="mb-3 text-xs text-cyan-50/70">当前节点已被选为下游节点，选择一个媒体参数完成连接。</div>
                        <div className="flex flex-wrap gap-2">
                          {getVisibleParams(selectedCapability)
                            .filter(param => MEDIA_TYPES.has(param.type))
                            .map(param => (
                              <button
                                key={param.key}
                                type="button"
                                onClick={() => connectOutputToSkill(pendingOutputId, selectedCard.id, param.key)}
                                className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100"
                              >
                                接到 {prettifyLabel(param.key)}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {getVisibleParams(selectedCapability).map(param => renderField(selectedCard, selectedCapability, param))}
                    </div>
                  </div>
                )}

                {inspectorTab === 'result' && (
                  <div className="space-y-4">
                    <div className="h-[260px]">{renderPreview(activeResultNode?.output || null)}</div>

                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Node Results</div>
                      {selectedCard.outputs.length > 0 ? (
                        <div className="space-y-2">
                          {selectedCard.outputs.map((output, outputIndex) => {
                            const outputNodeId = getOutputNodeId(selectedCard.id, outputIndex);
                            const selectedResult = selectedNode?.kind === 'output' && selectedNode.id === outputNodeId;
                            return (
                              <div key={outputNodeId} className={`flex items-center gap-3 rounded-2xl border px-3 py-2 ${selectedResult ? 'border-fuchsia-400/30 bg-fuchsia-400/[0.08]' : 'border-white/10 bg-black/20'}`}>
                                <button type="button" onClick={() => setSelectedNode({ kind: 'output', id: outputNodeId })} className="min-w-0 flex-1 text-left">
                                  <div className="truncate text-sm text-slate-100">
                                    {output.kind === 'text' ? `文本结果 ${outputIndex + 1}` : `${output.fileType || '文件'} 结果 ${outputIndex + 1}`}
                                  </div>
                                  <div className="mt-1 truncate text-[11px] text-slate-500">
                                    {output.kind === 'text' ? output.text : output.fileUrl}
                                  </div>
                                </button>
                                {output.kind === 'file' && output.fileUrl && (
                                  <button type="button" onClick={() => beginConnectFlow(outputNodeId)} className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
                                    继续处理
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-slate-500">
                          当前节点还没有结果，先运行一次就会出现在这里。
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {inspectorTab === 'logs' && renderLogsPanel(selectedCard)}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default SkillsView;
