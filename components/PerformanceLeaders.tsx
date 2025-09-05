
import React, { useMemo } from 'react';
import type { StockState } from '../types';
import { ConnectionStatus } from '../types';

interface PerformanceLeadersProps {
    stockData: Record<string, StockState>;
}

export const PerformanceLeaders: React.FC<PerformanceLeadersProps> = ({ stockData }) => {
    const buySignalStocks = useMemo(() => {
        return Object.values(stockData)
            .filter(stock => stock.signal?.type === 'BUY' && stock.status === ConnectionStatus.ONLINE)
            .map(stock => stock.symbol);
    }, [stockData]);

    const hasLoadedAny = Object.values(stockData).some(s => s.status !== ConnectionStatus.OFFLINE);

    return (
        <section className="bg-gray-800/60 backdrop-blur-sm border border-gray-700 rounded-lg p-6 shadow-lg">
            <h2 className="text-xl font-bold text-gray-200 mb-4">Top Buy Signals</h2>
            {buySignalStocks.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {buySignalStocks.map(symbol => (
                        <span key={symbol} className="px-3 py-1 text-sm font-medium text-green-200 bg-green-500/30 rounded-full">
                            {symbol}
                        </span>
                    ))}
                </div>
            ) : (
                 hasLoadedAny ? (
                    <p className="text-sm text-gray-500 italic">No strong "BUY" signals identified currently.</p>
                 ) : (
                    <div className="animate-pulse flex flex-wrap gap-2">
                        <div className="h-7 w-24 bg-gray-700 rounded-full"></div>
                        <div className="h-7 w-20 bg-gray-700 rounded-full"></div>
                        <div className="h-7 w-28 bg-gray-700 rounded-full"></div>
                    </div>
                 )
            )}
        </section>
    );
};
