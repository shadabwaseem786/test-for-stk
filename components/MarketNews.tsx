import React from 'react';
import type { NewsItem } from '../types';

interface MarketNewsProps {
    news: NewsItem[];
    isLoading: boolean;
}

export const MarketNews: React.FC<MarketNewsProps> = ({ news, isLoading }) => {
    return (
        <section className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-lg p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-slate-200 mb-4">Live Market News</h2>
            {isLoading ? (
                <div className="animate-pulse space-y-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="space-y-2">
                            <div className="h-3 bg-slate-700 rounded w-full"></div>
                            <div className="h-3 bg-slate-700 rounded w-5/6"></div>
                        </div>
                    ))}
                </div>
            ) : news.length > 0 ? (
                <ul className="space-y-3">
                    {news.map((item, index) => (
                        <li key={index} className="border-b border-slate-700/50 pb-3 last:border-b-0 last:pb-0">
                            <a 
                                href={item.uri} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-sm text-slate-300 hover:text-indigo-400 transition-colors"
                                title={item.title}
                            >
                                {item.title}
                            </a>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-slate-500 italic">Could not fetch market news.</p>
            )}
        </section>
    );
};