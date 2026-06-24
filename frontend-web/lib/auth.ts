import api from './api'
import { useAuthStore } from '@/store/authStore'

interface AuthResponse {
    token: string
    playerId: string
    username: string
}

export async function register(
    username: string,
    email: string,
    password: string
): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/api/v1/auth/register', {
        username,
        email,
        password,
    })
    return data
}

export async function login(
    username: string,
    password: string
): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/api/v1/auth/login', {
        username,
        password,
    })
    return data
}