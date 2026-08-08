'use client'

import type { TutorialEntry } from './tutorial'

/**
 * Bulle de tutoriel façon BD : panneau parchemin pixel centré, avec une petite
 * queue de bulle. Bloquante (fond assombri) : le jeu reste en pause tant que le
 * joueur n'a pas cliqué « Compris » (voir déclencheurs dans game/page.tsx).
 */
export default function TutorialBubble({
  entry,
  kind,
  onClose,
}: {
  entry: TutorialEntry
  kind: 'enemy' | 'tower'
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <div className="kcd-panel font-pixel w-[340px] max-w-[90vw]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] uppercase tracking-wider text-[#8a6a2c]">
              {kind === 'enemy' ? 'Nouvel ennemi' : 'Nouvelle tour'}
            </span>
          </div>
          <h2 className="font-med text-xl text-[#43310f] mb-1">{entry.title}</h2>
          <p className="text-sm leading-relaxed text-[#4a361a]">{entry.body}</p>
          <button onClick={onClose} className="kcd-btn font-med text-base w-full mt-4 py-2">
            Compris !
          </button>
        </div>
        <div
          className="absolute left-10 -bottom-3 w-0 h-0"
          style={{
            borderLeft: '14px solid transparent',
            borderRight: '14px solid transparent',
            borderTop: '16px solid #7a5a2c',
          }}
          aria-hidden
        />
      </div>
    </div>
  )
}
