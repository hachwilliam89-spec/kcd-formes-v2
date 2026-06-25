'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import Phaser from 'phaser'
import { GameScene, TowerData, TickSnapshot } from './GameScene'

interface GameCanvasProps {
    towers: TowerData[]
    onCellClick: (x: number, y: number) => void
}

export interface GameCanvasHandle {
    playWave: (
        ticks: TickSnapshot[],
        onTick?: (castleHp: number) => void,
        onComplete?: () => void
    ) => void
}

const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(function GameCanvas(
    { towers, onCellClick },
    ref
) {
    const gameRef = useRef<Phaser.Game | null>(null)
    const sceneRef = useRef<GameScene | null>(null)

    useEffect(() => {
        if (gameRef.current) return

        const scene = new GameScene()
        sceneRef.current = scene

        gameRef.current = new Phaser.Game({
            type: Phaser.AUTO,
            width: 800,
            height: 600,
            parent: 'phaser-container',
            backgroundColor: '#0f172a',
            scene: scene,
        })

        setTimeout(() => {
            scene.setOnCellClick(onCellClick)
        }, 500)

        return () => {
            gameRef.current?.destroy(true)
            gameRef.current = null
        }
    }, [])

    useEffect(() => {
        if (sceneRef.current) {
            sceneRef.current.drawTowers(towers)
        }
    }, [towers])

    useImperativeHandle(ref, () => ({
        playWave: (ticks, onTick, onComplete) => {
            sceneRef.current?.playWave(ticks, onTick, onComplete)
        },
    }))

    return <div id="phaser-container" />
})

export default GameCanvas
