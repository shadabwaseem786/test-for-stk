import { GoogleGenAI } from "@google/genai";
import type { Signal, Candle, ChatMessage, SignalType, NewsItem } from '../types';

/**
 * Custom error class for AI-related operations.
 */
export class AIError extends Error {
  constructor(message: string, public userFriendlyMessage: string) {
    super(message);
    this.name = 'AIError';
  }
}


/**
 * Calculates the Exponential Moving Average (EMA).
 * @param prices - Array of numbers.
 * @param period - The lookback period.
 * @returns An array of EMA values.
 */
const calculateEMA = (prices: number[], period: number): number[] => {
    if (prices.length < period) return [];
    const k = 2 / (period + 1);
    const emaArray: number[] = [];
    
    // First EMA is a simple moving average
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += prices[i];
    }
    emaArray.push(sum / period);
    
    // Subsequent EMAs
    for (let i = period; i < prices.length; i++) {
        const newEma = (prices[i] * k) + (emaArray[emaArray.length - 1] * (1 - k));
        emaArray.push(newEma);
    }
    return emaArray;
};

interface MACDResult {
    macdLine: number;
    signalLine: number;
    histogram: number;
}

/**
 * Calculates the Moving Average Convergence Divergence (MACD).
 * @param candles - An array of candle data.
 * @returns An object with the latest MACD line, signal line, and histogram, or null.
 */
const calculateMACD = (candles: Candle[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MACDResult | null => {
    const prices = candles.map(c => c.close);
    if (prices.length < slowPeriod + signalPeriod) {
        return null;
    }

    const emaFast = calculateEMA(prices, fastPeriod);
    const emaSlow = calculateEMA(prices, slowPeriod);

    // Align arrays and calculate MACD line
    const macdLineValues = emaFast.slice(slowPeriod - fastPeriod).map((val, index) => val - emaSlow[index]);
    
    if (macdLineValues.length < signalPeriod) {
        return null;
    }

    const signalLineValues = calculateEMA(macdLineValues, signalPeriod);
    
    const lastMacdLine = macdLineValues[macdLineValues.length - 1];
    const lastSignalLine = signalLineValues[signalLineValues.length - 1];

    if (lastMacdLine === undefined || lastSignalLine === undefined) return null;
    
    const histogram = lastMacdLine - lastSignalLine;

    return {
        macdLine: parseFloat(lastMacdLine.toFixed(2)),
        signalLine: parseFloat(lastSignalLine.toFixed(2)),
        histogram: parseFloat(histogram.toFixed(2)),
    };
};


/**
 * Calculates the Relative Strength Index (RSI) for a given set of candles.
 * @param candles - An array of candle data.
 * @param period - The lookback period for RSI calculation (default is 14).
 * @returns The RSI value, or null if there's not enough data.
 */
const calculateRSI = (candles: Candle[], period: number = 14): number | null => {
    if (candles.length <= period) {
        return null;
    }

    const prices = candles.map(c => c.close);
    let gains = 0;
    let losses = 0;

    // Calculate initial average gain and loss
    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) {
            gains += change;
        } else {
            losses -= change; // losses are positive values
        }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Smooth the averages for the rest of the data
    for (let i = period + 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        let currentGain = change > 0 ? change : 0;
        let currentLoss = change < 0 ? -change : 0;
        
        avgGain = (avgGain * (period - 1) + currentGain) / period;
        avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
    }

    if (avgLoss === 0) {
        return 100; // RSI is 100 if average loss is zero
    }
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return parseFloat(rsi.toFixed(2));
};

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const handleApiError = (error: any, context: string): never => {
    console.error(`Error in ${context}:`, error);
    const message = error.message?.toLowerCase() || '';

    if (message.includes('api key not valid')) {
        throw new AIError(error.message, 'Invalid API Key. Please ensure it is set correctly.');
    }
    if (message.includes('429') || message.includes('resource_exhausted')) {
        throw new AIError(error.message, 'API rate limit reached. Please wait and try again.');
    }
    if (error instanceof TypeError) { // Often indicates a network error
        throw new AIError(error.message, 'Network error. Please check your internet connection.');
    }
    
    throw new AIError(error.message, `An unexpected error occurred with the AI service.`);
};

const cleanAndParseJson = (text: string): any => {
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
        jsonText = jsonText.substring(7, jsonText.length - 3).trim();
    } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.substring(3, jsonText.length - 3).trim();
    }
    return JSON.parse(jsonText);
};

