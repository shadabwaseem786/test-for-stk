import React, { useState, useEffect, useRef } from 'react';
import type { StockState, ChatMessage } from '../types';

const TypingIndicator: React.FC = () => (
    <div className="flex items-center space-x-1">
        <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
        <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
        <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></span>
    </div>
);

const AiIcon: React.FC = () => (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex-shrink-0 flex items-center justify-center mr-3 shadow-lg">
      <svg className="w-5 h-5 text-indigo-100" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 5.5C12.5523 5.5 13 5.94772 13 6.5V7.5C13 8.05228 12.5523 8.5 12 8.5C11.4477 8.5 11 8.05228 11 7.5V6.5C11 5.94772 11.4477 5.5 12 5.5Z" fill="currentColor"/>
        <path d="M12 15.5C12.5523 15.5 13 15.9477 13 16.5V17.5C13 18.0523 12.5523 18.5 12 18.5C11.4477 18.5 11 18.0523 11 17.5V16.5C11 15.9477 11.4477 15.5 12 15.5Z" fill="currentColor"/>
        <path d="M17.5 11C18.0523 11 18.5 11.4477 18.5 12C18.5 12.5523 18.0523 13 17.5 13H16.5C15.9477 13 15.5 12.5523 15.5 12C15.5 11.4477 15.9477 11 16.5 11H17.5Z" fill="currentColor"/>
        <path d="M7.5 11C8.05228 11 8.5 11.4477 8.5 12C8.5 12.5523 8.05228 13 7.5 13H6.5C5.94772 13 5.5 12.5523 5.5 12C5.5 11.4477 5.94772 11 6.5 11H7.5Z" fill="currentColor"/>
        <path fillRule="evenodd" clipRule="evenodd" d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12Z" fill="currentColor"/>
      </svg>
    </div>
);


const ChatBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const isUser = message.role === 'user';
    const isError = message.error === true;

    let bubbleClasses = "p-3 rounded-lg max-w-sm md:max-w-md text-slate-200 ";

    if (isUser) {
        bubbleClasses += "bg-indigo-600 self-end rounded-br-none shadow-md";
    } else if (isError) {
        bubbleClasses += "bg-red-900/50 border border-red-500/50 text-red-300 rounded-bl-none";
    } else {
        bubbleClasses += "bg-slate-700/80 rounded-bl-none shadow-md";
    }

    return (
        <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start items-start'}`}>
            {!isUser && !isError && <AiIcon />}
            <div className={bubbleClasses}>
                {message.isLoading ? (
                    <TypingIndicator />
                ) : (
                    <p className="text-sm leading-relaxed">{message.text}</p>
                )}
            </div>
        </div>
    );
};


interface ChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    stockState: StockState;
    onSendMessage: (symbol: string, message: string) => void;
    isLoading: boolean;
}

export const ChatModal: React.FC<ChatModalProps> = ({ isOpen, onClose, stockState, onSendMessage, isLoading }) => {
    const [input, setInput] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [stockState.chatHistory]);


    if (!isOpen) {
        return null;
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSendMessage(stockState.symbol, input.trim());
            setInput('');
        }
    };

    return (
        <div 
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" 
          onClick={onClose} 
          role="dialog" 
          aria-modal="true" 
          aria-labelledby="chat-modal-title"
        >
            <div 
              className="bg-slate-800/80 backdrop-blur-xl border border-slate-700 rounded-lg shadow-2xl w-full max-w-2xl h-full max-h-[80vh] flex flex-col transform animate-slide-up" 
              onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-slate-700">
                    <h2 id="chat-modal-title" className="text-xl font-bold text-slate-200">
                        Chat with AI about <span className="text-indigo-400">{stockState.symbol}</span>
                    </h2>
                    <button 
                        onClick={onClose} 
                        className="text-slate-400 hover:text-white transition-colors"
                        aria-label="Close chat modal"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                    {stockState.chatHistory.map((msg, index) => (
                        <ChatBubble key={index} message={msg} />
                    ))}
                    <div ref={chatEndRef} />
                </div>
                
                <footer className="p-4 border-t border-slate-700">
                    <form onSubmit={handleSubmit} className="flex items-center gap-3">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask a follow-up question..."
                            className="flex-1 w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-slate-900 disabled:bg-indigo-500/50 disabled:cursor-not-allowed transition-all"
                        >
                            {isLoading ? 'Sending...' : 'Send'}
                        </button>
                    </form>
                </footer>
            </div>
            <style>
            {`
              @keyframes fade-in {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
              
              @keyframes slide-up {
                from { transform: translateY(20px) scale(0.98); opacity: 0; }
                to { transform: translateY(0) scale(1); opacity: 1; }
              }
              .animate-slide-up { animation: slide-up 0.4s cubic-bezier(0.25, 1, 0.5, 1) forwards; }
            `}
            </style>
        </div>
    );
};