'use client'

// Plateau du multi coop rendu avec la MÊME scène Phaser que le solo (vrais
// sprites d'ennemis animés, tours, projectiles, impacts) — piloté par le flux de
// snapshots serveur au lieu d'une vague pré-calculée. Voir GameScene.pushCoopSnapshot.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import Phaser from 'phaser'
import { GameScene, type PlacementVerdict } from '@/components/game/GameScene'
import type { Snapshot } from '@/hooks/useCoop'

export interface CoopCanvasHandle {
    pushSnapshot: (snap: Snapshot) => void
}

interface CoopCanvasProps {
    onCellClick: (x: number, y: number) => void
    // Type de tour sélectionné → aperçu de pose (cercle de portée + case verte/rouge).
    selectedTower?: string | null
    // Map active de la partie (tracé + biome) — fixée avant le boot de la scène.
    mapId?: string | null
    // Règle de pose de la page (or disponible) → l'aperçu affiche le coût ou
    // « Or insuffisant », en plus des règles de terrain de la scène.
    placementValidator?: (type: string, x: number, y: number) => PlacementVerdict
}

const CoopCanvas = forwardRef<CoopCanvasHandle, CoopCanvasProps>(function CoopCanvas(
    { onCellClick, selectedTower = null, mapId = null, placementValidator },
    ref,
) {
    const gameRef = useRef<Phaser.Game | null>(null)
    const sceneRef = useRef<GameScene | null>(null)
    const readyRef = useRef(false)
    // Dernier snapshot reçu avant que la scène soit prête (create() est asynchrone).
    const pendingRef = useRef<Snapshot | null>(null)
    // Sélection courante, appliquée dès que la scène est prête (ordre de montage).
    const selectedRef = useRef(selectedTower)
    selectedRef.current = selectedTower
    // Tour posée sélectionnée (clic) : coins dorés + portée réelle sur le plateau.
    const [selectedTowerId, setSelectedTowerId] = useState<string | null>(null)

    useEffect(() => {
        if (gameRef.current) return

        const scene = new GameScene()
        if (mapId) scene.setActiveMap(mapId)   // AVANT le boot : bon terrain/décor
        // Survol d'une tour posée : éclaircie, cadre, portée (comme en solo).
        scene.setTowerInspect(true)
        // Outil de dev : ?perf=1 dans l'URL affiche fps / temps CPU par image.
        if (new URLSearchParams(window.location.search).has('perf')) scene.enablePerfOverlay()
        sceneRef.current = scene

        // Branché avant le boot : appelé en fin de create() (ou tout de suite si
        // la scène est déjà prête). Active le mode coop et vide le tampon.
        scene.setOnCoopReady(() => {
            readyRef.current = true
            scene.startCoop()
            scene.setBuildPreview(selectedRef.current ?? null)
            if (pendingRef.current) {
                const s = pendingRef.current
                pendingRef.current = null
                scene.pushCoopSnapshot(s.enemies, s.towers, s.shots)
            }
        })

        gameRef.current = new Phaser.Game({
            type: Phaser.AUTO,
            parent: 'coop-phaser-container',
            transparent: true, // la marge laisse transparaître le décor de la page
            scene: scene,
            pixelArt: true,
            scale: {
                mode: Phaser.Scale.FIT,
                // Centré verticalement mais CALÉ À GAUCHE : tout l'espace vide se
                // retrouve à droite, où vient se loger le chat (sans rogner le plateau).
                autoCenter: Phaser.Scale.CENTER_VERTICALLY,
                width: 800,
                height: 640,   // 20×16 cases (grille agrandie d'1 rangée tampon)
            },
        })

        return () => {
            gameRef.current?.destroy(true)
            gameRef.current = null
            readyRef.current = false
        }
    }, [])

    // Clic sur une tour posée : la sélectionne (re-clic = désélection) au lieu de
    // tenter une pose sur une case occupée ; ailleurs, désélectionne puis pose.
    useEffect(() => {
        sceneRef.current?.setOnCellClick((x, y) => {
            const tower = sceneRef.current?.getTowerAt(x, y)
            if (tower) {
                setSelectedTowerId((current) => (tower.type === 'WALL' || current === tower.id ? null : tower.id))
                return
            }
            setSelectedTowerId(null)
            onCellClick(x, y)
        })
    }, [onCellClick])

    useEffect(() => {
        sceneRef.current?.setSelectedTower(selectedTowerId)
    }, [selectedTowerId])

    useEffect(() => {
        sceneRef.current?.setPlacementValidator(placementValidator)
    }, [placementValidator])

    useEffect(() => {
        if (readyRef.current) sceneRef.current?.setBuildPreview(selectedTower)
    }, [selectedTower])

    useImperativeHandle(ref, () => ({
        pushSnapshot: (snap) => {
            if (readyRef.current) sceneRef.current?.pushCoopSnapshot(snap.enemies, snap.towers, snap.shots)
            else pendingRef.current = snap
        },
    }))

    return <div id="coop-phaser-container" className="w-full h-full" />
})

export default CoopCanvas
