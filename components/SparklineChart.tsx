
import React, { useRef, useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Tooltip,
    Filler,
    ScriptableContext,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import AnnotationPlugin from 'chartjs-plugin-annotation';
import type { Candle, SignalType } from '../types';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Tooltip,
    Filler,
    zoomPlugin,
    AnnotationPlugin
);

interface DetectedPattern {
    index: number;
    name: string;
    short: string;
    position: 'top' | 'bottom';
    color: string;
}

interface SparklineChartProps {
  candles: Candle[];
  signalType: SignalType | null;
}

const calculateSMA = (data: number[], period: number): (number | null)[] => {
    if (data.length < period) return Array(data.length).fill(null);
    const sma: (number | null)[] = Array(period - 1).fill(null);
    let sum = data.slice(0, period).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
    for (let i = period; i < data.length; i++) {
        sum = sum - data[i - period] + data[i];
        sma.push(sum / period);
    }
    return sma;
};

const calculateEMA = (prices: number[], period: number): number[] => {
    if (prices.length < period) return [];
    const k = 2 / (period + 1);
    const emaArray: number[] = [];
    let sum = 0;
    for (let i = 0; i < period; i++) sum += prices[i];
    emaArray.push(sum / period);
    for (let i = period; i < prices.length; i++) {
        const newEma = (prices[i] * k) + (emaArray[emaArray.length - 1] * (1 - k));
        emaArray.push(newEma);
    }
    return emaArray;
};

const calculateRSIHistory = (prices: number[], period: number = 14): (number | null)[] => {
    if (prices.length <= period) return Array(prices.length).fill(null);
    const rsiValues: (number | null)[] = Array(period).fill(null);
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    const getRSI = (g: number, l: number) => (l === 0 ? 100 : 100 - (100 / (1 + g / l)));
    rsiValues.push(getRSI(avgGain, avgLoss));
    for (let i = period + 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
        rsiValues.push(getRSI(avgGain, avgLoss));
    }
    return rsiValues;
};

const calculateMACDHistory = (prices: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
    const emaFast = calculateEMA(prices, fastPeriod);
    const emaSlow = calculateEMA(prices, slowPeriod);
    const macdLineValues = emaSlow.map((slowVal, index) => emaFast[index + (slowPeriod - fastPeriod)] - slowVal);
    const signalLineValues = calculateEMA(macdLineValues, signalPeriod);
    const histogramValues = signalLineValues.map((signalVal, index) => macdLineValues[index + signalPeriod - 1] - signalVal);
    const macdOffset = slowPeriod - 1;
    const signalOffset = macdOffset + signalPeriod - 1;
    return {
        macdLine: [...Array(macdOffset).fill(null), ...macdLineValues],
        signalLine: [...Array(signalOffset).fill(null), ...signalLineValues],
        histogram: [...Array(signalOffset).fill(null), ...histogramValues],
    };
};

const detectCandlestickPatterns = (candles: Candle[]): DetectedPattern[] => {
    const patterns: DetectedPattern[] = [];
    if (candles.length < 3) return patterns;

    candles.forEach((candle, i) => {
        if (i < 2) return;
        const prev = candles[i - 1];
        
        const bodySize = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        
        // Doji
        if (range > 0 && bodySize / range < 0.08) {
             patterns.push({ index: i, name: 'Doji', short: 'D', position: 'top', color: 'gray' });
        }

        // Bullish Engulfing
        const isPrevDown = prev.close < prev.open;
        const isCurrUp = candle.close > candle.open;
        if (isPrevDown && isCurrUp && candle.open < prev.close && candle.close > prev.open) {
             patterns.push({ index: i, name: 'Bullish Engulfing', short: 'BE', position: 'bottom', color: '#22c55e' });
        }
        
        // Bearish Engulfing
        const isPrevUp = prev.close > prev.open;
        const isCurrDown = candle.close < candle.open;
        if (isPrevUp && isCurrDown && candle.open > prev.close && candle.close < prev.open) {
            patterns.push({ index: i, name: 'Bearish Engulfing', short: 'BE', position: 'top', color: '#ef4444' });
        }

        // Hammer
        const isDownTrend = prev.close < candles[i-2].close;
        const bodyHigh = Math.max(candle.open, candle.close);
        const bodyLow = Math.min(candle.open, candle.close);
        const lowerShadow = bodyLow - candle.low;
        const upperShadow = candle.high - bodyHigh;
        if (isDownTrend && bodySize > 0 && lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5) {
             patterns.push({ index: i, name: 'Hammer', short: 'H', position: 'bottom', color: '#22c55e' });
        }
    });

    return patterns;
}


