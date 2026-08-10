// Petites icônes d'unité pour les boutons de l'UI multi : le vrai sprite plutôt
// qu'une pastille de couleur (bien plus lisible). Les tours ont une image unique ;
// les ennemis sont des spritesheets horizontales (32 frames de 96px, voir
// enemies/manifest.json) dont on cadre la 1re frame par background-size/position.

const ENEMY_FRAMES = 32

export function TowerIcon({ type, size = 24 }: { type: string; size?: number }) {
    return (
        <img
            src={`/sprites/towers/${type}.png`}
            alt=""
            aria-hidden
            style={{ width: size, height: size, objectFit: 'contain', imageRendering: 'pixelated', flex: 'none' }}
        />
    )
}

export function EnemyIcon({ type, size = 24 }: { type: string; size?: number }) {
    return (
        <span
            aria-hidden
            style={{
                width: size,
                height: size,
                display: 'inline-block',
                flex: 'none',
                backgroundImage: `url(/sprites/enemies/${type}.png)`,
                backgroundSize: `${ENEMY_FRAMES * size}px ${size}px`, // toute la planche mise à l'échelle → 1 frame = size
                backgroundPosition: '0 0',                              // frame 0 (pose de marche)
                backgroundRepeat: 'no-repeat',
                imageRendering: 'pixelated',
            }}
        />
    )
}
