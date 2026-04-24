import React from 'react';
import { cn } from '../utils/cn';

interface PanelProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const Panel: React.FC<PanelProps> = ({ children, className, delay = 0 }) => (
  <div
    className={cn(
      'panel-shimmer relative rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-5 flex flex-col fade-up',
      className
    )}
    style={{ animationDelay: `${delay}ms` }}
  >
    {children}
  </div>
);

interface PanelHeaderProps {
  icon: React.ReactNode;
  iconBg?: string;
  title: string;
  badge?: React.ReactNode;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({ icon, iconBg, title, badge }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2.5">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <span className="text-sm font-semibold text-slate-100">{title}</span>
    </div>
    {badge}
  </div>
);

export const LiveBadge: React.FC<{ label?: string }> = ({ label = '● LIVE' }) => (
  <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
    {label}
  </span>
);

export const Badge: React.FC<{ children: React.ReactNode; color?: string; bg?: string; border?: string }> = ({
  children, color = '#94a3b8', bg = 'rgba(148,163,184,0.1)', border = 'rgba(148,163,184,0.2)'
}) => (
  <span
    className="px-2.5 py-1 rounded-md text-[11px] font-bold font-mono border"
    style={{ color, background: bg, borderColor: border }}
  >
    {children}
  </span>
);
