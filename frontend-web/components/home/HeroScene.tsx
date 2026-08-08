'use client'

// Décor d'accueil animé : l'image (carrée) est posée sur une "scène" carrée
// dimensionnée pour couvrir l'écran (max(100vw,100vh)) et centrée. Comme les
// calques animés sont ENFANTS de cette scène et positionnés en % , ils restent
// calés sur l'image quelle que soit la taille d'écran, et bougent avec le
// zoom/pan (Ken Burns) appliqué à la scène.
//
// Positions en % de l'image (repérées sur home-bg.jpg) — faciles à ajuster.
const GLOWS = [
    { x: 32, y: 55, s: 7.5, color: '255,150,60', dur: 3.4, delay: 0 },   // porte (grande lueur)
    { x: 28, y: 34, s: 3.6, color: '255,180,80', dur: 2.6, delay: 0.6 }, // fenêtre tour
    { x: 19.5, y: 35, s: 3.0, color: '255,180,80', dur: 3.1, delay: 1.2 },// fenêtre gauche
    { x: 24, y: 46, s: 3.2, color: '255,170,70', dur: 2.9, delay: 0.3 }, // fenêtre corps
    { x: 34, y: 42, s: 2.8, color: '255,190,90', dur: 3.6, delay: 0.9 }, // fenêtre droite
]

export default function HeroScene() {
    return (
        <div className="absolute inset-0 overflow-hidden">
            <div
                className="absolute top-1/2 left-1/2 kcd-kenburns"
                style={{
                    width: 'max(100vw, 100vh)',
                    height: 'max(100vw, 100vh)',
                    transform: 'translate(-50%, -50%)',
                }}
            >
                {/* Image de base */}
                <img
                    src="/home-bg.jpg"
                    alt=""
                    aria-hidden
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ imageRendering: 'pixelated' }}
                />

                {/* Halo du soleil (droite) qui respire */}
                <div
                    className="kcd-glow-spot"
                    style={{
                        left: '94%', top: '40%', width: '38%', height: '38%',
                        background: 'radial-gradient(circle, rgba(255,224,150,.85), rgba(255,180,90,.2) 45%, transparent 70%)',
                        animation: 'kcd-sun 6s ease-in-out infinite',
                    }}
                />

                {/* Lueurs vacillantes aux fenêtres / à la porte */}
                {GLOWS.map((g, i) => (
                    <div
                        key={i}
                        className="kcd-glow-spot"
                        style={{
                            left: `${g.x}%`, top: `${g.y}%`,
                            width: `${g.s}%`, height: `${g.s}%`,
                            background: `radial-gradient(circle, rgba(${g.color},.95), rgba(${g.color},.25) 40%, transparent 70%)`,
                            animation: `kcd-flicker ${g.dur}s ease-in-out ${g.delay}s infinite`,
                        }}
                    />
                ))}

                {/* Drapeau qui flotte, calé sur la tour principale. Recouvre le
                    drapeau peint pour éviter le doublon (ajuste left/top si besoin). */}
                <div className="absolute" style={{ left: '26.5%', top: '15%', width: '9%', height: '9%' }}>
                    <svg viewBox="0 0 40 40" className="w-full h-full overflow-visible" aria-hidden>
                        {/* mât */}
                        <rect x="7" y="6" width="1.6" height="20" fill="#2c2320" />
                        {/* fanion rouge qui ondule (morphing de tracé) */}
                        <path fill="#b23a2e" stroke="#7d241c" strokeWidth="0.6">
                            <animate
                                attributeName="d"
                                dur="1.5s"
                                repeatCount="indefinite"
                                values="
                                  M8.6,7 L26,6  L23,10 L27,13 L8.6,13 Z;
                                  M8.6,7 L27,9  L24,12 L27,16 L8.6,15 Z;
                                  M8.6,7 L26,6  L23,10 L27,13 L8.6,13 Z"
                            />
                        </path>
                    </svg>
                </div>

                {/* Nuages : légère dérive d'un voile clair en haut */}
                <div
                    className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
                    style={{
                        background: 'linear-gradient(180deg, rgba(255,230,210,.10), transparent 70%)',
                        animation: 'kcd-cloud 40s ease-in-out infinite alternate',
                    }}
                />
            </div>
        </div>
    )
}
