import React, { useState, useEffect } from 'react';
import { X, Lock, Unlock, Key, Zap, AlertTriangle, Info } from 'lucide-react';
import { DecodeConfig } from '../types';

interface DecodeSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    config: DecodeConfig;
    onSave: (config: DecodeConfig) => void;
}

const DecodeSettingsModal: React.FC<DecodeSettingsModalProps> = ({
    isOpen,
    onClose,
    config,
    onSave
}) => {
    const [localConfig, setLocalConfig] = useState<DecodeConfig>(config);

    // Sync with external config when modal opens
    useEffect(() => {
        if (isOpen) {
            setLocalConfig(config);
        }
    }, [isOpen, config]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(localConfig);
        onClose();
    };

    const handleToggleEnabled = () => {
        setLocalConfig(prev => ({
            ...prev,
            enabled: !prev.enabled,
            // Reset other settings when disabled
            ...(prev.enabled ? { password: '', autoDecodeEnabled: false } : {})
        }));
    };

    const handleToggleAutoDecodeEnabled = () => {
        setLocalConfig(prev => ({
            ...prev,
            autoDecodeEnabled: !prev.autoDecodeEnabled
        }));
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalConfig(prev => ({
            ...prev,
            password: e.target.value
        }));
    };

    return (
        <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-[#1a1d24] rounded-xl shadow-2xl w-[420px] max-w-[95vw] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-slate-100 dark:border-slate-800/50 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Lock className="w-5 h-5 text-amber-500" />
                        解码设置
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 space-y-5">
                    {/* Enable Decode Toggle */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            {localConfig.enabled ? (
                                <Unlock className="w-5 h-5 text-amber-500" />
                            ) : (
                                <Lock className="w-5 h-5 text-slate-400" />
                            )}
                            <div>
                                <p className="font-medium text-slate-800 dark:text-white text-sm">
                                    为当前应用开启解码
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    开启后，该应用生成的结果将被解码
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleToggleEnabled}
                            className={`relative w-11 h-6 rounded-full transition-colors ${localConfig.enabled
                                ? 'bg-amber-500'
                                : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                        >
                            <div
                                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${localConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                            />
                        </button>
                    </div>

                    {/* Password Input - Only show when enabled */}
                    {localConfig.enabled && (
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                                <Key className="w-4 h-4 text-slate-400" />
                                解码密码
                            </label>
                            <input
                                type="password"
                                value={localConfig.password}
                                onChange={handlePasswordChange}
                                placeholder="如需密码请填入，不需要则留空"
                                className="w-full px-4 py-2.5 text-sm bg-white dark:bg-[#0F1115] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                            />
                        </div>
                    )}

                    {/* Auto Decode Toggle - Only show when enabled */}
                    {localConfig.enabled && (
                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <Zap className={`w-5 h-5 ${localConfig.autoDecodeEnabled ? 'text-emerald-500' : 'text-slate-400'}`} />
                                <div>
                                    <p className="font-medium text-slate-800 dark:text-white text-sm">
                                        自动解码
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        开启后直接显示解码结果
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleToggleAutoDecodeEnabled}
                                className={`relative w-11 h-6 rounded-full transition-colors ${localConfig.autoDecodeEnabled
                                    ? 'bg-emerald-500'
                                    : 'bg-slate-300 dark:bg-slate-600'
                                    }`}
                            >
                                <div
                                    className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${localConfig.autoDecodeEnabled ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                />
                            </button>
                        </div>
                    )}

                    {/* Batch Task Warning */}
                    {localConfig.enabled && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800/50">
                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                                批量任务必须开启自动解码，以便直接保存解码后的结果。
                            </p>
                        </div>
                    )}

                    {/* Supported Tool Info */}
                    {localConfig.enabled && (
                        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800/50">
                            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                                当前仅支持小黄鸭解码，
                                <a
                                    href="https://github.com/copyangle/SS_tools"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-bold text-blue-600 dark:text-blue-400 underline decoration-blue-500 hover:decoration-blue-600 transition-colors"
                                >
                                    项目地址
                                </a>
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 dark:border-slate-800/50 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm rounded-lg transition-colors"
                    >
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DecodeSettingsModal;
