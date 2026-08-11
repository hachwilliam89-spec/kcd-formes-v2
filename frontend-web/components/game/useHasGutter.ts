import { useCallback, useRef, useState } from 'react'

// Le plateau est en 4:3 : sur un conteneur plus large que 4:3, il reste une marge
// horizontale à côté. Ce hook mesure cette marge (en px) pour qu'on puisse y loger
// des panneaux (chat, adversaire…) SANS jamais rogner le plateau — la grille reste
// prioritaire, on ne remplit que l'espace réellement disponible.
//
// Ref CALLBACK (et pas useRef) : l'élément mesuré n'existe qu'une fois la partie
// lancée (pas dans le lobby). La ref callback attache le ResizeObserver au moment
// exact où le nœud apparaît — un useEffect au montage arriverait trop tôt.
export function useHasGutter() {
    const [gutter, setGutter] = useState(0)
    const roRef = useRef<ResizeObserver | null>(null)

    const ref = useCallback((el: HTMLDivElement | null) => {
        roRef.current?.disconnect()
        if (!el) { setGutter(0); return }
        const check = () => {
            const w = el.clientWidth
            const h = el.clientHeight
            const boardW = Math.min(w, (h * 5) / 4) // largeur du plateau calé sur la hauteur (20:16 = 5:4)
            setGutter(Math.max(0, w - boardW))
        }
        check()
        const ro = new ResizeObserver(check)
        ro.observe(el)
        roRef.current = ro
    }, [])

    return { ref, gutter }
}
