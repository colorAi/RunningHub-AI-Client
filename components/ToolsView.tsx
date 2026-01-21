import React, { useState, useEffect } from 'react';
import { Lock, Settings, Shield, Volume2 } from 'lucide-react';
import { DecodeConfig } from '../types';
import BatchReminderModal from './BatchReminderModal';

interface ToolsViewProps {
    onOpenDecodeSettings: () => void;
    decodeConfig: DecodeConfig;
}

const ToolsView: React.FC<ToolsViewProps> = ({ onOpenDecodeSettings, decodeConfig }) => {
    const [showBatchReminderModal, setShowBatchReminderModal] = useState(false);
    const [reminderEnabled, setReminderEnabled] = useState(false);

    useEffect(() => {
        const checkStatus = () => {
            const enabled = localStorage.getItem('rh_batch_reminder_enabled') === 'true';
            setReminderEnabled(enabled);
        };
        checkStatus();
    }, [showBatchReminderModal]);

    return (
        <div className="flex-1 bg-slate-50 dark:bg-[#0F1115] p-6 overflow-auto">
            <div className="flex items-center justify-between mb-6 border-b border-slate-200 dark:border-slate-800 pb-2">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Settings className="w-6 h-6 text-slate-500" />
                    工具箱
                </h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {/* Duck Decode Tool Card */}
                <div
                    onClick={onOpenDecodeSettings}
                    className="group cursor-pointer bg-white dark:bg-[#1a1d24] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg hover:border-brand-300 dark:hover:border-brand-700 transition-all duration-300 overflow-hidden flex flex-col"
                >
                    <div className="h-24 bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/20 dark:to-slate-800 flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
                        <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
                        <span className="text-6xl filter drop-shadow-sm transform hover:scale-110 transition-transform cursor-default select-none">
                            🐥
                        </span>
                        {decodeConfig.enabled && (
                            <div className="absolute top-2 right-2 flex items-center gap-1 bg-green-500/10 text-green-600 dark:text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-500/20">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                已启用
                            </div>
                        )}
                    </div>

                    <div className="p-4">
                        <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm mb-1 group-hover:text-amber-600 dark:group-hover:text-amber-500 transition-colors">
                            小黄鸭解码
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                            自动识别并解码隐藏在小黄鸭图像中的加密数据，全局生效。
                        </p>
                    </div>
                </div>

                {/* Batch Reminder Tool Card */}
                <div
                    onClick={() => setShowBatchReminderModal(true)}
                    className="group cursor-pointer bg-white dark:bg-[#1a1d24] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg hover:border-brand-300 dark:hover:border-brand-700 transition-all duration-300 overflow-hidden flex flex-col"
                >
                    <div className="h-24 bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/20 dark:to-slate-800 flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
                        <Volume2 className="w-12 h-12 text-purple-500/80 group-hover:scale-110 transition-transform duration-300" />
                        {reminderEnabled && (
                            <div className="absolute top-2 right-2 flex items-center gap-1 bg-green-500/10 text-green-600 dark:text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-500/20">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                已启用
                            </div>
                        )}
                    </div>

                    <div className="p-4">
                        <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm mb-1 group-hover:text-purple-600 dark:group-hover:text-purple-500 transition-colors">
                            批量完成提醒
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                            批量任务全部完成后，播放指定的提示音进行通知。
                        </p>
                    </div>
                </div>

                {/* Placeholder for future tools */}
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-6 text-slate-400 gap-2 min-h-[160px]">
                    <Settings className="w-8 h-8 opacity-20" />
                    <span className="text-xs">更多工具开发中...</span>
                </div>
            </div>

            <BatchReminderModal 
                isOpen={showBatchReminderModal}
                onClose={() => setShowBatchReminderModal(false)}
            />
        </div>
    );
};

export default ToolsView;
