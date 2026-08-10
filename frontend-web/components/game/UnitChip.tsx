// Tuile d'unité de la barre d'action (façon toolbar de TD : Bloons/Kingdom Rush).
// Gros sprite dans une case sombre en haut, coût avec la pièce en bas, sélection
// illuminée. income = petit badge « +N » (envois). affordable=false → coût en rouge.
// disabled → non cliquable + estompé (envoi trop cher). Une tour trop chère reste
// cliquable (coût rouge) pour pouvoir la sélectionner et voir sa portée.
import type { ReactNode } from 'react'

export function UnitChip({
    icon, label, cost, income, affordable = true, selected, disabled, onClick, title,
}: {
    icon: ReactNode
    label: string
    cost: number
    income?: number
    affordable?: boolean
    selected?: boolean
    disabled?: boolean
    onClick: () => void
    title?: string
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            aria-label={label}
            className={`relative flex flex-col items-center w-[54px] rounded-md border overflow-hidden transition-transform active:scale-95 hover:brightness-110 ${
                selected ? 'border-yellow-400' : 'border-[#6b4a24]'
            } ${disabled ? 'opacity-45' : ''}`}
            style={{ boxShadow: selected ? '0 0 0 2px #f2c94c, 0 2px 5px rgba(0,0,0,.45)' : '0 2px 3px rgba(0,0,0,.4)' }}
        >
            <span
                className="relative w-full h-[42px] flex items-center justify-center"
                style={{ background: 'radial-gradient(circle at 50% 35%, #3c2d16, #201709)' }}
            >
                {icon}
                {income != null && (
                    <span
                        className="absolute top-0.5 right-0.5 text-[10px] font-med text-green-300 leading-none px-1 rounded-sm"
                        style={{ background: 'rgba(0,0,0,.55)' }}
                    >
                        +{income}
                    </span>
                )}
            </span>
            <span
                className="w-full flex items-center justify-center gap-1 py-[3px]"
                style={{ background: '#e0cf9e', borderTop: '1px solid #6b4a24' }}
            >
                <img src="/sprites/ui/icon_gold.png" alt="" aria-hidden style={{ height: 13, imageRendering: 'pixelated' }} />
                <span className={`font-med text-sm leading-none ${affordable ? 'text-[#43310f]' : 'text-red-700'}`}>{cost}</span>
            </span>
        </button>
    )
}
