'use client'

// Plateau du multi coop rendu avec la MÊME scène Phaser que le solo (vrais
// sprites d'ennemis animés, tours, projectiles, impacts) — piloté par le flux de
// snapshots serveur au lieu d'une vague pré-calculée. Voir GameScene.pushCoopSnapshot.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import Phaser from 'phaser'
import { GameScene } from '@/components/game/GameScene'
import type { Snapshot } from '@/hooks/useCoop'

export interface CoopCanvasHandle {
    pushSnapshot: (snap: Snapshot) => void
}

interface CoopCanvasProps {
    onCellClick: (x: number, y: number) => void
}

const CoopCanvas = forwardRef<CoopCanvasHandle, CoopCanvasProps>(function CoopCanvas(
    { onCellClick },
    ref,
) {
    const gameRef = useRef<Phaser.Game | null>(null)
    const sceneRef = useRef<GameScene | null>(null)
    const readyRef = useRef(false)
    // Dernier snapshot reçu avant que la scène soit prête (create() est asynchrone).
    const pendingRef = useRef<Snapshot | null>(null)

    useEffect(() => {
        if (gameRef.current) return

        const scene = new GameScene()
        sceneRef.current = scene

        // Branché avant le boot : appelé en fin de create() (ou tout de suite si
        // la scène est déjà prête). Active le mode coop et vide le tampon.
        scene.setOnCoopReady(() => {
            readyRef.current = true
            scene.startCoop()
            if (pendingRef.current) {
                const s = pendingRef.current
                pendingRef.current = null
                scene.pushCoopSnapshot(s.enemies, s.towers, s.shots)
            }
        })

        gameRef.current = new Phaser.Game({
            type: Phaser.AUTO,
            parent: 'coop-phaser-container',
            backgroundColor: '#0f172a',
            scene: scene,
            pixelArt: true,
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH,
                width: 800,
                height: 600,
            },
        })

        return () => {
            gameRef.current?.destroy(true)
            gameRef.current = null
            readyRef.current = false
        }
    }, [])

    useEffect(() => {
        sceneRef.current?.setOnCellClick(onCellClick)
    }, [onCellClick])

    useImperativeHandle(ref, () => ({
        pushSnapshot: (snap) => {
            if (readyRef.current) sceneRef.current?.pushCoopSnapshot(snap.enemies, snap.towers, snap.shots)
            else pendingRef.current = snap
        },
    }))

    return <div id="coop-phaser-container" className="w-full h-full" />
})

export default CoopCanvas
