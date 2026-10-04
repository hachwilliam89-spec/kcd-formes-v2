// Contenu et persistance du tutoriel contextuel (bulles BD).
// - Ennemis : conseil affiché à la 1re apparition de chaque type pendant une vague.
// - Tours : conseil affiché à la 1re sélection de chaque type.
// - Astuces : fonctionnalités d'interface, chacune au moment où elle sert.
// Persistance : localStorage, clé par pseudo (= "par compte" sur ce navigateur).
// Le joueur peut couper toutes les bulles (setTutorialEnabled) et les revoir
// depuis le début (resetTutorial).

export type TutorialEntry = {
  title: string
  body: string
  icon?: string // chemin d'icône pixel optionnel (public/sprites/ui)
}

import { HAIL_DAMAGE_BONUS } from './seasons'

export type TutorialKind = 'enemy' | 'tower' | 'tip'

// clé = type d'ennemi (voir EnemyType backend / SPRITE_ENEMY_TYPES).
export const ENEMY_TUTORIAL: Record<string, TutorialEntry> = {
  GOBLIN: {
    title: 'Gobelin',
    body: "Piétaille rapide et fragile. Peu de PV : n'importe quelle tour l'abat. Le vrai danger, c'est le nombre — prévois du dégât de zone.",
  },
  ORC: {
    title: 'Orc',
    body: 'Plus résistant que le gobelin et avance en groupe. Rien de spécial, mais il encaisse : concentre le feu pour ne pas te faire déborder.',
  },
  TROLL: {
    title: 'Troll',
    body: 'Grosse brute blindée et lente. Les archers peinent contre son armure — la Baliste (perce-blindage) le déchire en deux tirs.',
  },
  SAPEUR: {
    title: 'Sapeur',
    body: "Il ne vise PAS le château : il s'en prend à tes TOURS et les détruit. Barre-lui la route avec des murs et garde des tours de rechange.",
  },
  CHARIOT: {
    title: 'Démon de givre',
    body: "Créature glaciale qui frappe à DISTANCE : elle canarde tes tours en continu tout en avançant, sans jamais s'arrêter. Détruis-la vite, ou éloigne tes tours de sa ligne de tir.",
  },
  DARK_KNIGHT: {
    title: 'Chevalier noir',
    body: "Armure enchantée : SEUL le Mage le blesse ! Les tours physiques ricochent (il sert de leurre). Garde toujours un Mage à portée du chemin.",
  },
  BOSS_WARLORD: {
    title: 'Seigneur de guerre',
    body: 'Le boss : PV énormes, un rayon qui étourdit tes tours, et il renforce son escorte. Concentre tout dessus, Baliste en tête.',
  },
}

// clé = type de tour (voir TowerType backend).
export const TOWER_TUTORIAL: Record<string, TutorialEntry> = {
  ARCHER: {
    title: 'Archer',
    body: 'Tour de base, bon marché et à cadence rapide. Polyvalente contre la piétaille. Dégâts modestes par tir : la quantité fait la force.',
  },
  MAGE: {
    title: 'Mage',
    body: 'Rayon magique continu. SEULE tour capable de blesser le Chevalier noir. Portée courte : colle-la au chemin pour un maximum de temps de tir.',
  },
  CATAPULT: {
    title: 'Catapulte',
    body: "Dégâts de ZONE : un tir touche tous les ennemis autour de l'impact. Lente mais dévastatrice sur les groupes serrés.",
  },
  BALLISTA: {
    title: 'Baliste',
    body: 'Perce-blindage : dégâts doublés contre les grosses cibles (Troll, Démon de givre, Chevalier noir, Boss). Chère et lente — ton arme anti-élite.',
  },
  WALL: {
    title: 'Mur-barrage',
    body: "Seule structure posée SUR le chemin : les ennemis doivent la détruire pour passer. Crée des bouchons sous tes tours. Max 6 murs.",
  },
}

