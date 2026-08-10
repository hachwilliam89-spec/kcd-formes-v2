'use client'

// Panneau de chat du multi (occupe la marge latérale sur écran large). Fil de
// messages + saisie. Voir MatchStompController /match/{id}/chat.
import { useEffect, useRef, useState } from 'react'

export type ChatMessage = { senderId: string; username: string; text: string; ts: number }

export function ChatPanel({
    messages, myId, onSend, className = '', onSkipTuto,
}: {
    messages: ChatMessage[]
    myId?: string
    onSend: (text: string) => void
    className?: string
    // Fourni tant que le tuto est en cours → affiche un bouton pour le couper.
    onSkipTuto?: () => void
}) {
    const [text, setText] = useState('')
    const listRef = useRef<HTMLDivElement>(null)

    // Défile en bas à chaque nouveau message.
    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
    }, [messages])

    const submit = () => {
        const t = text.trim()
        if (!t) return
        onSend(t)
        setText('')
    }

    return (
        <div className={`kcd-panel-titled flex flex-col min-h-0 ${className}`}>
            <div className="relative flex items-center justify-center mb-2 shrink-0">
                <h3 className="kcd-title font-med text-center text-base">Chat</h3>
                {onSkipTuto && (
                    <button onClick={onSkipTuto} className="absolute right-0 text-[11px] text-[#7a5320] hover:underline">
                        Passer le tuto ✕
                    </button>
                )}
            </div>
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 text-xs pr-1">
                {messages.length === 0 && (
                    <p className="text-[#8a6a2c] text-center italic mt-2">Aucun message pour l&apos;instant.</p>
                )}
                {messages.map((m, i) => {
                    // Messages du « Héraut » (tuto) : présentation distincte, comme un PNJ.
                    if (m.senderId === 'guide') {
                        return (
                            <div key={i} className="rounded px-2 py-1 my-0.5 text-[#5a3d16]" style={{ background: '#e6d6ab', borderLeft: '3px solid #b08a3c' }}>
                                <span className="font-semibold">📜 {m.username}</span>
                                <span> : {m.text}</span>
                            </div>
                        )
                    }
                    const mine = m.senderId === myId
                    return (
                        <div key={i} className={mine ? 'text-right' : ''}>
                            <span className="font-semibold text-[#7a5320]">{mine ? 'Toi' : m.username}</span>
                            <span className="text-[#43310f]"> : {m.text}</span>
                        </div>
                    )
                })}
            </div>
            <div className="flex gap-1 mt-2 shrink-0">
                <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                    maxLength={300}
                    placeholder="Message…"
                    className="flex-1 min-w-0 px-2 py-1 rounded bg-[#f5e8c6] text-[#43310f] text-xs"
                />
                <button onClick={submit} className="kcd-btn text-xs px-3" aria-label="Envoyer">→</button>
            </div>
        </div>
    )
}
