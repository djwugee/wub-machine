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
      className={`card-elevated group relative overflow-hidden rounded-xl p-6 sm:p-8 text-left cursor-pointer transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        selected
          ? 'border-2 border-primary bg-primary/5 shadow-xl shadow-primary/20'
          : 'hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10'
      }`}
    >
      {/* Accent line */}
      <div
        className={`absolute inset-x-0 top-0 h-0.5 transition-all duration-300 ${
          selected
            ? 'bg-gradient-to-r from-primary via-secondary to-primary'
            : 'bg-transparent group-hover:bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20'
        }`}
      />

      {/* Content */}
      <div className="relative z-10">
        <div className="mb-4 flex items-start justify-between gap-4">
          <span
            className={`text-4xl sm:text-5xl transition-transform duration-300 ${
              selected ? 'scale-110 filter drop-shadow-lg' : 'group-hover:scale-105'
            }`}
          >
            {icon}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs sm:text-sm font-semibold whitespace-nowrap ring-1 transition-all duration-200 ${
              selected
                ? 'bg-accent/20 text-accent ring-accent/40'
                : 'bg-muted/50 text-muted-foreground ring-muted/60 group-hover:bg-primary/20 group-hover:text-primary group-hover:ring-primary/40'
            }`}
          >
            {bpm} BPM
          </span>
        </div>

        <h3 className="mb-3 text-xl sm:text-2xl font-bold text-foreground">
          {title}
        </h3>

        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          {description}
        </p>

        {selected && (
          <div className="mt-4 flex items-center gap-2 text-primary">
            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Active
            </span>
          </div>
        )}
      </div>
    </button>
  )
}