// Astuces d'interface — clé = moment de déclenchement (voir game/page.tsx).
export const FEATURE_TUTORIAL: Record<string, TutorialEntry> = {
  // À l'arrivée sur le plateau.
  build: {
    title: 'Construire',
    body: "Choisis une tour dans la barre du bas (ou touches 1 à 5), puis survole le terrain : la silhouette montre l'emplacement, le cercle la portée, l'étiquette le coût — ou pourquoi c'est impossible. Échap annule la pose.",
  },
  // Après la 1re tour posée.
  inspect: {
    title: 'Tes tours',
    body: 'Survole une tour pour voir sa portée. Clique-la pour la sélectionner : coins dorés sur le plateau, et sa fiche dans le panneau pour l’améliorer ou choisir sa cible.',
  },
  // À la 1re sélection d'une tour.
  upgrade: {
    title: 'Améliorer et cibler',
    body: 'Chaque niveau (3 max) augmente dégâts, portée et solidité. La priorité de tir choisit l’ennemi visé : le plus proche, le plus avancé ou le plus solide. Échap ferme la fiche.',
  },
  // Cartes saisonnières : à l'arrivée sur la carte, puis à la 1re annonce de chaque
  // phénomène. Pas de bandeau permanent : le joueur attentif lit le plateau.
  spring: {
    title: 'Les Jardins éveillés',
    body: 'Le château est au cœur du lac : tous les ennemis finissent sur ses deux ponts. Les berges (roseaux, vaguelette) se construisent mais sont inondables : aux vagues 3, 6, 9…, la crue en noie une partie, et leurs tours ne tirent plus pendant la vague. Le côté noyé change à chaque crue.',
  },
  flood: {
    title: 'Crue annoncée',
    body: 'La bruine annonce la crue : les berges qui clignotent seront sous l’eau à la prochaine vague, et leurs tours ne tireront pas. Ne compte pas sur elles cette fois-ci.',
  },
  hail: {
    title: 'Grêle annoncée',
    body: `Des grêlons tombent : la prochaine vague sera grêlée. Armures cabossées, les ennemis subiront +${HAIL_DAMAGE_BONUS} % de dégâts. C’est le moment d’être agressif.`,
  },
  autumn: {
    title: 'Le Val des feuilles',
    body: 'Un raccourci coupe le serpentin. La boue brune ralentit les ennemis (pas les Trolls ni les boss) : couvre-la bien. La brume blanche coûte 1 case de portée aux tours qu’elle recouvre. Les deux changent de place à chaque vague — une averse annonce le changement : regarde le plateau avant de lancer la vague.',
  },
  // À la fin de la 1re vague.
  combat: {
    title: 'Pendant les vagues',
    body: 'Tu peux cliquer une tour en plein combat pour suivre ses PV et sa portée. Construction, amélioration et ciblage attendent la fin de la vague.',
  },
}

const storageKey = (username: string) => `kcd_tuto_seen_${username || 'invite'}`
const disabledKey = (username: string) => `kcd_tuto_off_${username || 'invite'}`

/** Bulles de conseils actives pour ce compte (activées par défaut). */
export function isTutorialEnabled(username: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(disabledKey(username)) !== '1'
  } catch {
    return true
  }
}

/** Active / coupe toutes les bulles (ennemis, tours, astuces) pour ce compte. */
export function setTutorialEnabled(username: string, enabled: boolean) {
  if (typeof window === 'undefined') return
  try {
    if (enabled) window.localStorage.removeItem(disabledKey(username))
    else window.localStorage.setItem(disabledKey(username), '1')
  } catch {
    /* quota / mode privé : le réglage ne survivra simplement pas au rechargement */
  }
}

/** Ensemble des clés de tuto déjà vues par ce compte (sur ce navigateur). */
export function getSeenTutorials(username: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(storageKey(username))
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

/** Marque une clé comme vue (persisté). */
export function markTutorialSeen(username: string, key: string) {
  if (typeof window === 'undefined') return
  const seen = getSeenTutorials(username)
  seen.add(key)
  try {
    window.localStorage.setItem(storageKey(username), JSON.stringify([...seen]))
  } catch {
    /* quota / mode privé : on ignore, le tuto se réaffichera simplement */
  }
}

/** Réinitialise le tuto pour ce compte (bouton "Revoir le tuto"). */
export function resetTutorial(username: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey(username))
  } catch {
    /* ignore */
  }
}
