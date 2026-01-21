import React, { useState, useEffect } from 'react';

const Footer: React.FC = () => {
    const [time, setTime] = useState(new Date());
    const [quote, setQuote] = useState<string>('行路难，行路难，多歧路，今安在。');

    // Time update
    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Quote fetch (Every 30 mins)
    useEffect(() => {
        const fetchQuote = async () => {
            try {
                const response = await fetch('https://v1.hitokoto.cn/');
                if (response.ok) {
                    const data = await response.json();
                    setQuote(`${data.hitokoto} —— ${data.from}`);
                }
            } catch (error) {
                // Keep default or previous quote on failure
                console.error('Failed to fetch quote:', error);
            }
        };

        fetchQuote();
        const timer = setInterval(fetchQuote, 30 * 60 * 1000);
        return () => clearInterval(timer);
    }, []);

    // Formatters
    const formatDate = (date: Date) => {
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
        });
    };

    const formatLunar = (date: Date) => {
        return date.toLocaleDateString('zh-CN-u-ca-chinese', {
            month: 'long',
            day: 'numeric',
        });
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('zh-CN', {
            hour12: false,
        });
    };

    return (
        <footer className="h-8 border-t border-slate-200 dark:border-slate-800/50 bg-white dark:bg-[#161920] flex items-center justify-between px-12 text-xs text-slate-400 shrink-0 select-none">

            {/* Left: Quote */}
            <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left mr-4" title={quote}>
                <span className="italic opacity-80">{quote}</span>
            </div>

            {/* Center: Copyright */}
            <div className="shrink-0 font-medium opacity-60">
                © {new Date().getFullYear()} RunningHub Client
            </div>

            {/* Right: Info */}
            <div className="flex-1 flex justify-end gap-3 items-center overflow-hidden whitespace-nowrap ml-4">
                <span>{formatDate(time)}</span>
                <span className="opacity-80 font-serif">农历 {formatLunar(time)}</span>
                <span className="font-mono">{formatTime(time)}</span>
            </div>
        </footer>
    );
};

export default Footer;
