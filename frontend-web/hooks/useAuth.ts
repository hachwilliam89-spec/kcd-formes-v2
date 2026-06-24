import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { login, register } from '@/lib/auth'

export function useAuth() {
    const router = useRouter()
    const { setAuth, logout, isAuthenticated, player } = useAuthStore()

    async function handleLogin(username: string, password: string) {
        const data = await login(username, password)
        setAuth(data.token, { playerId: data.playerId, username: data.username })
        router.push('/game')
    }

    async function handleRegister(username: string, email: string, password: string) {
        const data = await register(username, email, password)
        setAuth(data.token, { playerId: data.playerId, username: data.username })
        router.push('/game')
    }

    function handleLogout() {
        logout()
        router.push('/')
    }

    return { handleLogin, handleRegister, handleLogout, isAuthenticated, player }
}