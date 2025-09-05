
import React, { useState, useEffect, useRef } from 'react';
import { SparklineChart } from './SparklineChart';
import { StatusIndicator } from './StatusIndicator';
import { ConnectionStatus } from '../types';
import type { StockState, SignalType } from '../types';

const getSignalClasses = (type: SignalType | null | undefined): { text: string; bg: string; } => {
    switch (type) {
        case 'BUY': return { text: 'text-green-200', bg: 'bg-green-500/30' };
        case 'SELL': return { text: 'text-red-200', bg: 'bg-red-500/30' };
        case 'HOLD': return { text: 'text-yellow-200', bg: 'bg-yellow-500/30' };
        default: return { text: 'text-gray-400', bg: 'bg-gray-500/20' };
    }
};

const FormattedReason: React.FC<{ text: string }> = ({ text }) => {
    const trimmedText = text.trim();
    const keywords = ['RSI', 'MACD', 'bullish', 'bearish', 'crossover', 'overbought', 'oversold'];
    const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');

    const highlightKeywords = (sentence: string) => {
        const parts = sentence.split(keywordRegex);
        return parts.map((part, index) =>
            index % 2 === 1 ?
                <strong key={index} className="font-semibold text-white">{part}</strong> :
                <React.Fragment key={index}>{part}</React.Fragment>
        );
    };

    const isListFormatted = trimmedText.startsWith('- ') || trimmedText.startsWith('* ');
    let items: string[];
    if (isListFormatted) {
        items = trimmedText.split('\n').map(line => line.trim().replace(/^[*-]\s*/, '')).filter(Boolean);
    } else {
        items = trimmedText.match(/[^.!?]+[.!?]*/g) || [trimmedText];
    }

    return (
        <ul className="space-y-1.5 list-disc list-inside text-left">
            {items.filter(s => s.trim()).map((item, index) => (
                <li key={index}>
                    {highlightKeywords(item.trim())}
                </li>
            ))}
        </ul>
    );
};

interface StockCardProps {
    stockState: StockState;
    onAskAi: (symbol: string) => void;
}

export const StockCard: React.FC<StockCardProps> = ({ stockState, onAskAi }) => {
    const { symbol, status, countdown, signal, candles, error } = stockState;
    const [hasNewNews, setHasNewNews] = useState(false);
    const prevNewsUrisRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const currentNews = stockState.signal?.news || [];
        const currentNewsUris = new Set(currentNews.map(item => item.uri));

        if (currentNewsUris.size === 0) {
            prevNewsUrisRef.current = new Set();
            return;
        }

        const prevNewsUris = prevNewsUrisRef.current;
        
        if (prevNewsUris.size === 0) {
            prevNewsUrisRef.current = currentNewsUris;
            return;
        }

        const isNewFound = [...currentNewsUris].some(uri => !prevNewsUris.has(uri));

        if (isNewFound) {
            setHasNewNews(true);
            const timer = setTimeout(() => setHasNewNews(false), 8000);
            prevNewsUrisRef.current = currentNewsUris;
            return () => clearTimeout(timer);
        }
    }, [stockState.signal]);

    const signalClasses = getSignalClasses(signal?.type);

    return (
        <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700 rounded-lg p-4 flex flex-col gap-3 shadow-lg hover:border-indigo-500/50 transition-all duration-300 min-h-[430px] group">
            <header className="flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold text-gray-100">{symbol}</h2>
                    <div className="flex items-center gap-2 mt-1">
                        <StatusIndicator status={status} />
                        <span className="text-xs text-gray-400">
                             {status === ConnectionStatus.ONLINE ? `Next update in ${countdown.toString().padStart(2, '0')}s` : status.toString()}
                        </span>
                    </div>
                </div>
                 <div className="relative inline-block group/tooltip" aria-describedby={`tooltip-${symbol}`}>
                    {signal && !error ? (
                        <p className={`text-sm font-bold px-3 py-1 rounded-full ${signalClasses.bg} ${signalClasses.text} cursor-help`}>
                            {signal.type}
                        </p>
                    ) : (
                        status !== ConnectionStatus.OFFLINE && <div className="animate-pulse h-7 w-16 bg-gray-700 rounded-full"></div>
                    )}
                    
                    <div
                        id={`tooltip-${symbol}`}
                        role="tooltip"
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 max-h-48 overflow-y-auto p-3 bg-gray-700 border border-gray-600 rounded-lg shadow-xl text-xs text-gray-300 invisible opacity-0 group-hover/tooltip:visible group-hover/tooltip:opacity-100 transition-opacity duration-300 delay-0 group-hover/tooltip:delay-300 z-10 pointer-events-none"
                    >
                        <span className="font-bold block mb-2 text-gray-100">AI Analysis:</span>
                        {signal?.reason ? <FormattedReason text={signal.reason} /> : "No reason provided."}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-gray-700"></div>
                    </div>
                 </div>
            </header>
            
            <div className="flex items-center justify-end">
                 <button 
                    onClick={() => onAskAi(symbol)}
                    className="text-xs bg-indigo-600/50 text-indigo-200 px-3 py-1 rounded-full hover:bg-indigo-600/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!signal || !!error}
                    title={!signal ? "Wait for signal before asking AI" : `Ask AI about ${symbol}`}
                 >
                    Ask AI
                 </button>
            </div>
            
            <div className={`border-t border-gray-700 pt-3 mt-1 min-h-[96px] rounded-b-lg transition-all duration-500 ${hasNewNews ? 'shadow-[0_0_15px_rgba(79,70,229,0.5)] bg-indigo-900/20' : ''}`}>
                <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent News</h3>
                    {hasNewNews && (
                        <div className="relative flex items-center" title="New news available">
                            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </div>
                    )}
                </div>

                {status === ConnectionStatus.OFFLINE && error ? (
                    <div className="text-red-400 text-xs p-2 bg-red-900/30 border border-red-500/30 rounded-md h-full flex flex-col justify-center">
                        <p className="font-bold text-red-300 mb-1">Data Unavailable</p>
                        <p>{error}</p>
                    </div>
                ) : signal && signal.news && signal.news.length > 0 ? (
                    <ul className="space-y-2">
                        {signal.news.slice(0, 3).map((item, index) => (
                            <li key={index}>
                                <a 
                                  href={item.uri} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-xs text-gray-400 hover:text-indigo-400 transition-colors line-clamp-2 leading-snug"
                                  title={item.title}
                                >
                                    {item.title}
                                </a>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="space-y-2">
                        {signal === null && status !== ConnectionStatus.OFFLINE ? (
                            <div className="animate-pulse space-y-2">
                                <div className="h-3 bg-gray-700 rounded w-full"></div>
                                <div className="h-3 bg-gray-700 rounded w-5/6"></div>
                                <div className="h-3 bg-gray-700 rounded w-3/4"></div>
                            </div>
                        ) : (
                             signal && <p className="text-xs text-gray-500 italic">No recent news found.</p>
                        )}
                    </div>
                )}
            </div>

            <div className="mt-auto">
              <SparklineChart candles={candles} signalType={signal?.type ?? null} />
            </div>
        </div>
    );
};
