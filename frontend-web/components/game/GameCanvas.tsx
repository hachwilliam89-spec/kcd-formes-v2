'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import Phaser from 'phaser'
import { GameScene, TowerData, TickSnapshot } from './GameScene'

interface GameCanvasProps {
    towers: TowerData[]
    onCellClick: (x: number, y: number) => void
    // Type de tour sélectionné → aperçu de pose (case verte/rouge + cercle de
    // portée) qui suit le curseur. null = aucun aperçu (ex. pendant le combat).
    selectedTower?: string | null
    // Map active (tracé + biome). Changer de map = remonter le canvas (key côté page).
    mapId?: string | null
}

export interface GameCanvasHandle {
    playWave: (
        ticks: TickSnapshot[],
        onTick?: (castleHp: number) => void,
        onComplete?: () => void,
        unseenEnemyTypes?: Set<string>,
        onNeedTutorial?: (type: string) => void,
    ) => void
    resumeWave: () => void
}

const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(function GameCanvas(
    { towers, onCellClick, selectedTower = null, mapId = null },
    ref
) {
    const gameRef = useRef<Phaser.Game | null>(null)
    const sceneRef = useRef<GameScene | null>(null)

    useEffect(() => {
        if (gameRef.current) return

        const scene = new GameScene()
        if (mapId) scene.setActiveMap(mapId)   // AVANT le boot : create() rend la bonne map
        sceneRef.current = scene

        gameRef.current = new Phaser.Game({
            type: Phaser.AUTO,
            parent: 'phaser-container',
            backgroundColor: '#0f172a',
            scene: scene,
            pixelArt: true, // scaling au plus proche voisin : sprites nets même redimensionnés
            // Responsive : le jeu est rendu en 800×600 puis MIS À L'ÉCHELLE pour
            // remplir le conteneur en gardant le ratio (Phaser convertit tout seul
            // les coordonnées de pointeur → pas de changement dans handleCellClick).
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH,
                width: 800,
                height: 640,   // 20×16 cases (grille agrandie d'1 rangée tampon)
            },
        })

        return () => {
            gameRef.current?.destroy(true)
            gameRef.current = null
        }
    }, [])

    // Ré-attache le callback à chaque changement : sinon le scene Phaser garde
    // pour toujours la closure du tout premier rendu (donc le tower type
    // sélectionné au montage, ex. 'ARCHER'), peu importe ce que l'utilisateur
    // choisit ensuite dans le panneau — d'où des tours posées avec le mauvais
    // type/coût/portée à chaque clic sur la grille.
    useEffect(() => {
        if (!sceneRef.current) return
        sceneRef.current.setOnCellClick(onCellClick)
    }, [onCellClick])

    useEffect(() => {
        if (sceneRef.current) {
            sceneRef.current.drawTowers(towers)
        }
    }, [towers])

    // Aperçu de pose : suit le type sélectionné (null pendant le combat → masqué).
    useEffect(() => {
        sceneRef.current?.setBuildPreview(selectedTower)
    }, [selectedTower])

    useImperativeHandle(ref, () => ({
        playWave: (ticks, onTick, onComplete, unseenEnemyTypes, onNeedTutorial) => {
            // Scène indisponible (ex. remontage à chaud en dev) : signaler quand
            // même la fin, sinon l'appelant attend un onComplete qui ne viendra
            // jamais et l'UI reste verrouillée en "combat en cours" (voir
            // handleStartWave) — le résultat de la vague, lui, est déjà acquis
            // côté serveur.
            if (!sceneRef.current) {
                onComplete?.()
                return
            }
            sceneRef.current.playWave(ticks, onTick, onComplete, unseenEnemyTypes, onNeedTutorial)
        },
        resumeWave: () => sceneRef.current?.resumeWave(),
    }))

    return <div id="phaser-container" className="w-full h-full" />
})

export default GameCanvas
