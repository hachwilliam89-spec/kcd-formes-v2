import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Player {
    playerId: string
    username: string
}

interface AuthState {
    token: string | null
    player: Player | null
    isAuthenticated: boolean
    setAuth: (token: string, player: Player) => void
    logout: () => void
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            token: null,
            player: null,
            isAuthenticated: false,

            setAuth: (token, player) => {
                localStorage.setItem('token', token)
                set({ token, player, isAuthenticated: true })
            },

            logout: () => {
                localStorage.removeItem('token')
                set({ token: null, player: null, isAuthenticated: false })
            },
        }),
        {
            name: 'auth-storage', // clé dans localStorage
        }
    )
)