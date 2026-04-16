import React from 'react'

const colorMap = {
  green:  { value: 'text-neon-green',  glow: 'bg-neon-green' },
  purple: { value: 'text-accent',      glow: 'bg-accent' },
  amber:  { value: 'text-neon-amber',  glow: 'bg-neon-amber' },
  blue:   { value: 'text-neon-blue',   glow: 'bg-neon-blue' },
  red:    { value: 'text-neon-red',    glow: 'bg-neon-red' },
}

export default function StatCard({ label, value, change, up, color = 'green' }) {
  const c = colorMap[color] || colorMap.green
  return (
    <div className="stat-card">
      <div className={`absolute top-0 right-0 w-20 h-20 rounded-full ${c.glow} opacity-5 translate-x-6 -translate-y-6 blur-xl`} />
      <p className="text-[11px] text-white/40 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-mono font-bold ${c.value} leading-tight`}>{value}</p>
      {change && (
        <p className={`text-xs mt-1.5 ${up === true ? 'text-neon-green' : up === false ? 'text-neon-red' : 'text-white/30'}`}>
          {up === true && '▲ '}{up === false && '▼ '}{change}
        </p>
      )}
    </div>
  )
}
