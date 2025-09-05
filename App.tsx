import React, { useState, useEffect, useCallback, useRef } from 'react';
import { STOCKS, REFRESH_INTERVAL_SECONDS } from './constants';
import { ConnectionStatus } from './types';
import type { StockState, ChatMessage, SignalType, NewsItem } from './types';
import { getStockSignal, getChatResponse, getMarketSentiment, getMarketNews, AIError } from './services/geminiService';
import { fetchStockCandles } from './utils/mockData';
import { StockCard } from './components/StockCard';
import { ChatModal } from './components/ChatModal';
import { MarketNews } from './components/MarketNews';
import { PerformanceLeaders } from './components/PerformanceLeaders';
import { scheduleApiCall } from './utils/apiRateLimiter';

const App: React.FC = () => {
    const [stockData, setStockData] = useState<Record<string, StockState>>(() => {
        const initialState: Record<string, StockState> = {};
        for (const symbol of STOCKS) {
            initialState[symbol] = {
                symbol,
                candles: [],
                signal: null,
                countdown: REFRESH_INTERVAL_SECONDS,
                status: ConnectionStatus.OFFLINE,
                chatHistory: [],
                error: null,
            };
        }
        return initialState;
    });
    
    const [chatModalSymbol, setChatModalSymbol] = useState<string | null>(null);
    const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
    const [marketSentiment, setMarketSentiment] = useState<string>('');
    const [isSentimentLoading, setIsSentimentLoading] = useState<boolean>(true);
    const [marketNews, setMarketNews] = useState<NewsItem[]>([]);
    const [isMarketNewsLoading, setIsMarketNewsLoading] = useState<boolean>(true);

    const sentimentDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isRefreshingAll = Object.values(stockData).some(s => s.status === ConnectionStatus.REFRESHING);

    const fetchSignal = useCallback(async (symbol: string) => {
        setStockData(prev => ({
            ...prev,
            [symbol]: { ...prev[symbol], status: ConnectionStatus.REFRESHING, error: null }
        }));
        
        try {
            const newCandles = await fetchStockCandles(symbol);
            const signal = await getStockSignal(symbol, newCandles);
            setStockData(prev => ({
                ...prev,
                [symbol]: {
                    ...prev[symbol],
                    candles: newCandles,
                    signal: signal,
                    status: ConnectionStatus.ONLINE,
                    countdown: REFRESH_INTERVAL_SECONDS,
                    error: null,
                }
            }));
        } catch (error: any) {
            console.error(`Failed to fetch signal for ${symbol}:`, error);
            const userMessage = error instanceof AIError ? error.userFriendlyMessage : "An unknown error occurred.";
            setStockData(prev => ({
                ...prev,
                [symbol]: { 
                    ...prev[symbol], 
                    status: ConnectionStatus.OFFLINE, 
                    countdown: REFRESH_INTERVAL_SECONDS,
                    error: userMessage,
                }
            }));
        }
    }, []);

    const fetchMarketNews = useCallback(async () => {
        setIsMarketNewsLoading(true);
        try {
            const news = await scheduleApiCall(getMarketNews);
            setMarketNews(news);
        } catch (error) {
            console.error("Failed to fetch market news:", error);
            setMarketNews([]); // Set to empty on error
        } finally {
            setIsMarketNewsLoading(false);
        }
    }, []);

    const handleRefreshAll = useCallback(async () => {
      STOCKS.forEach(symbol => 
          scheduleApiCall(() => fetchSignal(symbol))
      );
      fetchMarketNews();
    }, [fetchSignal, fetchMarketNews]);

    const handleOpenChat = (symbol: string) => setChatModalSymbol(symbol);
    const handleCloseChat = () => setChatModalSymbol(null);

    const handleSendMessage = async (symbol: string, message: string) => {
      if (isChatLoading) return;
      setIsChatLoading(true);

      const userMessage: ChatMessage = { role: 'user', text: message };
      const loadingMessage: ChatMessage = { role: 'model', text: '', isLoading: true };

      const currentHistory = [...stockData[symbol].chatHistory, userMessage];

      setStockData(prev => ({
        ...prev,
        [symbol]: {
          ...prev[symbol],
          chatHistory: [...currentHistory, loadingMessage]
        }
      }));

      try {
        const responseText = await scheduleApiCall(() => getChatResponse(symbol, stockData[symbol].candles, currentHistory));
        const modelMessage: ChatMessage = { role: 'model', text: responseText };
        setStockData(prev => ({
          ...prev,
          [symbol]: {
            ...prev[symbol],
            chatHistory: [...currentHistory, modelMessage]
          }
        }));
      } catch (error: any) {
        console.error(`Error in chat for ${symbol}:`, error);
        const userMessage = error instanceof AIError ? error.userFriendlyMessage : "An unknown error occurred.";
        const errorMessage: ChatMessage = { role: 'model', text: userMessage, error: true };
         setStockData(prev => ({
          ...prev,
          [symbol]: {
            ...prev[symbol],
            chatHistory: [...currentHistory, errorMessage]
          }
        }));
      } finally {
        setIsChatLoading(false);
      }
    };

    useEffect(() => {
        handleRefreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            const symbolsToFetch: string[] = [];
            
            setStockData(prevData => {
                const newData = { ...prevData };
                for (const symbol in newData) {
                    if (newData[symbol].status === ConnectionStatus.ONLINE) {
                        const newCountdown = newData[symbol].countdown - 1;
                        if (newCountdown <= 0) {
                            symbolsToFetch.push(symbol);
                            newData[symbol] = { ...newData[symbol], status: ConnectionStatus.REFRESHING, countdown: 0 };
                        } else {
                            newData[symbol] = { ...newData[symbol], countdown: newCountdown };
                        }
                    }
                }
                return newData;
            });
            
            if (symbolsToFetch.length > 0) {
                symbolsToFetch.forEach(symbol => {
                    scheduleApiCall(() => fetchSignal(symbol));
                });
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [fetchSignal]);

    useEffect(() => {
        if (sentimentDebounceTimer.current) {
            clearTimeout(sentimentDebounceTimer.current);
        }

        sentimentDebounceTimer.current = setTimeout(async () => {
            const signalsForSentiment = Object.values(stockData)
                .filter(s => s.signal && s.status === ConnectionStatus.ONLINE)
                .reduce((acc, s) => {
                    acc[s.symbol] = s.signal!.type;
                    return acc;
                }, {} as Record<string, SignalType>);
            
            if (Object.keys(signalsForSentiment).length > STOCKS.length / 2) {
                setIsSentimentLoading(true);
                try {
                    const sentiment = await scheduleApiCall(() => getMarketSentiment(signalsForSentiment));
                    setMarketSentiment(sentiment);
                } catch (error: any) {
                    console.error("Failed to fetch market sentiment:", error);
                    const userMessage = error instanceof AIError ? error.userFriendlyMessage : "Could not fetch market sentiment.";
                    setMarketSentiment(userMessage);
                } finally {
                    setIsSentimentLoading(false);
                }
            }
        }, 2000);

        return () => {
            if (sentimentDebounceTimer.current) {
                clearTimeout(sentimentDebounceTimer.current);
            }
        };
    }, [stockData]);


    const activeChatStock = chatModalSymbol ? stockData[chatModalSymbol] : null;

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8">
            <main className="max-w-screen-2xl mx-auto">
                <header className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
                    <div className="text-center sm:text-left">
                        <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-gradient-to-r from-slate-200 to-slate-400 bg-clip-text text-transparent text-glow">
                          AI Trading Desk
                        </h1>
                        <p className="mt-2 text-lg text-slate-400">Live Indian Market Analysis by Gemini AI</p>
                    </div>
                    <div className="flex items-center gap-4">
                         <div className="flex items-center gap-2.5 bg-slate-800/50 border border-slate-700 px-3 py-1.5 rounded-full">
                             <div className="relative flex h-3 w-3">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isRefreshingAll ? 'bg-amber-400' : 'bg-cyan-400'} opacity-75`}></span>
                                <span className={`relative inline-flex rounded-full h-3 w-3 ${isRefreshingAll ? 'bg-amber-500' : 'bg-cyan-500'}`}></span>
                             </div>
                             <span className="text-sm font-semibold text-slate-300">{isRefreshingAll ? 'Updating' : 'Live'}</span>
                         </div>
                         <button
                            onClick={handleRefreshAll}
                            disabled={isRefreshingAll}
                            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-slate-900 disabled:bg-indigo-500/50 disabled:cursor-not-allowed transition-all"
                        >
                            {isRefreshingAll ? 'Refreshing...' : 'Refresh All'}
                        </button>
                    </div>
                </header>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    {/* Main Content: Stock Cards */}
                    <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {STOCKS.map(symbol => 
                            <StockCard 
                                key={symbol} 
                                stockState={stockData[symbol]}
                                onAskAi={handleOpenChat}
                            />
                        )}
                    </div>

                    {/* Sidebar */}
                    <aside className="lg:col-span-1 space-y-8 sticky top-8">
                        <section className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-lg p-6 shadow-2xl">
                            <h2 className="text-xl font-bold text-slate-200 mb-4">Overall Market Sentiment</h2>
                            {isSentimentLoading ? (
                                <div className="animate-pulse space-y-3">
                                    <div className="h-4 bg-slate-700 rounded w-full"></div>
                                    <div className="h-4 bg-slate-700 rounded w-3/4"></div>
                                </div>
                            ) : (
                                <p className="text-slate-300 leading-relaxed">{marketSentiment}</p>
                            )}
                        </section>

                        <PerformanceLeaders stockData={stockData} />

                        <MarketNews news={marketNews} isLoading={isMarketNewsLoading} />

                        <footer className="text-center text-slate-500 text-xs">
                            <p>This is a demo application. Data is randomly generated and signals are for illustrative purposes only.</p>
                            <p>This is not financial advice.</p>
                        </footer>
                    </aside>
                </div>

            </main>

            {activeChatStock && (
              <ChatModal 
                isOpen={!!chatModalSymbol}
                onClose={handleCloseChat}
                stockState={activeChatStock}
                onSendMessage={handleSendMessage}
                isLoading={isChatLoading}
              />
            )}
        </div>
    );
};

export default App;