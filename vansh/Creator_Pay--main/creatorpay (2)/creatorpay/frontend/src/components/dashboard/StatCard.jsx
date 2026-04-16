import React from 'react'

const colorMap = {
  green:  { value: 'text-neon-green',  glow: 'bg-neon-green', border: 'border-neon-green' },
  purple: { value: 'text-accent',      glow: 'bg-accent', border: 'border-accent' },
  amber:  { value: 'text-neon-amber',  glow: 'bg-neon-amber', border: 'border-neon-amber' },
  blue:   { value: 'text-neon-blue',   glow: 'bg-neon-blue', border: 'border-neon-blue' },
  red:    { value: 'text-neon-red',    glow: 'bg-neon-red', border: 'border-neon-red' },
}

export default function StatCard({ label, value, change, up, color = 'green', icon = '📊' }) {
  const c = colorMap[color] || colorMap.green
  return (
    <div className={`stat-card border border-white/10 hover:border-white/20 transition-all duration-300`}>
      <div className={`absolute top-0 right-0 w-20 h-20 rounded-full ${c.glow} opacity-5 translate-x-6 -translate-y-6 blur-xl`} />
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] text-white/40 uppercase tracking-wider">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className={`text-2xl font-mono font-bold ${c.value} leading-tight`}>{value}</p>
      {change && (
        <p className={`text-xs mt-1.5 ${up === true ? 'text-neon-green' : up === false ? 'text-neon-red' : 'text-white/30'}`}>
          {up === true && '▲ '}{up === false && '▼ '}{change}
        </p>
      )}
    </div>
  )
}
