import React, { useState, useEffect } from 'react';
import { ScrollText, CheckCircle2, ShieldCheck, Check } from 'lucide-react';

interface TermsModalProps {
    isOpen: boolean;
    mode: 'first-time' | 'about';
    onClose: () => void;
    onAgree: () => void;
}

const termsContent = `【免责声明与使用须知】

欢迎使用 [RH客户端(非官方)]（以下简称“本工具”）。在使用本工具前，请您务必仔细阅读并理解本声明。一旦您开始使用本工具，即表示您已接受并同意遵守以下所有条款：

1. 免费与性质

本工具为免费开源/免费分享软件，仅供个人学习、研究及非商业用途使用。

开发者不以任何形式向用户收取费用（注：如涉及第三方API调用费用，由用户自行承担）。

2. 合规使用原则

用户在使用本工具时，必须严格遵守国家相关法律法规（包括但不限于《生成式人工智能服务管理暂行办法》、《网络安全法》等）。

严禁利用本工具生成、传播以下内容：

反对宪法原则、危害国家安全、泄露国家秘密的内容；

色情、暴力、赌博、凶杀、恐怖主义或教唆犯罪的内容；

侮辱、诽谤他人，侵害他人名誉权、肖像权、知识产权等合法权益的内容；

虚假信息、深度伪造（Deepfake）欺诈等误导性内容。

3. 免责声明（重要）

技术中立： 本工具仅作为技术接口/客户端，用于连接第三方AI服务平台。所有生成内容均由底层AI模型根据用户输入的指令（Prompt）实时生成。

责任归属： 开发者无法控制、也不对用户输入的提示词及生成的最终内容进行预审或监控。因用户非法使用本工具或生成违规内容而导致的一切法律后果及责任，均由用户自行承担，与开发者及本工具无关。

第三方服务： 本工具所调用的AI接口服务由第三方提供，开发者不对第三方服务的稳定性、内容的准确性或版权归属负责。

4. 权利保留

如发现用户利用本工具进行违法违规活动，开发者有权在不通知的情况下停止提供服务、协助相关部门调查，并保留追究法律责任的权利。`;

const TermsModal: React.FC<TermsModalProps> = ({
    isOpen,
    mode,
    onClose,
    onAgree
}) => {
    const [isChecked, setIsChecked] = useState(false);
    const [canScroll, setCanScroll] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Reset state when opening
            setIsChecked(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const isFirstTime = mode === 'first-time';

    const handleConfirm = () => {
        if (isFirstTime) {
            if (isChecked) {
                onAgree();
            }
        } else {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#1a1d24] rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-slate-200 dark:border-slate-800">

                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-800/50 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="p-2 bg-brand-100 dark:bg-brand-900/30 rounded-lg">
                        <ShieldCheck className="w-6 h-6 text-brand-600 dark:text-brand-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                            免责声明与使用须知
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                            请仔细阅读以下条款
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        <div className="whitespace-pre-wrap font-sans text-slate-700 dark:text-slate-300 leading-relaxed text-base">
                            {termsContent}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-800/30">
                    {isFirstTime ? (
                        <div className="space-y-4">
                            <label className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700 group">
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked
                                        ? 'bg-brand-500 border-brand-500'
                                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-brand-400'
                                    }`}>
                                    {isChecked && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                                </div>
                                <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={isChecked}
                                    onChange={(e) => setIsChecked(e.target.checked)}
                                />
                                <span className={`text-sm font-medium transition-colors ${isChecked ? 'text-brand-600 dark:text-brand-400' : 'text-slate-600 dark:text-slate-400'
                                    }`}>
                                    我已阅读并完全同意上述所有条款
                                </span>
                            </label>

                            <button
                                onClick={handleConfirm}
                                disabled={!isChecked}
                                className={`w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all duration-200 flex items-center justify-center gap-2 ${isChecked
                                        ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/25 translate-y-0'
                                        : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                                    }`}
                            >
                                <CheckCircle2 className="w-5 h-5" />
                                {isChecked ? '同意并继续' : '请先勾选同意条款'}
                            </button>
                        </div>
                    ) : (
                        <div className="flex justify-end">
                            <button
                                onClick={onClose}
                                className="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-medium rounded-lg transition-colors"
                            >
                                关闭
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TermsModal;
