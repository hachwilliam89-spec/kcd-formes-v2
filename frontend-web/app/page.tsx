import AuthForm from '@/components/auth/AuthForm'

export default function HomePage() {
  return (
    <main
      className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center p-4 font-pixel"
      style={{
        backgroundImage: "url('/home-bg.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        imageRendering: 'pixelated',
      }}
    >
      {/* Voile sombre pour la lisibilité du titre et de la carte par-dessus le fond. */}
      <div className="absolute inset-0 bg-black/45" />

      {/* Titre */}
      <div className="relative text-center mb-6">
        <h1
          className="font-med text-6xl md:text-7xl text-yellow-400"
          style={{ textShadow: '3px 3px 0 #2f1c0d, 6px 6px 0 rgba(0,0,0,.55)' }}
        >
          KCD Formes
        </h1>
        <p
          className="font-med text-lg md:text-xl text-[#f0e2c4] mt-2 tracking-wide"
          style={{ textShadow: '2px 2px 0 rgba(0,0,0,.6)' }}
        >
          Combien de vagues tiendras-tu ?
        </p>
      </div>

      {/* Connexion / inscription */}
      <div className="relative">
        <AuthForm />
      </div>
    </main>
  )
}
