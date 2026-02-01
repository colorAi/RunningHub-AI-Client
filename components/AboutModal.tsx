import React from 'react';
import { Info, Github, ExternalLink, Gift, Users } from 'lucide-react';

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#1a1d24] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white">交流与支持</h2>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">

                    {/* Version Info */}
                    <div className="text-center pb-4 border-b border-slate-100 dark:border-slate-800/50">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">RH 应用客户端</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {/* Github */}
                        <a
                            href="https://github.com/colorAi/RunningHub-AI-Client"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                        >
                            <Github className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white" />
                            <div className="flex-1">
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Github主页</div>
                                <div className="text-xs text-slate-500">GitHub Repository</div>
                            </div>
                            <ExternalLink className="w-4 h-4 text-slate-400" />
                        </a>

                        {/* Bilibili */}
                        <a
                            href="https://space.bilibili.com/527601196?spm_id_from=333.40164.0.0"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                        >
                            <div className="w-5 h-5 flex items-center justify-center text-brand-400 group-hover:text-brand-500">
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                    <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.87.001 17.36V10.03c-.014-1.523.492-2.771 1.518-3.746.955-.907 2.185-1.42 3.69-1.537l-.023-.021L3.99 3.09 5.8 1.28l3.181 3.182h6.038l3.182-3.182 1.81 1.81-1.198 1.563ZM5.333 6.36c-1.005.035-1.842.38-2.51.035 0 0-.256.126-.464.334-.23.23-.377.533-.442.909L1.91 7.64v9.72c.046 1.054.405 1.91 1.077 2.566.671.657 1.545 1.002 2.622 1.034h12.783c1.076-.032 1.95-.377 2.622-1.034.671-.657 1.03-1.512 1.077-2.566V7.64c-.056-1.085-.415-1.954-1.077-2.607-.662-.653-1.526-1.002-2.593-1.046l-.029.012H5.333Zm3.583 3.667h2.5v2.5h-2.5v-2.5Zm6 0h2.5v2.5h-2.5v-2.5Z" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">哔站 HooTooH</div>
                                <div className="text-xs text-slate-500">作者主页</div>
                            </div>
                            <ExternalLink className="w-4 h-4 text-slate-400" />
                        </a>

                        {/* Register */}
                        <a
                            href="https://www.runninghub.cn/?inviteCode=rh-v1123"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors group"
                        >
                            <Gift className="w-5 h-5 text-amber-500 group-hover:text-amber-600" />
                            <div className="flex-1">
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">注册送1000RH币</div>
                                <div className="text-xs text-slate-500">邀请码 rh-v1123</div>
                            </div>
                            <ExternalLink className="w-4 h-4 text-slate-400" />
                        </a>

                        {/* QQ Group */}
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                            <Users className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                            <div className="flex-1">
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">QQ交流群</div>
                                <div className="text-xs text-slate-500 select-all">543917943</div>
                            </div>
                        </div>

                        {/* Donation */}
                        <div className="col-span-2 flex flex-col items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 mt-2 border border-slate-100 dark:border-slate-700/50">
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">如果对你有帮助，可以请我喝杯咖啡。</span>
                            <img src="/kafei.jpg" alt="Donate" className="w-48 h-auto rounded-lg shadow-sm" />
                        </div>

                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-800/30 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors"
                    >
                        关闭
                    </button>
                </div>

            </div>
        </div>
    );
};

export default AboutModal;
