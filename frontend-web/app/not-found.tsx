import Link from 'next/link'

// Page 404 personnalisée (Next.js app router) — au thème du jeu, cohérente avec l'accueil.
export default function NotFound() {
    return (
        <main className="relative min-h-screen overflow-hidden flex items-center justify-center p-4 font-pixel bg-[#0d0906] text-[#f0e2c4]">
            <div
                className="absolute inset-0 opacity-70"
                style={{ backgroundImage: "url('/home-bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
            />
            <div className="absolute inset-0 bg-[#160f08]/80" />

            <div className="relative z-10 kcd-panel-wood w-full max-w-md p-6 md:p-8 text-center flex flex-col items-center gap-4">
                <h1 className="text-6xl md:text-7xl font-med text-yellow-400" style={{ textShadow: '3px 3px 0 #2f1c0d' }}>
                    404
                </h1>
                <p className="text-lg font-med">Cette contrée n&apos;existe pas</p>
                <p className="text-sm text-[#e9d9b0] leading-relaxed">
                    La page que tu cherches s&apos;est perdue dans les brumes. Regagne le château avant que les gobelins ne te trouvent.
                </p>
                <Link href="/" className="kcd-btn font-med text-lg py-2.5 px-6 mt-1">
                    ← Retour au château
                </Link>
            </div>
        </main>
    )
}