export const getStockSignal = async (symbol: string, candles: Candle[]): Promise<Signal> => {
    try {
        const rsiValue = calculateRSI(candles);
        const macdResult = calculateMACD(candles);

        const prompt = `
            You are an expert AI financial analyst specializing in the Indian stock market (NSE). Your analysis must be heavily weighted towards the impact of recent, real-world news.

            **Stock:** ${symbol}

            **Technical Snapshot (for context only):**
            - Recent Closing Prices: A sequence ending in ${candles.slice(-1)[0]?.close.toFixed(2)}
            - Current 14-period RSI: ${rsiValue !== null ? rsiValue : 'N/A'}
            - Current MACD (12, 26, 9) Histogram: ${macdResult ? macdResult.histogram : 'N/A'}

            **Primary Analysis Instructions:**
            1.  **News First:** Use your search tool to find the most impactful and recent news (2-3 articles) for ${symbol}. Prioritize news related to:
                *   Earnings reports and forward guidance.
                *   Major product announcements or failures.
                *   Regulatory changes affecting the company or its sector.
                *   Mergers, acquisitions, or significant partnerships.
                *   Macroeconomic news (e.g., RBI interest rate changes, inflation data) that directly impacts this stock.
                *   Significant geopolitical events affecting its market.
            2.  **Synthesize and Decide:** Based primarily on the **sentiment and implications of the news**, determine a trading signal. Use the technical snapshot as a secondary confirmation factor. For example, if news is strongly positive and the MACD shows bullish momentum, that's a strong BUY. If news is negative but technicals are bullish, a HOLD signal might be more appropriate, with a reason explaining the conflict.
            3.  **Explain Your Reasoning:** In the 'reason' field, clearly explain HOW the news headlines directly support your trading signal. Briefly mention if the technical indicators align with or contradict the news-driven conclusion.

            **Output Format:**
            Your response MUST be a single, valid JSON object and nothing else. Do not include any explanatory text or markdown wrappers.

            {
              "type": "BUY" | "SELL" | "HOLD",
              "reason": "A 2-3 sentence explanation, focusing on how the latest news impacts the stock, with a brief mention of technical confirmation or contradiction.",
              "news": [
                { "title": "The full, recent news headline", "uri": "The direct URL to the news article" }
              ]
            }
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                tools: [{googleSearch: {}}],
            },
        });

        const parsedJson = cleanAndParseJson(response.text);
        
        if (parsedJson.type && parsedJson.reason && Array.isArray(parsedJson.news)) {
            const ground_truth_news = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(
                (chunk: any) => ({
                    title: chunk?.web?.title,
                    uri: chunk?.web?.uri,
                })
            ).filter(news => news.title && news.uri) ?? [];
            
            // Prefer grounding metadata if available, otherwise use what the model generated.
            parsedJson.news = ground_truth_news.length > 0 ? ground_truth_news : parsedJson.news;

            return parsedJson as Signal;
        } else {
            throw new Error("Invalid JSON structure received from AI.");
        }

    } catch (error: any) {
        if (error instanceof SyntaxError) {
             throw new AIError(error.message, 'AI returned an invalid response format. Please try refreshing.');
        }
        handleApiError(error, `getStockSignal for ${symbol}`);
    }
};

export const getChatResponse = async (symbol: string, candles: Candle[], history: ChatMessage[]): Promise<string> => {
    try {
        const rsiValue = calculateRSI(candles);
        const macdResult = calculateMACD(candles);
        const latestPrice = candles.length > 0 ? candles[candles.length - 1].close.toFixed(2) : 'N/A';

        const contents = history.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.text }]
        }));

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents,
            config: {
                systemInstruction: `You are a helpful and concise AI financial analyst. 
                Your purpose is to answer user questions about the stock: ${symbol}. 
                You have the following real-time technical data. Use it to inform your answers. Do not mention that you have this data unless it's relevant to the user's question.
                - Current Price: ₹${latestPrice}
                - 14-period RSI: ${rsiValue !== null ? rsiValue : 'N/A'}
                - MACD (12, 26, 9) -- MACD Line: ${macdResult?.macdLine}, Signal Line: ${macdResult?.signalLine}, Histogram: ${macdResult?.histogram}
                
                Keep your answers brief and to the point.
                `,
            }
        });

        return response.text;

    } catch (error) {
        handleApiError(error, `getChatResponse for ${symbol}`);
    }
};


export const getMarketSentiment = async (signals: Record<string, SignalType>): Promise<string> => {
    try {
        const signalSummary = Object.entries(signals)
            .map(([symbol, type]) => `${symbol}: ${type}`)
            .join(', ');
        
        if (!signalSummary) {
            return "Awaiting sufficient data to determine market sentiment.";
        }
        
        const prompt = `
            You are an expert AI financial market analyst for the Indian stock market (NSE).
            Based on the following list of real-time trading signals for key stocks, provide a concise, one or two-sentence summary of the overall market sentiment.
            Do not just list the counts of BUY/SELL signals. Instead, synthesize the information into a coherent narrative. For example, mention if a particular sector seems strong or weak if you can infer it.

            Signals: ${signalSummary}
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        return response.text;
    } catch (error) {
        handleApiError(error, `getMarketSentiment`);
    }
};


export const getMarketNews = async (): Promise<NewsItem[]> => {
    try {
        const prompt = `
            You are a financial news aggregator. Find the 4 most important, recent news headlines related to the Indian stock market (NSE).
            The response should only contain the news articles found by the search tool.
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });
        
        const ground_truth_news = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(
            (chunk: any) => ({
                title: chunk?.web?.title,
                uri: chunk?.web?.uri,
            })
        ).filter(news => news.title && news.uri) ?? [];

        if (ground_truth_news.length > 0) {
            return ground_truth_news;
        }

        // If grounding metadata is not available for some reason, we must indicate an issue.
        // We will no longer parse the text response to avoid potential hallucinations.
        throw new Error("Could not retrieve verifiable news from search tool.");

    } catch (error) {
        if (error instanceof AIError) {
          // Re-throw AIError to propagate user-friendly message
          throw error;
        }
        handleApiError(error, `getMarketNews`);
    }
};