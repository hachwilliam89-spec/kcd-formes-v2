/** Fortifications compactes, peintes une fois à la résolution native des sprites. */
export function paintCastle(ctx: CanvasRenderingContext2D, mapId: string, enemy: boolean) {
    const snow = mapId === 'fourche', spring = mapId === 'spring', autumn = mapId === 'autumn'
    const wall = snow ? '#939f9f' : spring ? '#c6b58e' : autumn ? '#a18a65' : '#c3a16b'
    const light = snow ? '#bcc8c5' : spring ? '#e4d4ae' : autumn ? '#c2aa7e' : '#e3c58b'
    const shade = snow ? '#626f74' : spring ? '#8c8868' : autumn ? '#746348' : '#917044'
    const roof = snow ? '#526b79' : spring ? '#597466' : autumn ? '#934f37' : '#856040'
    const flag = enemy ? '#b15b43' : '#66a4b0'
    const rect = (color: string, x: number, y: number, w: number, h: number) => {
        ctx.fillStyle = color; ctx.fillRect(x, y, w, h)
    }
    const masonry = (x: number, y: number, w: number, h: number) => {
        rect('#3d3b32', x - 2, y - 2, w + 4, h + 4)
        rect(wall, x, y, w, h); rect(light, x, y, 3, h); rect(shade, x + w - 6, y, 6, h)
        for (let row = 1; row < h / 8; row++) {
            rect(shade, x + 3, y + row * 8, w - 9, 1)
            for (let col = (row % 2) * 6; col < w - 7; col += 12) rect(shade, x + 3 + col, y + row * 8, 1, 7)
        }
    }
    const pitched = (x: number, y: number, w: number, h: number) => {
        for (let i = 0; i < h; i += 2) {
            const inset = Math.round((h - i) * w / (2 * h))
            rect(i % 6 === 0 ? '#3e4945' : roof, x + inset, y + i, w - inset * 2, 2)
        }
        rect('#343b34', x - 1, y + h, w + 2, 3)
        if (snow) {
            for (let i = 0; i < h - 2; i += 2) {
                const inset = Math.round((h - i) * w / (2 * h))
                rect('#e2e7d9', x + inset, y + i, Math.max(3, w - inset*2 - 7), 2)
            }
        }
    }
    // Socle et ombre, sans empiéter sur les cases voisines constructibles.
    rect('#29312866', 5, 100, 88, 10); rect(shade, 10, 94, 78, 10); rect(light, 12, 94, 74, 3)
    masonry(25, 46, 47, 49)
    if (spring || autumn) pitched(20, 23, 57, 26)
    else {
        masonry(29, 28, 39, 20)
        for (let x = 29; x < 68; x += 12) masonry(x, 22, 6, 8)
    }
    for (const x of [12, 67]) {
        masonry(x, 55, 20, 43)
        if (snow || spring || autumn) pitched(x - 4, 32, 28, 23)
        else for (let i = 0; i < 3; i++) masonry(x + i * 7, 48, 5, 9)
        rect('#37423d', x + 7, 65, 5, 12); rect(shade, x + 6, 78, 8, 2)
    }
    // Porte sombre, ferrures et fenêtres chaudes : lisibles à l'échelle du plateau.
    rect('#34372f', 39, 71, 20, 25); rect('#66513a', 42, 74, 14, 22)
    rect('#b2a075', 41, 81, 16, 2); rect('#b2a075', 41, 90, 16, 2); rect('#34372f', 48, 74, 2, 22)
    for (const x of [35, 56]) { rect('#454637', x, 55, 6, 9); rect('#d6b768', x + 1, 56, 3, 5) }
    rect('#4a4939', 49, 9, 2, 20); rect(flag, 51, 10, 16, 9); rect('#e3c989', 51, 10, 2, 9)
    if (spring) {
        rect('#63815a', 29, 80, 4, 16); rect('#63815a', 30, 75, 5, 7)
        rect('#e3b7a4', 30, 78, 3, 3); rect('#e3b7a4', 28, 88, 3, 3)
    }
    if (autumn) { rect('#9d7146', 16, 100, 18, 3); rect('#bd904d', 69, 102, 13, 2) }
}
