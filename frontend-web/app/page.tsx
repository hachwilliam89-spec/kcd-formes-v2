import AuthForm from '@/components/auth/AuthForm'
import EmberField from '@/components/home/EmberField'
import HeroScene from '@/components/home/HeroScene'

export default function HomePage() {
    return (
        <main className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center p-4 font-pixel bg-[#0d0906]">
            {/* Fond héros animé : Ken Burns + lueurs aux fenêtres + drapeau + soleil. */}
            <HeroScene />

            {/* Voile sombre + vignettage pour la lisibilité et le côté cinématique. */}
            <div className="absolute inset-0 bg-black/45" />
            <div
                className="absolute inset-0"
                style={{ boxShadow: 'inset 0 0 220px 60px rgba(0,0,0,.85)' }}
            />

            {/* Braises qui montent + brume au sol. */}
            <EmberField />
            <div className="absolute inset-x-0 bottom-0 h-1/3 kcd-fog pointer-events-none" />

            {/* Titre */}
            <div className="relative text-center mb-6 kcd-rise">
                <div className="kcd-title-float">
                    <h1
                        className="font-med text-6xl md:text-8xl text-yellow-400 kcd-title-glow relative inline-block"
                        style={{ textShadow: '3px 3px 0 #2f1c0d, 6px 6px 0 rgba(0,0,0,.55)' }}
                    >
                        KCD Formes
                        {/* Reflet qui balaie le titre (superposé au texte). */}
                        <span className="kcd-shine absolute inset-0" aria-hidden>KCD Formes</span>
                    </h1>
                </div>
                <p
                    className="font-med text-lg md:text-2xl text-[#f0e2c4] mt-3 tracking-wide"
                    style={{ textShadow: '2px 2px 0 rgba(0,0,0,.6)' }}
                >
                    Combien de vagues tiendras-tu ?
                </p>
            </div>

            {/* Connexion / inscription */}
            <div className="relative kcd-rise-2">
                <AuthForm />
                <p className="text-center text-[#e9d9b0] text-xs mt-3 kcd-pulse" style={{ textShadow: '1px 1px 0 rgba(0,0,0,.6)' }}>
                    ⚔ Défends ton château — clique pour commencer
                </p>
            </div>
        </main>
    )
}
