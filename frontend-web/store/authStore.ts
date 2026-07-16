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
    /**
     * Vrai une fois l'état relu depuis localStorage — la réhydratation de
     * `persist` est asynchrone : au tout premier rendu après un F5,
     * isAuthenticated vaut false NON PAS parce que l'utilisateur est déconnecté,
     * mais parce que la relecture n'a pas encore eu lieu. Toute redirection vers
     * l'écran de connexion doit attendre hasHydrated (voir app/game/page.tsx),
     * sinon chaque rechargement de page éjecte un utilisateur pourtant connecté.
     */
    hasHydrated: boolean
    setHasHydrated: (hydrated: boolean) => void
    setAuth: (token: string, player: Player) => void
    logout: () => void
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            token: null,
            player: null,
            isAuthenticated: false,
            hasHydrated: false,

            setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),

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
            // hasHydrated est un état de CYCLE DE VIE, pas une donnée : le
            // persister le figerait à true dans localStorage et il mentirait au
            // prochain chargement, avant toute relecture.
            partialize: (state) => ({
                token: state.token,
                player: state.player,
                isAuthenticated: state.isAuthenticated,
            }),
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true)
            },
        }
    )
)
