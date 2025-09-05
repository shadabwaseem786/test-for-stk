import type { Candle } from '../types';

// A map to store the last price for each symbol to maintain continuity
const lastPrices: Record<string, number> = {};

// Base prices for known stocks to make them look somewhat realistic
const basePrices: Record<string, number> = {
    "RELIANCE:NSE": 2800, "TCS:NSE": 3800, "HDFCBANK:NSE": 1500, "INFY:NSE": 1600,
    "ICICIBANK:NSE": 1000, "HINDUNILVR:NSE": 2400, "SBIN:NSE": 750, "BHARTIARTL:NSE": 1200,
    "ITC:NSE": 430, "LT:NSE": 3600, "KOTAKBANK:NSE": 1700, "WIPRO:NSE": 500
};

/**
 * Simulates fetching real-time stock candle data from an API.
 * The data is generated but wrapped in an async call to mimic a real network request.
 * Price continuity is maintained between calls for the same stock symbol.
 *
 * @param symbol The stock symbol to fetch data for.
 * @param count The number of candles to generate.
 * @returns A promise that resolves to an array of candle data.
 */
export const fetchStockCandles = (symbol: string, count: number = 100): Promise<Candle[]> => {
    return new Promise(resolve => {
        // Simulate network latency of a real API call
        const latency = Math.random() * 1000 + 300; // 300ms to 1300ms

        setTimeout(() => {
            const initialPrice = lastPrices[symbol] || basePrices[symbol] || Math.random() * 2500 + 500;
            const candles: Candle[] = [];
            let currentPrice = initialPrice;
            const now = Date.now();

            for (let i = 0; i < count; i++) {
                const open = parseFloat(currentPrice.toFixed(2));

                // Create a more realistic random walk with some drift
                const volatility = 0.03; // ~3% volatility
                const drift = (Math.random() - 0.49) * 0.005; // slight drift up or down
                const changePercent = (Math.random() - 0.5) * volatility + drift;
                const changeAmount = open * changePercent;
                
                const close = parseFloat((open + changeAmount).toFixed(2));

                const high = parseFloat(Math.max(open, close, open + Math.random() * open * (volatility / 2)).toFixed(2));
                const low = parseFloat(Math.min(open, close, open - Math.random() * open * (volatility / 2)).toFixed(2));
                
                currentPrice = close;
                if (currentPrice < 50) currentPrice = 50; // floor price, increased for INR

                const volume = Math.floor(Math.random() * 500000) + 100000 + (Math.abs(changePercent) > (volatility * 0.7) ? Math.random() * 700000 : 0);

                candles.push({
                    time: now - (count - i - 1) * 15 * 60 * 1000, // 15-minute intervals
                    open,
                    high,
                    low,
                    close,
                    volume: Math.floor(volume),
                });
            }

            // Store the last price for the next fetch to ensure continuity
            lastPrices[symbol] = currentPrice;
            
            resolve(candles);
        }, latency);
    });
};
