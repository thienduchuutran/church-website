'use client'

/**
 * TypingIndicator displays three animated dots to show the AI is thinking.
 * Uses CSS keyframes — no JS animation library needed.
 */
export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-2 w-2 rounded-full bg-primary/60"
            style={{
              animation: 'typing-bounce 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </div>
      <span className="ml-2 text-xs text-muted">VGOMNE Helper is thinking…</span>

      {/* Keyframes injected once via inline style tag */}
      <style jsx>{`
        @keyframes typing-bounce {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-6px);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
