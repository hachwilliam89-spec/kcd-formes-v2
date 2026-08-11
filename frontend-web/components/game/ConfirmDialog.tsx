'use client'

// Modale de confirmation au thème du jeu (remplace window.confirm natif).
// Overlay sombre + panneau bois. Fermeture au clic sur le fond ou « Annuler ».
export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirmer',
    cancelLabel = 'Annuler',
    danger = false,
    onConfirm,
    onCancel,
}: {
    open: boolean
    title?: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    onConfirm: () => void
    onCancel: () => void
}) {
    if (!open) return null
    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4 font-pixel"
            onClick={onCancel}
        >
            <div
                className="kcd-panel-wood w-full max-w-sm p-5 text-center"
                onClick={(e) => e.stopPropagation()}
            >
                {title && (
                    <h3 className="text-xl font-med text-yellow-300 mb-2" style={{ textShadow: '2px 2px 0 #2f1c0d' }}>
                        {title}
                    </h3>
                )}
                <p className="text-[#f0e2c4] text-sm leading-relaxed mb-5">{message}</p>
                <div className="flex gap-3 justify-center">
                    <button onClick={onCancel} className="kcd-btn kcd-btn--nav text-sm py-2 px-4">
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`kcd-btn text-sm py-2 px-4 ${danger ? 'kcd-btn--danger' : ''}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
