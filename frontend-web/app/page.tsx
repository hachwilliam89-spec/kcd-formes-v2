import Image from 'next/image'
import AuthForm from '@/components/auth/AuthForm'
import WarMap from '@/components/home/WarMap'

export default function HomePage() {
    return (
        <main className="ws-home font-pixel">
            <WarMap />
            {/* Le blason est épinglé sur le bout de la bannière du titre. */}
            <header className="ws-hero">
                <Image src="/brand/logo.webp" width={360} height={397} alt="" unoptimized preload className="ws-hero-crest" />
                <div className="ws-banner ws-hero-banner">
                    <h1 className="ws-hero-title">War Seasons</h1>
                    <p className="ws-hero-slogan">Défends ton royaume en tout temps, en tout lieu.</p>
                </div>
            </header>
            <div className="ws-gate">
                <AuthForm />
            </div>
        </main>
    )
}
