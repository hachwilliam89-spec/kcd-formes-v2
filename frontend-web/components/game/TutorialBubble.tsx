'use client'

import type { TutorialEntry, TutorialKind } from './tutorial'

/**
 * Bulle de tutoriel façon BD : panneau parchemin pixel centré, avec une petite
 * queue de bulle. Bloquante (fond assombri) : le jeu reste en pause tant que le
 * joueur n'a pas cliqué « Compris » (voir déclencheurs dans game/page.tsx).
 * « Ne plus afficher les conseils » coupe toutes les bulles d'un coup
 * (réactivables depuis la barre d'action).
 */
const KIND_LABEL: Record<TutorialKind, string> = {
  enemy: 'Nouvel ennemi',
  tower: 'Nouvelle tour',
  tip: 'Astuce',
}

export default function TutorialBubble({
  entry,
  kind,
  onClose,
  onDisable,
}: {
  entry: TutorialEntry
  kind: TutorialKind
  onClose: () => void
  onDisable: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <div className="kcd-panel font-pixel w-[340px] max-w-[90vw]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] uppercase tracking-wider text-[#8a6a2c]">
              {KIND_LABEL[kind]}
            </span>
          </div>
          <h2 className="font-med text-xl text-[#43310f] mb-1">{entry.title}</h2>
          <p className="font-read text-sm leading-relaxed text-[#4a361a]">{entry.body}</p>
          <button onClick={onClose} className="kcd-btn font-med text-base w-full mt-4 py-2">
            Compris !
          </button>
          <button
            onClick={onDisable}
            className="font-read block mx-auto mt-2 text-xs text-[#8a6a2c] underline underline-offset-2 hover:text-[#5a3d16]"
          >
            Ne plus afficher les conseils
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
