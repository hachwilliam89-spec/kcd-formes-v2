import Image from 'next/image'

// Marque des en-têtes : le blason aux quatre saisons collé au nom, et le mode de
// jeu à part, sur sa propre plaque.
export default function Brand({ mode }: { mode?: 'Solo' | 'Coop' | 'Versus' }) {
    return (
        <span className="ws-brand">
            <span className="ws-brand-mark">
                <Image src="/brand/logo.webp" width={360} height={397} alt="" unoptimized className="ws-crest" />
                <span className="ws-banner ws-wordmark" aria-hidden="true">War Seasons</span>
            </span>
            {mode && <span className="ws-brand-mode" aria-hidden="true">{mode}</span>}
            <span className="sr-only">War Seasons{mode ? ` — ${mode}` : ''}</span>
        </span>
    )
}
