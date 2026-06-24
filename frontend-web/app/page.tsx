import AuthForm from '@/components/auth/AuthForm'

export default function HomePage() {
  return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800 p-4">
        <div className="mb-8 text-center">
          <h1 className="text-5xl font-bold text-white mb-2">
            KCD Formes
          </h1>
          <p className="text-slate-400 text-lg">
            Tower Defense — Fantastique Médiéval
          </p>
        </div>
        <AuthForm />
      </main>
  )
}