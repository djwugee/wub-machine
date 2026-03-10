'use client'

interface RemixerCardProps {
  title: string
  description: string
  bpm: number
  icon: string
  selected: boolean
  onClick: () => void
}

export default function RemixerCard({
  title,
  description,
  bpm,
  icon,
  selected,
  onClick,
}: RemixerCardProps) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border-2 p-8 text-left transition-all duration-300 ${
        selected
          ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
          : 'border-border bg-card hover:border-primary/50 hover:shadow-md'
      }`}
    >
      {/* Background gradient effect */}
      <div
        className={`absolute inset-0 opacity-0 transition-opacity duration-300 ${
          selected ? 'opacity-100' : 'group-hover:opacity-50'
        }`}
        style={{
          background: `radial-gradient(circle at top right, hsl(var(--primary)/.1), transparent)`,
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-4xl">{icon}</span>
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              selected
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground group-hover:bg-primary/20'
            }`}
          >
            {bpm} BPM
          </span>
        </div>

        <h3 className="mb-2 text-2xl font-bold text-foreground">{title}</h3>

        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>

        {selected && (
          <div className="mt-4 flex items-center gap-2 text-primary">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Selected
            </span>
          </div>
        )}
      </div>
    </button>
  )
}
