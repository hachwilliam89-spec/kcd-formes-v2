/** Pixel-art natif : palais protecteurs et brèches corrompues propres aux biomes. */
export const FORT_WIDTH = 144
export const FORT_HEIGHT = 176
export const PORTAL_FRAMES = 32
export function paintCastle(ctx: CanvasRenderingContext2D, mapId: string, enemy: boolean, phase = 0) {
    const ice = mapId === 'fourche', forest = mapId === 'spring', autumn = mapId === 'autumn'
    const wall = ice ? '#90bacb' : forest ? '#b4c6ad' : autumn ? '#77748d' : '#cfa773'
    const light = ice ? '#e3f6f5' : forest ? '#e2e5be' : autumn ? '#b2a8b7' : '#ffe0a0'
    const shade = ice ? '#496b93' : forest ? '#526e64' : autumn ? '#454256' : '#89604c'
    const roof = ice ? '#458fb0' : forest ? '#387c69' : autumn ? '#41445f' : '#369298'
    const magic = enemy ? (ice ? '#ba88ff' : forest ? '#c3ea66' : autumn ? '#df81f7' : '#ff785c')
        : ice ? '#b5f9ff' : forest ? '#99f2c9' : autumn ? '#bda4ff' : '#83f0ee'
    const r = (c: string, x: number, y: number, w: number, h: number) => {
        ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    }
    const poly = (c: string, pts: number[][]) => {
        ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.fill()
    }
    const gem = (x: number, y: number, size: number) => {
        poly(shade, [[x,y-size-2],[x+size+2,y],[x,y+size+2],[x-size-2,y]])
        poly(magic, [[x,y-size],[x+size,y],[x,y+size],[x-size,y]])
        poly('#f1ffff', [[x,y-size],[x,y+2],[x-size,y]])
    }
    const block = (x: number, y: number, w: number, h: number) => {
        r('#292a3c',x-2,y-2,w+4,h+4); r(wall,x,y,w,h)
        r(light,x,y,3,h); r(shade,x+w-6,y,6,h)
        for (let yy=y+7;yy<y+h;yy+=8) {
            r(shade,x+3,yy,w-9,1)
            for(let xx=x+7+((yy-y)%16 ? 0 : 6);xx<x+w-6;xx+=13) r(shade,xx,yy-6,1,6)
        }
    }
    const spire = (x: number, y: number, w: number, h: number) => {
        poly('#292a3c',[[x-3,y+h+3],[x+w/2,y-3],[x+w+3,y+h+3]])
        poly(roof,[[x,y+h],[x+w/2,y],[x+w,y+h]])
        poly(ice ? '#d5f4f5' : forest ? '#73b79a' : autumn ? '#73748c' : '#83cbbe',[[x,y+h],[x+w/2,y],[x+w/2-3,y+h]])
        for(let yy=y+8;yy<y+h;yy+=7) {
            const inset=(y+h-yy)*w/(2*h); r(shade,x+inset,yy,w-2*inset,2)
        }
        r(light,x-3,y+h,w+6,3)
    }
    const window = (x: number, y: number, h = 12) => {
        r(shade,x-2,y-2,9,h+4); r('#242c40',x,y,5,h)
        r(magic,x+1,y+2,3,h-3); r(light,x-2,y+h+1,9,2)
    }
    ctx.imageSmoothingEnabled = false
    r('#16243133',10,157,124,10); r('#16243155',20,158,104,6)
    if (enemy) {
        const dark = ice ? '#343751' : forest ? '#354437' : autumn ? '#373044' : '#513a39'
        poly('#201e30',[[26,154],[31,69],[48,39],[69,28],[95,43],[114,76],[119,154]])
        poly(magic+'55',[[39,150],[40,79],[51,53],[72,42],[93,57],[105,86],[105,151]])
        poly('#191b32',[[47,150],[46,87],[56,61],[73,52],[88,65],[98,92],[98,150]])
        // Vortex elliptique : spirales effilées et poussières aspirées. La phase
        // boucle sur 2π ; chaque image est précalculée, aucun dessin par tick.
        const turn = phase * Math.PI * 2
        ctx.save()
        ctx.beginPath(); ctx.ellipse(72, 105, 25, 43, 0, 0, Math.PI * 2); ctx.clip()
        for(let ring=12;ring>0;ring--) {
            ctx.fillStyle = ring % 2 ? '#26243f' : '#302b4b'
            ctx.beginPath(); ctx.ellipse(72,105,ring*2.1,ring*3.6,0,0,Math.PI*2);ctx.fill()
        }
        for(let arm=0;arm<3;arm++) {
            for(let step=0;step<76;step++) {
                const t=step/75, radius=3+22*t
                const angle=turn+arm*Math.PI*2/3+t*5.6
                const x=72+Math.cos(angle)*radius, y=105+Math.sin(angle)*radius*1.7
                const size=t>0.45 ? 3 : 2
                r(magic+'55',x-2,y-2,size+4,size+4)
                r(magic,x,y,size,size)
                if(step%4===0) r('#f2e5ff',x,y,1,2)
            }
        }
        for(let mote=0;mote<12;mote++) {
            const t=((mote/12-phase)%1+1)%1
            const angle=mote*2.4+turn+t*4
            r('#f6eaff',72+Math.cos(angle)*24*t,105+Math.sin(angle)*40*t,2,2)
        }
        const pulse=1+Math.sin(turn)*0.12
        ctx.fillStyle='#131424';ctx.beginPath();ctx.ellipse(72,105,4*pulse,7*pulse,0,0,Math.PI*2);ctx.fill()
        ctx.restore()
        for(const [x,y,h] of [[23,68,87],[102,78,77],[35,42,39],[91,48,42]]) {
            poly('#1e202b',[[x-3,y+h],[x,y],[x+11,y-15],[x+20,y+h]])
            poly(dark,[[x,y+h],[x+3,y],[x+10,y-10],[x+16,y+h]])
            r(shade,x+3,y+10,3,h-13)
            for(let yy=y+18;yy<y+h-6;yy+=18) {r(magic,x+7,yy,5,2);r(magic,x+9,yy-3,2,8)}
        }
        poly(dark,[[40,55],[49,27],[65,34],[72,15],[80,35],[96,29],[104,61],[83,48],[64,45]])
        gem(72,37,7)
        if(forest) for(const x of [28,107]) {
            poly('#252f2b',[[x-10,159],[x+3,114],[x-5,84],[x+10,107],[x+7,147],[x+21,159]])
            r('#728149',x+4,119,3,19)
        }
        if(ice) for(const x of [18,115]) poly('#89a9c9',[[x,155],[x+3,113],[x+13,135],[x+10,156]])
        r(dark,23,154,98,7);r(shade,29,154,87,2)
        for(const [x,y] of [[51,26],[102,59],[33,103],[115,39],[82,13]]) r(magic,x,y,2,3)
        return
    }
    // Enceinte en perspective oblique : cour, faces éclairées, flancs et
    // chemins de ronde ont des plans distincts (lumière venant du haut gauche).
    const side = ice ? '#42627c' : forest ? '#435b51' : autumn ? '#383747' : '#78513e'
    const cap = ice ? '#edfaff' : forest ? '#d5d9b3' : autumn ? '#a7a1af' : '#ebc792'
    const rampart = (ax: number, ay: number, bx: number, by: number, height: number) => {
        poly(side, [[ax,ay],[bx,by],[bx,by-height],[ax,ay-height]])
        poly(wall, [[ax,ay],[bx,by],[bx,by-height+5],[ax,ay-height+5]])
        poly(cap, [[ax,ay-height],[ax+5,ay-height-5],[bx+5,by-height-5],[bx,by-height]])
        for(let course=7;course<height;course+=7) {
            poly(shade, [[ax,ay-course],[bx,by-course],[bx,by-course+1],[ax,ay-course+1]])
        }
        const count=Math.max(2,Math.round(Math.hypot(bx-ax,by-ay)/10))
        for(let i=0;i<=count;i++) {
            const t=i/count,x=ax+(bx-ax)*t,y=ay+(by-ay)*t-height
            poly(shade,[[x,y],[x+6,y+1],[x+6,y-7],[x,y-8]])
            poly(light,[[x,y-8],[x+4,y-12],[x+10,y-11],[x+6,y-7]])
            poly(side,[[x+6,y+1],[x+10,y-3],[x+10,y-11],[x+6,y-7]])
            for(let row=8;row<height;row+=7) r(shade,x+(row%14?3:0),y+row,1,6)
        }
    }
    const tower = (x: number, y: number, height: number, pointed: boolean) => {
        block(x,y-height,19,height)
        poly(side,[[x+19,y],[x+28,y-7],[x+28,y-height-7],[x+19,y-height]])
        for(let row=7;row<height;row+=8) poly(shade,[[x+19,y-row],[x+28,y-row-7],[x+28,y-row-6],[x+19,y-row+1]])
        poly(cap,[[x,y-height],[x+9,y-height-7],[x+28,y-height-7],[x+19,y-height]])
        if(pointed) {
            spire(x-4,y-height-27,30,27)
            poly(side,[[x+26,y-height],[x+32,y-height-7],[x+11,y-height-27]])
        } else {
            for(const dx of [0,8,16]) {r(shade,x+dx,y-height-7,5,7);r(light,x+dx,y-height-7,5,2)}
        }
        window(x+7,y-height+12,10)
        r(cap,x-1,y-5,21,3)
    }
    // Plateforme, escalier et pavage du sol intérieur.
    poly('#17202c55',[[5,154],[38,119],[139,137],[111,175],[21,169]])
    poly(shade,[[9,149],[43,115],[136,134],[103,172],[9,156]])
    poly(cap,[[9,149],[43,115],[136,134],[103,165]])
    poly(ice ? '#85abba' : forest ? '#7f9775' : autumn ? '#655e73' : '#b89470',[[16,145],[47,119],[128,136],[100,159]])
    for(let i=0;i<7;i++) {
        poly(shade,[[26+i*11,145+i*2],[48+i*10,123+i*2],[49+i*10,123+i*2],[27+i*11,145+i*2]])
    }
    rampart(39,118,122,137,29)
    tower(31,120,ice ? 32 : 54,false)
    tower(106,136,ice ? 68 : 53,autumn || ice)
    // Donjon reculé : façade claire et grand flanc dans l'ombre.
    if (ice) {
        // La jonction des trois routes doit rester lisible : centre bas,
        // grand volume reporté sur la tour arrière droite, contre le bord.
        block(53,94,38,31)
        poly(side,[[91,125],[105,114],[105,83],[91,94]])
        poly(cap,[[51,94],[66,82],[107,82],[92,96]])
        for(const x of [54,66,78,88]) { r(shade,x,88,6,7); r(light,x,88,6,2) }
        window(63,102,13); window(80,102,10)
        block(33,110,25,19)
        poly(cap,[[31,110],[41,102],[67,102],[58,111]])
        window(41,115,7)
        // Cristaux bas : le relief vient des facettes, pas d'une grande toiture.
        for(const [x,y,h] of [[56,89,14],[73,87,20],[89,88,11]]) {
            poly(shade,[[x-5,y],[x,y-h],[x+6,y-3],[x+3,y+4]])
            poly('#c4f7ff',[[x-5,y],[x,y-h],[x,y+2]])
            poly('#649fc4',[[x,y-h],[x+6,y-3],[x,y+2]])
        }
    } else {
        block(53,58,38,67)
        poly(side,[[91,125],[109,111],[109,45],[91,58]])
        for(let y=58;y<116;y+=8) poly(shade,[[92,y],[107,y-11],[107,y-10],[92,y+1]])
        if(!ice && !forest && !autumn) {
            for(let y=0;y<26;y+=2) {
                const half=Math.round(Math.sqrt(1-((26-y)/27)**2)*24)
                r(y%6===0 ? '#267b89' : roof,73-half,28+y,half*2,2)
            }
            r('#f6d58a',46,54,54,5);r('#f6d58a',72,15,2,15);gem(73,16,4)
            poly('#287077',[[97,54],[113,44],[95,27],[89,31]])
        } else {
            poly(side,[[96,59],[114,44],[82,10],[73,18]])
            spire(47,18,51,40);gem(73,15,4)
        }
        window(60,69,15);window(79,69,15);window(68,99,17)
        poly(cap,[[95,75],[101,71],[101,83],[95,87]])
        r(shade,65,119,14,8)
        // Petite aile et sa toiture à deux pans, décalées dans la cour.
        block(33,105,25,24)
        poly(side,[[58,129],[69,120],[69,96],[58,105]])
        poly(roof,[[28,105],[43,88],[71,94],[59,109]])
        poly(light,[[28,105],[43,88],[43,96],[35,106]])
        poly(side,[[59,109],[71,94],[74,101],[64,111]])
        window(40,111,8)
    }
    // Murailles du premier plan : le chemin de ronde reste visible au-dessus.
    rampart(13,149,40,123,ice ? 23 : 30)
    rampart(101,165,130,137,ice ? 25 : 31)
    rampart(14,149,99,166,ice ? 23 : 27)
    // Porte en retrait, voussoirs, herse, pont et marches.
    poly(side,[[52,157],[52,137],[62,129],[74,140],[74,162]])
    poly(cap,[[55,158],[55,138],[62,132],[71,141],[71,161]])
    poly('#252936',[[58,159],[58,140],[63,136],[68,142],[68,161]])
    for(const x of [59,62,65]) r('#ad9274',x,141,1,18)
    r('#c6ae8a',58,147,10,2)
    for(let step=0;step<4;step++) {
        poly(shade,[[53-step,160+step*3],[72+step,164+step*3],[72+step,166+step*3],[53-step,162+step*3]])
        poly(cap,[[53-step,159+step*3],[72+step,163+step*3],[72+step,164+step*3],[53-step,160+step*3]])
    }
    tower(8,151,ice ? 30 : 43,forest)
    tower(91,168,ice ? 39 : 49,autumn || forest || ice)
    // Bannières, meurtrières et petites lanternes sur l'enceinte.
    for(const [x,y] of [[37,137],[80,146]]) {
        r(shade,x-1,y-3,8,2);r(autumn ? '#684460' : roof,x,y,6,12)
        poly(light,[[x+2,y+2],[x+4,y+5],[x+2,y+8]])
    }
    for(const [x,y] of [[48,144],[75,150]]) {r(side,x,y,3,6);r('#ffe2a1',x,y,2,3)}
    if(forest) for(const [x,y] of [[12,121],[35,131],[100,132]]) for(let i=0;i<5;i++) {
        r('#416844',x+i%2*2,y+i*5,3,7);r('#82af76',x-2,y+i*5,5,2)
        if(i%2) r('#efc0d8',x+3,y+i*5,3,3)
    }
    if(ice) for(const [x,y] of [[14,112],[94,121],[47,114],[116,120]]) {
        r('#edffff',x,y,9,2);poly('#bff3ff',[[x+2,y+1],[x+5,y+1],[x+3,y+10]])
    }
    if(autumn) {
        r('#dcc7a0',109,78,1,14);r('#dcc7a0',105,80,10,1)
        for(const [x,y] of [[26,152],[78,162],[123,144]]) {r('#bc8547',x,y,4,2);r('#cc9d60',x+4,y+2,3,2)}
    }
    if (!ice && !forest && !autumn) {
        // Petits obélisques protecteurs, grès taillé et incrustations turquoise.
        for(const [x,y] of [[30,162],[124,159]]) {
            r(shade,x-5,y,13,4);r(light,x-5,y,13,1)
            poly(wall,[[x-3,y],[x-2,y-19],[x+2,y-25],[x+5,y-18],[x+6,y]])
            poly(shade,[[x+2,y-25],[x+5,y-18],[x+6,y],[x+2,y]])
            r('#82e4da',x,y-16,2,9);r(light,x-1,y-20,2,3)
        }
        for(const [x,y] of [[18,158],[37,168],[112,170],[127,164]]) {
            r('#d6b280',x,y,8,2);r('#f0d09b',x+2,y,3,1)
        }
    }
    if (!ice) gem(74,92,4)
}
