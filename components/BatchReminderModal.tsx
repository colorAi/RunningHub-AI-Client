import React, { useState, useEffect } from 'react';
import { X, Volume2, Play, Check, Bell, BellOff } from 'lucide-react';

interface BatchReminderModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AUDIO_OPTIONS = [
    { label: '俏皮少女', value: '俏皮少女.WAV' },
    { label: '海绵宝宝', value: '海绵宝宝.WAV' },
    { label: '猴哥', value: '猴哥.WAV' },
];

const STORAGE_KEY_REMINDER_ENABLED = 'rh_batch_reminder_enabled';
const STORAGE_KEY_REMINDER_AUDIO = 'rh_batch_reminder_audio';

const BatchReminderModal: React.FC<BatchReminderModalProps> = ({
    isOpen,
    onClose,
}) => {
    const [enabled, setEnabled] = useState(false);
    const [selectedAudio, setSelectedAudio] = useState(AUDIO_OPTIONS[0].value);
    const [isPlaying, setIsPlaying] = useState(false);

    // Load settings when modal opens
    useEffect(() => {
        if (isOpen) {
            const savedEnabled = localStorage.getItem(STORAGE_KEY_REMINDER_ENABLED);
            const savedAudio = localStorage.getItem(STORAGE_KEY_REMINDER_AUDIO);
            
            setEnabled(savedEnabled === 'true');
            if (savedAudio) {
                setSelectedAudio(savedAudio);
            }
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        localStorage.setItem(STORAGE_KEY_REMINDER_ENABLED, String(enabled));
        localStorage.setItem(STORAGE_KEY_REMINDER_AUDIO, selectedAudio);
        onClose();
    };

    const handleTestPlay = () => {
        if (isPlaying) return;
        
        setIsPlaying(true);
        const audio = new Audio(`/audio/${selectedAudio}`);
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => {
            setIsPlaying(false);
            console.error('Failed to play audio');
        };
        audio.play().catch(e => {
            console.error('Play error:', e);
            setIsPlaying(false);
        });
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
                        <Volume2 className="w-5 h-5 text-brand-500" />
                        批量完成提醒
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
                    {/* Enable Toggle */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            {enabled ? (
                                <Bell className="w-5 h-5 text-brand-500" />
                            ) : (
                                <BellOff className="w-5 h-5 text-slate-400" />
                            )}
                            <div>
                                <p className="font-medium text-slate-800 dark:text-white text-sm">
                                    开启完成播报
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    批量任务完成后播放提示音
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setEnabled(!enabled)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${enabled
                                ? 'bg-brand-500'
                                : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                        >
                            <div
                                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                            />
                        </button>
                    </div>

                    {/* Audio Selection - Only show when enabled */}
                    {enabled && (
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                选择提示音
                            </label>
                            <div className="grid gap-2">
                                {AUDIO_OPTIONS.map((option) => (
                                    <div
                                        key={option.value}
                                        onClick={() => setSelectedAudio(option.value)}
                                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                                            selectedAudio === option.value
                                                ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-800'
                                                : 'bg-white dark:bg-[#0F1115] border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-700'
                                        }`}
                                    >
                                        <span className={`text-sm ${selectedAudio === option.value ? 'text-brand-700 dark:text-brand-300 font-medium' : 'text-slate-600 dark:text-slate-400'}`}>
                                            {option.label}
                                        </span>
                                        {selectedAudio === option.value && (
                                            <Check className="w-4 h-4 text-brand-500" />
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Test Play Button */}
                            <button
                                onClick={handleTestPlay}
                                disabled={isPlaying}
                                className="w-full mt-2 py-2 flex items-center justify-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                            >
                                <Play className={`w-4 h-4 ${isPlaying ? 'animate-pulse text-brand-500' : ''}`} />
                                {isPlaying ? '播放中...' : '试听当前音效'}
                            </button>
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
                        className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm rounded-lg transition-colors"
                    >
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BatchReminderModal;
