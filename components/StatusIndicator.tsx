import React from 'react';
import { ConnectionStatus } from '../types';

interface StatusIndicatorProps {
  status: ConnectionStatus;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
  const baseClasses = "w-2.5 h-2.5 rounded-full transition-all";
  let colorClasses = "";
  let glowElement = null;

  switch (status) {
    case ConnectionStatus.ONLINE:
      colorClasses = "bg-cyan-500";
      break;
    case ConnectionStatus.REFRESHING:
      colorClasses = "bg-amber-400";
      glowElement = <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75"></span>;
      break;
    case ConnectionStatus.OFFLINE:
      colorClasses = "bg-red-600";
      break;
  }

  return (
    <div className="relative flex items-center justify-center w-2.5 h-2.5">
      {glowElement}
      <span className={`${baseClasses} ${colorClasses} relative inline-flex`}></span>
    </div>
  );
};