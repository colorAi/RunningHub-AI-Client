import React, { useMemo, useState } from 'react';
import { AlertOctagon, ArrowRight, Briefcase, Filter, Key, Loader2, RefreshCw, Search, Settings } from 'lucide-react';
import { ApiKeyEntry, AutoSaveConfig, RunningHubStandardModel, StandardModelConfig } from '../types';
import { getStandardModelRegistry, standardModelToNodes } from '../services/api';

interface StepConfigProps {
  onNext: (modelConfig: StandardModelConfig, nodes: ReturnType<typeof standardModelToNodes>) => void;
  enterpriseApi: ApiKeyEntry;
  onOpenSettings: () => void;
  initialWebappId: string;
  autoSaveConfig: AutoSaveConfig;
  onAutoSaveChange: (config: AutoSaveConfig) => void;
}

const MODEL_TYPE_ORDER: RunningHubStandardModel['outputType'][] = ['image', 'video', 'audio', 'string', '3d', 'file'];
const modelRegistryCache = new Map<string, RunningHubStandardModel[]>();
const DEFAULT_REGISTRY_CACHE_KEY = 'default';

const formatModelType = (type: string) => {
  const labels: Record<string, string> = {
    image: '图像',
    video: '视频',
    audio: '音频',
    string: '文本',
    '3d': '3D',
    file: '文件',
  };
  return labels[type] || type;
};

const formatCategory = (category: string) => category.replace(/^RunningHub\//, '').trim() || category;

const StepConfig: React.FC<StepConfigProps> = ({
  onNext,
  enterpriseApi,
  onOpenSettings,
  initialWebappId,
}) => {
  const [models, setModels] = useState<RunningHubStandardModel[]>(() => modelRegistryCache.get(DEFAULT_REGISTRY_CACHE_KEY) || []);
  const [selectedType, setSelectedType] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState(initialWebappId || '');
  const [search, setSearch] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingParams, setLoadingParams] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modelTypes = useMemo(
    () => Array.from(new Set<RunningHubStandardModel['outputType']>(models.map(model => model.outputType)))
      .sort((left, right) => {
        const leftIndex = MODEL_TYPE_ORDER.indexOf(left);
        const rightIndex = MODEL_TYPE_ORDER.indexOf(right);
        return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
      }),
    [models],
  );

  const categories = useMemo(
    () => Array.from(new Set(
      models
        .filter(model => !selectedType || model.outputType === selectedType)
        .map(model => model.category || '')
        .filter(Boolean),
    )).sort(),
    [models, selectedType],
  );

  const filteredModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return models
      .filter(model => !selectedType || model.outputType === selectedType)
      .filter(model => !selectedCategory || model.category === selectedCategory)
      .filter(model => !query || [
        model.displayName,
        model.nameCn,
        model.nameEn,
        model.endpoint,
        model.category,
      ].some(value => (value || '').toLowerCase().includes(query)))
      .slice(0, 300);
  }, [models, search, selectedCategory, selectedType]);

  const selectedModel = useMemo(
    () => models.find(model => model.endpoint === selectedEndpoint) || null,
    [models, selectedEndpoint],
  );

  const handleLoadModels = async () => {
    setError(null);
    setLoadingModels(true);
    try {
      const registry = await getStandardModelRegistry();
      modelRegistryCache.set(DEFAULT_REGISTRY_CACHE_KEY, registry);
      setModels(registry);
      if (!selectedEndpoint && registry[0]) {
        setSelectedEndpoint(registry[0].endpoint);
      }
    } catch (err: any) {
      setError(err?.message || '获取模型列表失败');
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSelectType = (type: string) => {
    setSelectedType(type);
    setSelectedCategory('');
    const current = models.find(model => model.endpoint === selectedEndpoint);
    if (type && current && current.outputType !== type) {
      setSelectedEndpoint('');
    }
  };

  const handleLoadParams = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoadingParams(true);

    try {
      if (!enterpriseApi.apiKey.trim()) {
        throw new Error('请先在个人中心填写企业共享 API Key');
      }
      const model = selectedModel || models.find(item => item.endpoint === selectedEndpoint.trim());
      if (!model) {
        throw new Error('请先获取模型并选择具体模型');
      }

      onNext({
        endpoint: model.endpoint,
        modelName: model.displayName,
        category: model.category || null,
        outputType: model.outputType,
      }, standardModelToNodes(model));
    } catch (err: any) {
      setError(err?.message || '获取参数失败');
    } finally {
      setLoadingParams(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-slate-100 p-5 dark:border-slate-800/50">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white">
          <Settings className="h-5 w-5 text-brand-500" />
          标准模型 API
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleLoadParams} className="flex flex-col gap-5 p-5">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs leading-5 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/15 dark:text-emerald-200">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">企业共享 API</span>
              <span>{enterpriseApi.apiKey.trim() ? `并发 ${enterpriseApi.concurrency || 1}` : '未配置'}</span>
            </div>
            {!enterpriseApi.apiKey.trim() && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white"
              >
                <Key className="h-3.5 w-3.5" />
                去填写
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => void handleLoadModels()}
            disabled={loadingModels}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            {loadingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            获取模型
          </button>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">搜索模型</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Search className="h-4 w-4" />
              </div>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="block w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-100"
                placeholder="模型名称或 endpoint"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">类型</label>
              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={selectedType}
                  onChange={(event) => handleSelectType(event.target.value)}
                  className="block w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-100"
                >
                  <option value="">全部</option>
                  {modelTypes.map(type => (
                    <option key={type} value={type}>{formatModelType(type)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">分类</label>
              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={selectedCategory}
                  onChange={(event) => {
                    setSelectedCategory(event.target.value);
                    const current = models.find(model => model.endpoint === selectedEndpoint);
                    if (event.target.value && current?.category !== event.target.value) {
                      setSelectedEndpoint('');
                    }
                  }}
                  className="block w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-100"
                >
                  <option value="">全部分类</option>
                  {categories.map(category => (
                    <option key={category} value={category}>{formatCategory(category)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">具体模型</label>
            <div className="relative">
              <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={selectedEndpoint}
                onChange={(event) => setSelectedEndpoint(event.target.value)}
                className="block w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-100"
              >
                <option value="">{models.length > 0 ? '请选择模型' : '先获取模型'}</option>
                {filteredModels.map(model => (
                  <option key={model.endpoint} value={model.endpoint}>{model.displayName}</option>
                ))}
              </select>
            </div>
            {selectedModel && (
              <p className="mt-1.5 truncate text-[10px] leading-tight text-slate-400 dark:text-slate-500" title={selectedModel.endpoint}>
                {formatModelType(selectedModel.outputType)} · {selectedModel.category ? formatCategory(selectedModel.category) : '未分类'} · {selectedModel.endpoint}
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-600 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
              <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loadingParams}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loadingParams ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                获取中...
              </>
            ) : (
              <>
                获取参数
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default StepConfig;
