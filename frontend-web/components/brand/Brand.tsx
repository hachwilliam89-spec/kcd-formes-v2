import Image from 'next/image'

// Marque compacte des en-têtes : le blason aux quatre saisons (pixel art détouré,
// public/brand/logo.webp) et « War Seasons » sur la bannière rouge du pack d'interface.
export default function Brand() {
    return (
        <span className="ws-brand">
            <Image src="/brand/logo.webp" width={360} height={416} alt="" unoptimized className="ws-crest" />
            <span className="ws-banner ws-wordmark" aria-hidden="true">War Seasons</span>
            <span className="sr-only">4 War Seasons</span>
        </span>
    )
}