export const SparklineChart: React.FC<SparklineChartProps> = ({ candles, signalType }) => {
    const chartRef = useRef<ChartJS<'line', (number | null)[], number>>(null);
    const [isZoomed, setIsZoomed] = useState(false);
    const [visibleIndicators, setVisibleIndicators] = useState({ volume: true, macd: true, rsi: true, patterns: true });

    const toggleIndicator = (indicator: keyof typeof visibleIndicators) => {
        setVisibleIndicators(prev => ({ ...prev, [indicator]: !prev[indicator] }));
    };

    const { buySignals, sellSignals, pointRadii, macdHistory, rsiHistory, detectedPatterns } = useMemo(() => {
        if (candles.length < 35) {
            return { buySignals: [], sellSignals: [], pointRadii: [], macdHistory: { macdLine: [], signalLine: [], histogram: [] }, rsiHistory: [], detectedPatterns: [] };
        }
        const prices = candles.map(c => c.close);
        const volumes = candles.map(c => c.volume);
        const macdHistory = calculateMACDHistory(prices);
        const rsiHistory = calculateRSIHistory(prices);
        const detectedPatterns = detectCandlestickPatterns(candles);

        const buySignals: (number | null)[] = Array(prices.length).fill(null);
        const sellSignals: (number | null)[] = Array(prices.length).fill(null);
        for (let i = 1; i < prices.length; i++) {
            const prevMacd = macdHistory.macdLine[i - 1];
            const currMacd = macdHistory.macdLine[i];
            const prevSignal = macdHistory.signalLine[i - 1];
            const currSignal = macdHistory.signalLine[i];
            if (prevMacd !== null && currMacd !== null && prevSignal !== null && currSignal !== null) {
                if (prevMacd <= prevSignal && currMacd > currSignal) buySignals[i] = prices[i];
                if (prevMacd >= prevSignal && currMacd < currSignal) sellSignals[i] = prices[i];
            }
        }
        const volumeSma = calculateSMA(volumes, 20);
        const pointRadii = candles.map((candle, index) => {
            const currentSma = volumeSma[index];
            if (currentSma !== null && candle.volume > currentSma * 1.75) return 2.5;
            return 0;
        });
        return { buySignals, sellSignals, pointRadii, macdHistory, rsiHistory, detectedPatterns };
    }, [candles]);

    const handleResetZoom = () => {
        if (chartRef.current) {
            chartRef.current.resetZoom();
            setIsZoomed(false);
        }
    };

    if (candles.length < 2) {
        return <div className="h-24 w-full flex items-center justify-center text-gray-600 animate-pulse">Loading Chart...</div>;
    }

    let strokeColor = '#64748b';
    let gradientStartColor = 'rgba(100, 116, 139, 0.4)';
    let gradientEndColor = 'rgba(100, 116, 139, 0)';
    if (signalType === 'BUY') {
        strokeColor = '#22c55e';
        gradientStartColor = 'rgba(34, 197, 94, 0.4)';
        gradientEndColor = 'rgba(34, 197, 94, 0)';
    }
    if (signalType === 'SELL') {
        strokeColor = '#ef4444';
        gradientStartColor = 'rgba(239, 68, 68, 0.4)';
        gradientEndColor = 'rgba(239, 68, 68, 0)';
    }

    const chartData = {
        labels: candles.map(c => c.time),
        datasets: [
            { type: 'line' as const, label: 'Price', data: candles.map(c => c.close), borderWidth: 2, pointRadius: pointRadii, pointBackgroundColor: strokeColor, tension: 0.4, fill: true, order: 2, borderColor: strokeColor,
                backgroundColor: (context: ScriptableContext<"line">) => {
                    const ctx = context.chart.ctx;
                    if (!ctx) return 'transparent';
                    const gradient = ctx.createLinearGradient(0, 0, 0, context.chart.height * 0.7);
                    gradient.addColorStop(0, gradientStartColor);
                    gradient.addColorStop(1, gradientEndColor);
                    return gradient;
                },
            },
            { type: 'bar' as const, label: 'Volume', data: candles.map(c => c.volume), backgroundColor: 'rgba(100, 116, 139, 0.2)', borderColor: 'transparent', yAxisID: 'y_volume', order: 3, hidden: !visibleIndicators.volume },
            { type: 'line' as const, label: 'RSI Overbought', data: Array(candles.length).fill(70), borderColor: 'rgba(239, 68, 68, 0.3)', borderWidth: 1, borderDash: [2, 2], pointRadius: 0, yAxisID: 'y_rsi', order: 6, fill: { target: { value: 100 }, above: 'rgba(239, 68, 68, 0.05)' }, hidden: !visibleIndicators.rsi },
            { type: 'line' as const, label: 'RSI Oversold', data: Array(candles.length).fill(30), borderColor: 'rgba(34, 197, 94, 0.3)', borderWidth: 1, borderDash: [2, 2], pointRadius: 0, yAxisID: 'y_rsi', order: 6, fill: { target: { value: 0 }, below: 'rgba(34, 197, 94, 0.05)' }, hidden: !visibleIndicators.rsi },
            { type: 'line' as const, label: 'RSI', data: rsiHistory, borderColor: '#a855f7', borderWidth: 1, pointRadius: 0, tension: 0.4, yAxisID: 'y_rsi', order: 5, hidden: !visibleIndicators.rsi },
            { type: 'bar' as const, label: 'MACD Hist.', data: macdHistory.histogram,
                backgroundColor: (context: ScriptableContext<"bar">) => {
                    const value = context.raw as number | null;
                    if (value === null) return 'transparent';
                    return value > 0 ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';
                },
                yAxisID: 'y_macd', order: 5, hidden: !visibleIndicators.macd
            },
            { type: 'line' as const, label: 'MACD Line', data: macdHistory.macdLine, borderColor: '#3b82f6', borderWidth: 1, pointRadius: 0, tension: 0.4, yAxisID: 'y_macd', order: 4, hidden: !visibleIndicators.macd },
            { type: 'line' as const, label: 'Signal Line', data: macdHistory.signalLine, borderColor: '#f97316', borderWidth: 1, pointRadius: 0, tension: 0.4, yAxisID: 'y_macd', order: 4, hidden: !visibleIndicators.macd },
            { type: 'line' as const, label: 'MACD Buy Signal', data: buySignals, pointStyle: 'triangle', pointRadius: 6, pointRotation: 0, pointBackgroundColor: '#3b82f6', pointBorderColor: 'rgba(255, 255, 255, 0.7)', hoverRadius: 10, showLine: false, order: 0 },
            { type: 'line' as const, label: 'MACD Sell Signal', data: sellSignals, pointStyle: 'triangle', pointRadius: 6, pointRotation: 180, pointBackgroundColor: '#a855f7', pointBorderColor: 'rgba(255, 255, 255, 0.7)', hoverRadius: 10, showLine: false, order: 0 }
        ],
    };

    const options: any = {
        responsive: true, maintainAspectRatio: false,
        scales: {
            x: { display: false, type: 'category' as const },
            y: { display: false, beginAtZero: false },
            y_volume: { display: false, type: 'linear' as const, position: 'right', grid: { drawOnChartArea: false } },
            y_rsi: { display: false, type: 'linear' as const, min: 0, max: 100, grid: { drawOnChartArea: false } },
            y_macd: { display: false, type: 'linear' as const, grid: { drawOnChartArea: false } },
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                enabled: true, mode: 'index' as const, intersect: false, backgroundColor: 'rgb(30 41 59)', borderColor: 'rgb(51 65 85)', borderWidth: 1, padding: 10, titleFont: { weight: 'bold' as const }, bodyFont: { size: 12 }, caretSize: 6, cornerRadius: 6, displayColors: true,
                filter: (item: any) => ['Price', 'RSI', 'MACD Line', 'Signal Line'].includes(item.dataset.label),
                callbacks: {
                    title: (items: any[]) => new Date(parseInt(items[0].label)).toLocaleString(),
                    label: (context: any) => {
                        let label = context.dataset.label || '';
                        if (label && context.parsed.y !== null) label += `: ${context.dataset.label === 'Price' ? '₹' : ''}${context.parsed.y.toFixed(2)}`;
                        return label;
                    },
                    footer: (items: any[]) => {
                        const index = items[0].dataIndex;
                        const volume = candles[index]?.volume;
                        const histVal = macdHistory.histogram[index];
                        const pattern = detectedPatterns.find(p => p.index === index);
                        const footerLines: string[] = [];
                        if (pattern) footerLines.push(`Pattern: ${pattern.name}`);
                        if (histVal !== null) footerLines.push(`Hist: ${histVal.toFixed(2)}`);
                        if (volume !== undefined) footerLines.push(`Volume: ${volume.toLocaleString()}`);
                        return footerLines;
                    }
                }
            },
            zoom: {
                pan: { enabled: true, mode: 'x' as const, onPanComplete: ({ chart }: { chart: ChartJS }) => setIsZoomed(chart.isZoomedOrPanned()) },
                zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' as const, onZoomComplete: ({ chart }: { chart: ChartJS }) => setIsZoomed(chart.isZoomedOrPanned()) }
            },
            annotation: {
                annotations: visibleIndicators.patterns ? detectedPatterns.map(pattern => {
                    const candle = candles[pattern.index];
                    const yAdjust = (candle.high - candle.low) * 0.15; // padding
                    return {
                        type: 'label',
                        content: pattern.short,
                        xValue: candle.time,
                        yValue: pattern.position === 'top' ? candle.high + yAdjust : candle.low - yAdjust,
                        backgroundColor: 'rgba(30, 41, 59, 0.7)',
                        borderColor: pattern.color,
                        borderWidth: 1,
                        borderRadius: 4,
                        color: 'white',
                        font: { size: 9, weight: 'bold' },
                        padding: { top: 2, bottom: 1, left: 3, right: 3 },
                        yAdjust: pattern.position === 'top' ? -5 : 5,
                    }
                }) : {}
            }
        },
    };

    return (
        <div className="h-24 w-full relative group/chart">
            <Line ref={chartRef} options={options} data={chartData as any} />
            
            <div className="absolute top-1 right-1 flex items-center gap-1.5 opacity-0 group-hover/chart:opacity-100 transition-opacity duration-300 z-10">
                {isZoomed && <button onClick={handleResetZoom} className="bg-gray-700/50 hover:bg-gray-600/70 text-white text-xs px-2 py-0.5 rounded-md backdrop-blur-sm" aria-label="Reset zoom">Reset</button>}
                
                <div className="flex items-center bg-gray-700/50 backdrop-blur-sm rounded-md p-0.5">
                    {(Object.keys(visibleIndicators) as Array<keyof typeof visibleIndicators>).map(key => (
                        <button
                            key={key}
                            onClick={() => toggleIndicator(key)}
                            title={`Toggle ${key.toUpperCase()}`}
                            className={`text-xs px-1.5 py-0.5 rounded transition-colors ${visibleIndicators[key] ? 'bg-indigo-500/80 text-white' : 'text-gray-400 hover:bg-gray-600/70'}`}
                        >
                            {key === 'patterns' ? 'PATS' : key.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            <div className="absolute bottom-1 left-2 text-xs text-gray-600 pointer-events-none opacity-0 group-hover/chart:opacity-100 transition-opacity duration-300">
                Scroll to zoom, Drag to pan
            </div>
        </div>
    );
};