// Contenu et persistance du tutoriel contextuel (bulles BD).
// - Ennemis : conseil affiché à la 1re apparition de chaque type pendant une vague.
// - Tours : conseil affiché à la 1re pose de chaque type.
// Persistance : localStorage, clé par pseudo (= "par compte" sur ce navigateur).
// Un bouton "Revoir le tuto" réinitialise l'ensemble (voir resetTutorial).

export type TutorialEntry = {
  title: string
  body: string
  icon?: string // chemin d'icône pixel optionnel (public/sprites/ui)
}

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

const storageKey = (username: string) => `kcd_tuto_seen_${username || 'invite'}`

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
