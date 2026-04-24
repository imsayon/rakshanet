import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  valueColor?: string;
  change: React.ReactNode;
  topColor?: string;
  delay?: number;
}

const StatCard: React.FC<StatCardProps> = ({
  label, value, icon, iconBg, iconColor, valueColor, change, topColor, delay = 0
}) => (
  <div
    className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-5 
               transition-all duration-300 hover:border-white/[0.12] hover:-translate-y-0.5 hover:shadow-xl fade-up group"
    style={{ animationDelay: `${delay}ms` }}
  >
    {/* Top shimmer line */}
    <div
      className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      style={{ background: topColor ? `linear-gradient(90deg, transparent, ${topColor}, transparent)` : undefined }}
    />

    <div className="flex items-center justify-between mb-3">
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{label}</span>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: iconBg, color: iconColor }}>
        {icon}
      </div>
    </div>

    <div
      className="text-3xl font-bold font-mono tracking-tighter mb-1 count-up"
      style={{ color: valueColor }}
    >
      {value}
    </div>

    <div className="text-[12px] font-medium flex items-center gap-1">{change}</div>
  </div>
);

export default StatCard;
