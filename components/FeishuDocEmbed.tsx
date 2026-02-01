import React, { useState, useEffect, useRef } from 'react';
import { Loader2, ExternalLink, AlertCircle } from 'lucide-react';

interface FeishuDocEmbedProps {
    docUrl: string;
}

const FeishuDocEmbed: React.FC<FeishuDocEmbedProps> = ({ docUrl }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [shouldLoad, setShouldLoad] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Convert regular Feishu URL to embed URL
    const getEmbedUrl = (url: string) => {
        // Extract the doc ID from the URL
        const match = url.match(/\/wiki\/([a-zA-Z0-9]+)/);
        if (match && match[1]) {
            // Use the full URL with embed parameter
            return `${url}?embed=true`;
        }
        return url;
    };

    const embedUrl = getEmbedUrl(docUrl);

    const handleLoad = () => {
        setIsLoading(false);
        setHasError(false);
    };

    const handleError = () => {
        setIsLoading(false);
        setHasError(true);
    };

    const handleViewDetails = () => {
        setShouldLoad(true);
        setIsLoading(true);
    };

    // Handle window resize to adjust iframe height
    useEffect(() => {
        if (!shouldLoad) return;

        const adjustIframeHeight = () => {
            if (iframeRef.current && containerRef.current) {
                const containerHeight = containerRef.current.clientHeight;
                iframeRef.current.style.height = `${containerHeight}px`;
            }
        };

        // Initial adjustment
        adjustIframeHeight();

        // Listen for window resize
        window.addEventListener('resize', adjustIframeHeight);

        // Use ResizeObserver for more accurate container size changes
        let resizeObserver: ResizeObserver | null = null;
        if (containerRef.current) {
            resizeObserver = new ResizeObserver(() => {
                adjustIframeHeight();
            });
            resizeObserver.observe(containerRef.current);
        }

        // Cleanup
        return () => {
            window.removeEventListener('resize', adjustIframeHeight);
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
        };
    }, [shouldLoad]);

    return (
        <div className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0F1115] overflow-hidden">
            {/* Banner Image */}
            <div className="shrink-0">
                <img
                    src="/2026.webp"
                    alt="骏马新程 创作新生·2026"
                    className="w-full h-auto object-cover"
                />
            </div>

            {/* Header with link to open in Feishu */}
            <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-[#1a1d24] border-b border-slate-200 dark:border-slate-800 shrink-0">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    骏马新程 创作新生·2026
                </h3>
                <a
                    href={docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
                >
                    <span>在飞书中打开</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                </a>
            </div>

            {/* Content Area */}
            <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{ minHeight: '400px' }}>
                {!shouldLoad ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-[#0F1115] p-6">
                        <div className="text-center max-w-md">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
                                <ExternalLink className="w-8 h-8 text-brand-600 dark:text-brand-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                查看活动详情
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                                点击下方按钮加载飞书文档，了解"骏马新程 创作新生·2026"活动详情
                            </p>
                            <button
                                onClick={handleViewDetails}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg hover:shadow-xl"
                            >
                                <ExternalLink className="w-4 h-4" />
                                查看详情
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-[#0F1115] z-10">
                                <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-3" />
                                <span className="text-sm text-slate-500 dark:text-slate-400">加载中...</span>
                            </div>
                        )}

                        {hasError ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-[#0F1115] p-6">
                                <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
                                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 text-center">
                                    文档加载失败，请点击下方按钮在飞书中查看
                                </p>
                                <a
                                    href={docUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    在飞书中打开
                                </a>
                            </div>
                        ) : (
                            <iframe
                                ref={iframeRef}
                                src={embedUrl}
                                className="w-full border-0"
                                onLoad={handleLoad}
                                onError={handleError}
                                title="飞书文档"
                                allowFullScreen
                                style={{
                                    minHeight: '800px',
                                    height: '100%',
                                }}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default FeishuDocEmbed;
