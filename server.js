const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

const CONFIG = {
    PORT: 10000,
    DEMONLORD: { MAX_HP: 5000, RESPAWN_TIME: 10000, SPEED: 7, ATTACK_COOLDOWN: 2000, ATTACK_DAMAGE: 200, VISION_RANGE: 400, EXP: 500 },
    SKELETON: { MAX_HP: 200, RESPAWN_TIME: 10000, SPEED: 8, ATTACK_COOLDOWN: 1000, ATTACK_DAMAGE: 30, VISION_RANGE: 400, EXP: 50, DEFENSE: 0 },
    PLAYER: { MAX_HP: 500, RESPAWN_TIME: 10000, BASE_STATS: {
        barbaro: { fuerza: 18, defensaFisica: 8, defensaMagica: 0, agilidad: 8, vitalidad: 12, attackSpeed: 0.7, baseDamage: 60, mana: 50 },
        caballero: { fuerza: 12, defensaFisica: 15, defensaMagica: 0, agilidad: 8, vitalidad: 14, attackSpeed: 0.9, baseDamage: 45, mana: 60 },
        warrior: { fuerza: 10, defensaFisica: 10, defensaMagica: 0, agilidad: 15, vitalidad: 10, attackSpeed: 1.0, baseDamage: 50, mana: 60 },
        mago: { fuerza: 5, defensaFisica: 0, defensaMagica: 40, agilidad: 12, vitalidad: 8, attackSpeed: 0.7, baseDamage: 35, mana: 150 },
        necromancer: { fuerza: 5, defensaFisica: 0, defensaMagica: 40, agilidad: 10, vitalidad: 10, attackSpeed: 0.7, baseDamage: 35, mana: 150 }
    }},
    ROCAS: { CANTIDAD_INICIAL: 20, MAX_POR_JUGADOR: 50, RESPAWN_TIME: 30000 }
};

app.use(express.static(__dirname));
app.use('/ui', express.static(path.join(__dirname, 'ui')));
app.use('/skills', express.static(path.join(__dirname, 'skills')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let players = {};
let ultimoAtaque = new Map();
let demonlord = { id: 'demonlord', x: 1500, y: 1500, hp: CONFIG.DEMONLORD.MAX_HP, maxHp: CONFIG.DEMONLORD.MAX_HP, isAlive: true, dir: 'Abajo', attackCooldown: 0, attackers: [], isAttacking: false, currentTarget: null };
let esqueletos = [];
let arboles = [];
let rocas = [];
let inventariosJugadores = {};
let nextSkeletonId = 100;
let skillCooldowns = {};
let teams = {};
let playerTeam = {};

function getDistance(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

function getPlayerDefenseFisica(playerId) {
    const j = players[playerId];
    if (!j) return 0;
    const inv = inventariosJugadores[playerId];
    if (!inv) return 0;
    let def = 0;
    const statsBase = CONFIG.PLAYER.BASE_STATS[j.class] || CONFIG.PLAYER.BASE_STATS.warrior;
    def += statsBase.defensaFisica || 0;
    const escudoId = j.equipamiento?.escudo;
    if (escudoId) {
        const item = inv.items.find(i => i.id === escudoId);
        if (item && item.defensaFisica) def += item.defensaFisica;
    }
    const armaduraId = j.equipamiento?.armadura;
    if (armaduraId) {
        const item = inv.items.find(i => i.id === armaduraId);
        if (item && item.defensaFisica) def += item.defensaFisica;
    }
    def += Math.floor(j.stats?.vitalidad || 0);
    return def;
}

function getPlayerDefensaMagica(playerId) {
    const j = players[playerId];
    if (!j) return 0;
    const inv = inventariosJugadores[playerId];
    if (!inv) return 0;
    let def = 0;
    const statsBase = CONFIG.PLAYER.BASE_STATS[j.class] || CONFIG.PLAYER.BASE_STATS.warrior;
    def += statsBase.defensaMagica || 0;
    const escudoId = j.equipamiento?.escudo;
    if (escudoId) {
        const item = inv.items.find(i => i.id === escudoId);
        if (item && item.defensaMagica) def += item.defensaMagica;
    }
    const armaduraId = j.equipamiento?.armadura;
    if (armaduraId) {
        const item = inv.items.find(i => i.id === armaduraId);
        if (item && item.defensaMagica) def += item.defensaMagica;
    }
    def += Math.floor((j.stats?.inteligencia || 0) / 2);
    return def;
}

function calcularDañoFinal(objetivoId, dañoBase, tipo = 'fisico', elemento = null) {
    let defensa = 0;
    if (tipo === 'fisico') {
        defensa = getPlayerDefenseFisica(objetivoId);
    } else if (tipo === 'magico' && elemento) {
        const j = players[objetivoId];
        if (j && j.stats) {
            switch(elemento) {
                case 'fuego': defensa = j.stats.defFuego || 0; break;
                case 'agua': defensa = j.stats.defAgua || 0; break;
                case 'viento': defensa = j.stats.defViento || 0; break;
                case 'rayo': defensa = j.stats.defRayo || 0; break;
                case 'luz': defensa = j.stats.defLuz || 0; break;
                case 'oscuridad': defensa = j.stats.defOscuridad || 0; break;
                default: defensa = 0;
            }
        }
    } else {
        defensa = getPlayerDefensaMagica(objetivoId);
    }
    return Math.max(1, dañoBase - defensa);
}

function darExpAJugadorYEquipo(socketId, exp) {
    const j = players[socketId];
    if (!j) return;
    j.exp = (j.exp || 0) + exp;
    io.to(socketId).emit('playerExpGain', { id: socketId, exp: exp });
    const t = playerTeam[socketId];
    if (t && teams[t]) {
        teams[t].miembros.forEach(m => {
            if (m !== socketId && players[m]) {
                players[m].exp = (players[m].exp || 0) + exp;
                io.to(m).emit('playerExpGain', { id: m, exp: exp });
            }
        });
    }
}

function revivirJugador(socketId) {
    const j = players[socketId];
    if (!j) return;
    j.isAlive = true;
    j.hp = CONFIG.PLAYER.MAX_HP;
    j.mana = (CONFIG.PLAYER.BASE_STATS[j.class]?.mana || 100);
    j.x = 512;
    j.y = 512;
    io.emit('playerRespawn', { id: socketId, x: 512, y: 512 });
}

const ITEMS_DATA = {
    armadura_3: { nombre: 'Armadura+++', tipo: 'armadura', icono: 'armadura_de_cuero_img', stats: { defensaFisica: 50, defensaMagica: 25, velocidad: -10 }, calidad: '+++', dropChance: 0.005, textoVerde: true },
    espada_3: { nombre: 'Espada+++', tipo: 'espada', icono: 'espada_img', stats: { ataqueFisico: 40, velocidad: -5 }, calidad: '+++', dropChance: 0.01, textoVerde: true },
    escudo_3: { nombre: 'Escudo+++', tipo: 'escudo', icono: 'escudo_madera_img', stats: { defensaFisica: 55, defensaMagica: 20, velocidad: -5 }, calidad: '+++', dropChance: 0.01, textoVerde: true },
    hachadehierro_3: { nombre: 'Hacha de Hierro+++', tipo: 'espada', icono: 'hachadehierro_img', stats: { ataqueFisico: 80, velocidad: 0 }, calidad: '+++', dropChance: 0.002, textoVerde: true },
    armadura_2: { nombre: 'Armadura++', tipo: 'armadura', icono: 'armadura_de_cuero_img', stats: { defensaFisica: 30, defensaMagica: 15, velocidad: -15 }, calidad: '++', dropChance: 0.02, textoVerde: false },
    espada_2: { nombre: 'Espada++', tipo: 'espada', icono: 'espada_img', stats: { ataqueFisico: 25, velocidad: -10 }, calidad: '++', dropChance: 0.03, textoVerde: false },
    escudo_2: { nombre: 'Escudo++', tipo: 'escudo', icono: 'escudo_madera_img', stats: { defensaFisica: 35, defensaMagica: 12, velocidad: -10 }, calidad: '++', dropChance: 0.03, textoVerde: false },
    hachadehierro_2: { nombre: 'Hacha de Hierro++', tipo: 'espada', icono: 'hachadehierro_img', stats: { ataqueFisico: 50, velocidad: -5 }, calidad: '++', dropChance: 0.008, textoVerde: false },
    armadura_1: { nombre: 'Armadura+', tipo: 'armadura', icono: 'armadura_de_cuero_img', stats: { defensaFisica: 15, defensaMagica: 5, velocidad: -20 }, calidad: '+', dropChance: 0.05, textoVerde: false },
    espada_1: { nombre: 'Espada+', tipo: 'espada', icono: 'espada_img', stats: { ataqueFisico: 15, velocidad: -15 }, calidad: '+', dropChance: 0.08, textoVerde: false },
    escudo_1: { nombre: 'Escudo+', tipo: 'escudo', icono: 'escudo_madera_img', stats: { defensaFisica: 20, defensaMagica: 5, velocidad: -15 }, calidad: '+', dropChance: 0.08, textoVerde: false },
    hachadehierro_1: { nombre: 'Hacha de Hierro+', tipo: 'espada', icono: 'hachadehierro_img', stats: { ataqueFisico: 25, velocidad: -10 }, calidad: '+', dropChance: 0.02, textoVerde: false },
    hachadehierroleg: { nombre: 'Hacha Legendaria', tipo: 'espada', icono: 'hachadehierroleg_img', stats: { ataqueFisico: 250, velocidad: -50 }, calidad: 'LEGENDARIA', dropChance: 0.001, textoDorado: true, lootIndicator: 'yellow', efectoEspecial: 'contraGolpe' }
};

function generarArboles() {
    arboles = [];
    for (let i = 0; i < 15; i++) {
        arboles.push({ id: 'arbol_' + i, x: Math.random() * 2800 + 100, y: Math.random() * 2800 + 100, activo: true });
    }
    console.log(`🌲 Generados ${arboles.length} árboles`);
}

function generarRocas() {
    rocas = [];
    for (let i = 0; i < CONFIG.ROCAS.CANTIDAD_INICIAL; i++) {
        rocas.push({ id: 'roca_' + i, x: Math.random() * 2800 + 100, y: Math.random() * 2800 + 100, activo: true });
    }
    console.log(`🪨 Generadas ${rocas.length} rocas`);
}

function generarEsqueletosIniciales() {
    esqueletos = [];
    for (let i = 0; i < 50; i++) {
        esqueletos.push({
            id: 'esqueleto_' + (nextSkeletonId++),
            x: Math.random() * 2800 + 100,
            y: Math.random() * 2800 + 100,
            hp: CONFIG.SKELETON.MAX_HP,
            maxHp: CONFIG.SKELETON.MAX_HP,
            isAlive: true,
            isAlly: false,
            ownerId: null,
            targetId: null,
            targetType: null,
            dir: 'Abajo',
            attackCooldown: 0,
            damageBonus: 0,
            baseDamage: CONFIG.SKELETON.ATTACK_DAMAGE,
            attackers: []
        });
    }
    console.log(`💀 Generados ${esqueletos.length} esqueletos`);
    return esqueletos;
}

function dropearItem(x, y, itemId) {
    const item = ITEMS_DATA[itemId];
    if (!item) return;
    console.log(`📤 Enviando dropItem: ${itemId}, textoDorado: ${item.textoDorado || false}`);
    io.emit('dropItem', {
        x, y, itemId,
        nombre: item.nombre,
        tipo: item.tipo,
        icono: item.icono,
        stats: item.stats,
        calidad: item.calidad || '',
        textoVerde: item.textoVerde || false,
        textoDorado: item.textoDorado || false,
        lootIndicator: item.lootIndicator || 'white'
    });
}

function tieneHachaLegendaria(jugador) {
    if (!jugador) return false;
    const armaId = jugador.equipamiento?.arma;
    if (armaId && armaId.includes('hachadehierroleg')) return true;
    const inventario = inventariosJugadores[jugador.id];
    if (inventario && inventario.items) {
        const itemArma = inventario.items.find(i => i.id === armaId);
        if (itemArma) {
            if (itemArma.idBase === 'hachadehierroleg' ||
                (itemArma.id && itemArma.id.includes('hachadehierroleg')) ||
                itemArma.nombre === 'Hacha Legendaria') {
                return true;
            }
        }
    }
    return false;
}

function dañarEsqueleto(esqueleto, atacanteId, daño) {
    if (!esqueleto || !esqueleto.isAlive) return;
    if (!esqueleto.attackers) esqueleto.attackers = [];
    if (!esqueleto.attackers.includes(atacanteId)) esqueleto.attackers.push(atacanteId);
    esqueleto.hp = Math.max(0, esqueleto.hp - daño);
    io.emit('enemyDamaged', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dmg: daño });
    if (esqueleto.hp <= 0) {
        esqueleto.isAlive = false;
        esqueletos.forEach(o => { if (o.isAlive && o.targetId === esqueleto.id) { o.targetId = null; o.targetType = null; } });
        if (players[atacanteId] && players[atacanteId].className === 'BARBARO') {
            io.emit('barbaroAsesinato', { playerId: atacanteId });
        }
        const team = playerTeam[atacanteId];
        let destinos = team && teams[team] ? teams[team].miembros : [atacanteId];
        if (Math.random() < 0.1) {
            destinos.forEach(d => io.to(d).emit('dropPocion', { x: esqueleto.x, y: esqueleto.y, tipo: Math.random() < 0.5 ? 'hp' : 'mana', cantidad: 1 }));
        }
        const dropRand = Math.random();
        let dropObtenido = false;
        for (const [id, data] of Object.entries(ITEMS_DATA)) {
            if (id !== 'hachadehierroleg' && dropRand < data.dropChance && !dropObtenido) {
                dropearItem(esqueleto.x, esqueleto.y, id);
                dropObtenido = true;
            }
        }
        if (esqueleto.attackers && esqueleto.attackers.length > 0) {
            esqueleto.attackers.forEach(a => darExpAJugadorYEquipo(a, CONFIG.SKELETON.EXP));
        } else {
            darExpAJugadorYEquipo(atacanteId, CONFIG.SKELETON.EXP);
        }
        io.emit('esqueletoDeath', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, exp: CONFIG.SKELETON.EXP, attackers: esqueleto.attackers || [], dir: esqueleto.dir || 'Abajo' });
        setTimeout(() => {
            if (!esqueleto.isAlive && !esqueleto.isAlly) {
                esqueleto.isAlive = true;
                esqueleto.hp = CONFIG.SKELETON.MAX_HP;
                esqueleto.x = Math.random() * 2800 + 100;
                esqueleto.y = Math.random() * 2800 + 100;
                esqueleto.attackers = [];
                esqueleto.targetId = null;
                esqueleto.targetType = null;
                esqueleto.attackCooldown = 0;
                esqueleto.dir = 'Abajo';
                io.emit('esqueletoNew', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y });
            }
        }, CONFIG.SKELETON.RESPAWN_TIME);
    }
}

console.log("🔥 DEVILAND SERVIDOR INICIADO");
generarArboles();
generarRocas();
generarEsqueletosIniciales();
console.log(`✅ Mundo generado: ${arboles.length} árboles, ${rocas.length} rocas, ${esqueletos.length} esqueletos`);

io.on('connection', (socket) => {
    console.log('✅ Cliente conectado:', socket.id);
    skillCooldowns[socket.id] = { furiaNecrotica: 0 };

    socket.emit('arbolesIniciales', arboles);
    socket.emit('rocasIniciales', rocas);
    socket.emit('esqueletosIniciales', esqueletos.filter(e => e.isAlive === true));
    socket.emit('currentPlayers', players);
    socket.emit('demonlordState', { hp: demonlord.hp, isAlive: demonlord.isAlive, x: demonlord.x, y: demonlord.y, dir: demonlord.dir });

    socket.on('newPlayer', (d) => {
        const bs = CONFIG.PLAYER.BASE_STATS[d.class] || CONFIG.PLAYER.BASE_STATS.warrior;
        let atq = 15;
        if (d.className === 'BARBARO') atq = 80;
        else if (d.className === 'CABALLERO') atq = 50;
        else if (d.className === 'WARRIOR') atq = 50;
        else if (d.className === 'MAGO' || d.className === 'NECROMANCER') atq = 15;

        players[socket.id] = {
            id: socket.id, x: 512, y: 512, class: d.class, name: d.name, className: d.className,
            hp: CONFIG.PLAYER.MAX_HP, maxHp: CONFIG.PLAYER.MAX_HP, isAlive: true,
            deathCount: 0, deathPosition: null, team: 'Sin Team', level: 1, exp: 0, dir: 'Abajo',
            stats: { fuerza: bs.fuerza, defensaFisica: bs.defensaFisica, defensaMagica: bs.defensaMagica, agilidad: bs.agilidad, vitalidad: bs.vitalidad, puntosDisponibles: 5, defFuego: 0, defAgua: 0, defViento: 0, defRayo: 0, defLuz: 0, defOscuridad: 0 },
            minerales: {},
            equipamiento: { cabeza: null, pecho: null, piernas: null, pies: null, arma: null, escudo: null, ring1: null, ring2: null },
            mana: bs.mana || 100, maxMana: bs.mana || 100,
            esqueletosSummon: 0,
            skillsEquipadas: d.className === 'NECROMANCER' ? ['levantar_muerto', 'furia_necrotica', 'ataque_distancia'] : (d.className === 'MAGO' ? ['ataque_distancia'] : []),
            attackSpeedModifier: bs.attackSpeed || 1.0,
            baseDamage: bs.baseDamage || 50,
            ataqueFisico: atq,
            contraGolpeContador: 0,
            contraGolpeDañoAcumulado: 0,
            contraGolpeCargado: false,
            contraGolpeBonus: 0
        };

        if (!inventariosJugadores[socket.id]) inventariosJugadores[socket.id] = { items: [], equipamiento: {} };
        inventariosJugadores[socket.id].items.push({ id: 'pocion_1', tipo: 'pocion', nombre: 'Pocion de Vida', icono: 'pocion_img', cantidad: 2, slot: 0 });
        socket.emit('inventarioCompleto', inventariosJugadores[socket.id]);
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    socket.on('solicitarInventarioCompleto', () => {
        if (inventariosJugadores[socket.id]) {
            socket.emit('inventarioCompleto', inventariosJugadores[socket.id]);
        } else {
            inventariosJugadores[socket.id] = { items: [{ id: 'pocion_1', tipo: 'pocion', nombre: 'Pocion de Vida', icono: 'pocion_img', cantidad: 2, slot: 0 }], equipamiento: {} };
            socket.emit('inventarioCompleto', inventariosJugadores[socket.id]);
        }
    });

    socket.on('actualizarInventario', (data) => {
        const j = players[socket.id];
        if (!j) return;
        if (data.inventarioSlots) {
            inventariosJugadores[socket.id].items = [];
            for (let i = 0; i < data.inventarioSlots.length; i++) {
                if (data.inventarioSlots[i]) inventariosJugadores[socket.id].items.push({ ...data.inventarioSlots[i], slot: i });
            }
        }
        if (data.equipamiento) inventariosJugadores[socket.id].equipamiento = data.equipamiento;
    });

    socket.on('usarPocion', (data) => {
        const j = players[socket.id];
        if (j) { j.hp = Math.min(j.maxHp, j.hp + (data.curacion || 20)); io.emit('playerStatsUpdate', { id: socket.id, hp: j.hp }); }
    });

    socket.on('usarPocionMana', (data) => {
        const j = players[socket.id];
        if (j) { j.mana = Math.min(j.maxMana, j.mana + data.restauracion); io.emit('playerStatsUpdate', { id: socket.id, mana: j.mana }); }
    });

    socket.on('playerMovement', (data) => {
        let p = players[socket.id];
        if (p && p.isAlive) {
            p.x = data.x; p.y = data.y; p.dir = data.dir; p.isMoving = data.isMoving;
            socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y, dir: data.dir, isMoving: data.isMoving, hp: p.hp, maxHp: p.maxHp, timestamp: data.timestamp });
        }
    });

    socket.on('playerAttack', (data) => {
        const j = players[socket.id];
        if (!j || !j.isAlive) return;
        const ahora = Date.now();
        if (ultimoAtaque.get(socket.id) && ahora - ultimoAtaque.get(socket.id) < 100) return;
        ultimoAtaque.set(socket.id, ahora);
        socket.broadcast.emit('playerAttacked', { id: socket.id, dir: j.dir, class: j.class });

        let dañoTotal = data.damageBonus || j.ataqueFisico;

        if (j.contraGolpeCargado && j.contraGolpeBonus > 0) {
            dañoTotal += j.contraGolpeBonus;
            io.emit('contraGolpeActivado', { playerId: socket.id, x: j.x, y: j.y, bonus: j.contraGolpeBonus });
            io.emit('contraGolpeUsado', { playerId: socket.id });
            j.contraGolpeCargado = false;
            j.contraGolpeBonus = 0;
        }

        let esqCercano = null, distMin = 80;
        for (let e of esqueletos) {
            if (e.isAlive && !e.isAlly && getDistance(j.x, j.y, e.x, e.y) < distMin) {
                distMin = getDistance(j.x, j.y, e.x, e.y);
                esqCercano = e;
            }
        }
        if (esqCercano) dañarEsqueleto(esqCercano, socket.id, Math.max(1, Math.floor(dañoTotal)));
    });

    socket.on('esqueletoHit', (data) => {
        const j = players[socket.id];
        if (!j || !j.isAlive) return;
        let dañoTotal = data.damageBonus || 0;
        if (j.contraGolpeCargado && j.contraGolpeBonus > 0) {
            dañoTotal += j.contraGolpeBonus;
            io.emit('contraGolpeActivado', { playerId: socket.id, x: j.x, y: j.y, bonus: j.contraGolpeBonus });
            io.emit('contraGolpeUsado', { playerId: socket.id });
            j.contraGolpeCargado = false;
            j.contraGolpeBonus = 0;
        }
        let e = esqueletos.find(e => e.id === data.id && e.isAlive);
        if (e) dañarEsqueleto(e, socket.id, Math.max(1, dañoTotal));
    });

    socket.on('playerMurio', (data) => {
        const j = players[data.id];
        if (j && j.isAlive) {
            j.isAlive = false; j.hp = 0;
            io.emit('playerDeath', { id: data.id, name: j.name });
            esqueletos.forEach(e => { if (e.targetId === data.id) { e.targetId = null; e.targetType = null; } });
        }
    });

    socket.on('playerRespawn', (data) => { if (data.id === socket.id) revivirJugador(socket.id); });

    socket.on('demonlordHit', (data) => {
        if (!demonlord.isAlive) return;
        const j = players[socket.id];
        if (!j || !j.isAlive) return;
        if (!demonlord.attackers) demonlord.attackers = [];
        if (!demonlord.attackers.includes(socket.id)) demonlord.attackers.push(socket.id);

        let dmg = data.damageBonus || j.ataqueFisico;
        if (data.esCritico) dmg *= 2;

        demonlord.hp = Math.max(0, demonlord.hp - dmg);
        console.log(`⚔️ ${j.name} ataca a demonlord - Daño: ${dmg}, HP restante: ${demonlord.hp}`);
        io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: dmg, hp: demonlord.hp });

        if (demonlord.hp <= 0) {
            demonlord.isAlive = false;

            if (Math.random() < 0.0005) {
                console.log(`✨ ¡HACHA LEGENDARIA DROPEADA POR DEMONLORD!`);
                dropearItem(demonlord.x, demonlord.y, 'hachadehierroleg');
            }

            if (demonlord.attackers && demonlord.attackers.length > 0) {
                demonlord.attackers.forEach(a => darExpAJugadorYEquipo(a, CONFIG.DEMONLORD.EXP));
            } else {
                darExpAJugadorYEquipo(socket.id, CONFIG.DEMONLORD.EXP);
            }

            demonlord.attackers.forEach(a => {
                for (let i = 0; i < 8; i++) {
                    const ang = (i / 8) * Math.PI * 2;
                    const dist = 60 + Math.random() * 40;
                    io.to(a).emit('crearMonedaServidor', { x: demonlord.x + Math.cos(ang) * dist, y: demonlord.y + Math.sin(ang) * dist, cantidad: Math.floor(Math.random() * 20) + 10 });
                }
            });

            if (Math.random() < 0.3) {
                demonlord.attackers.forEach(a => {
                    const rand = Math.random();
                    if (rand < 0.03) dropearItem(demonlord.x + (Math.random() - 0.5) * 80, demonlord.y + (Math.random() - 0.5) * 80, 'hachadehierro_3');
                    else if (rand < 0.15) dropearItem(demonlord.x + (Math.random() - 0.5) * 80, demonlord.y + (Math.random() - 0.5) * 80, 'hachadehierro_2');
                    else dropearItem(demonlord.x + (Math.random() - 0.5) * 80, demonlord.y + (Math.random() - 0.5) * 80, 'hachadehierro_1');
                });
            }

            io.emit('demonlordDeath', { x: demonlord.x, y: demonlord.y, attackers: demonlord.attackers || [] });

            setTimeout(() => {
                demonlord.hp = CONFIG.DEMONLORD.MAX_HP;
                demonlord.isAlive = true;
                demonlord.x = 1500;
                demonlord.y = 1500;
                demonlord.attackers = [];
                io.emit('demonlordRespawn', { x: demonlord.x, y: demonlord.y });
            }, CONFIG.DEMONLORD.RESPAWN_TIME);
        }
    });

    socket.on('solicitarDemonlordHP', () => {
        const j = players[socket.id];
        if (!j) return;
        const dist = getDistance(demonlord.x, demonlord.y, j.x, j.y);
        if (dist < CONFIG.DEMONLORD.VISION_RANGE + 100) {
            socket.emit('demonlordHPResponse', { hp: demonlord.hp, maxHp: demonlord.maxHp, visible: true });
        } else {
            socket.emit('demonlordHPResponse', { visible: false });
        }
    });

    socket.on('levantarEsqueleto', (data) => {
        const j = players[socket.id];
        if (!j || j.className !== 'NECROMANCER') { socket.emit('mensaje', '❌ Solo Necromancer'); return; }
        let cadaver = esqueletos.find(e => e.id === data.id && !e.isAlive && !e.isAlly);
        if (!cadaver) { socket.emit('mensaje', '❌ No hay cadaver'); return; }
        if (getDistance(j.x, j.y, cadaver.x, cadaver.y) > 100) { socket.emit('mensaje', '❌ Muy lejos'); return; }
        cadaver.isAlive = true;
        cadaver.isAlly = true;
        cadaver.ownerId = socket.id;
        cadaver.hp = cadaver.maxHp;
        cadaver.x = j.x + (Math.random() * 100 - 50);
        cadaver.y = j.y + (Math.random() * 100 - 50);
        cadaver.attackers = [];
        j.esqueletosSummon = (j.esqueletosSummon || 0) + 1;
        io.emit('esqueletoRevive', { id: cadaver.id, x: cadaver.x, y: cadaver.y, ownerId: socket.id });
        io.emit('playerStatsUpdate', { id: socket.id, hp: j.hp, mana: j.mana });
    });

    socket.on('furiaNecrotica', () => {
        const j = players[socket.id];
        if (!j || j.className !== 'NECROMANCER') { socket.emit('mensaje', '❌ Solo Necromancer'); return; }
        const now = Date.now();
        const last = skillCooldowns[socket.id].furiaNecrotica;
        if (last > 0 && now - last < 120000) { socket.emit('mensaje', '⏳ Cooldown'); return; }
        const aliados = esqueletos.filter(e => e.isAlly === true && e.ownerId === socket.id && e.isAlive === true);
        const cant = aliados.length;
        if (cant === 0) { socket.emit('mensaje', '❌ Sin esqueletos'); return; }
        const cost = cant * 10;
        if (j.mana < cost) { socket.emit('mensaje', `❌ Necesitas ${cost} mana`); return; }
        j.mana -= cost;
        io.emit('playerStatsUpdate', { id: socket.id, mana: j.mana });
        const bonus = cant * 0.07;
        const bonusDamage = Math.floor(CONFIG.SKELETON.ATTACK_DAMAGE * bonus);
        const ids = [];
        aliados.forEach(e => { e.damageBonus = bonusDamage; ids.push(e.id); });
        skillCooldowns[socket.id].furiaNecrotica = now;
        io.emit('furiaNecroticaEffect', { playerId: socket.id, duracion: 10, esqueletosIds: ids, bonusPorcentaje: bonus });
        setTimeout(() => {
            esqueletos.filter(e => e.isAlly && e.ownerId === socket.id && e.isAlive).forEach(e => e.damageBonus = 0);
            io.emit('furiaNecroticaEnd', { playerId: socket.id });
        }, 10000);
    });

    socket.on('crearProyectil', (data) => socket.broadcast.emit('proyectilCreado', data));
    socket.on('solicitarEsqueletos', () => { if (players[socket.id]) socket.emit('esqueletosIniciales', esqueletos.filter(e => e.isAlive === true)); });

    socket.on('chatMessage', (msg) => {
        const j = players[socket.id];
        if (!j) return;

        if (msg === '/hacha') {
            console.log(`📤 Server: dropeando Hacha Legendaria para ${j.name}`);
            dropearItem(j.x, j.y, 'hachadehierroleg');
            io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🗡️ ${j.name} invocó el Hacha Legendaria` });
            return;
        }

        io.emit('chatMessage', { type: 'user', name: j.name, msg: msg });
    });

    socket.on('salirEquipo', () => {
        const tid = playerTeam[socket.id];
        if (!tid || !teams[tid]) { socket.emit('mensaje', 'No estas en equipo'); return; }
        const team = teams[tid];
        const idx = team.miembros.indexOf(socket.id);
        if (idx !== -1) team.miembros.splice(idx, 1);
        delete playerTeam[socket.id];
        players[socket.id].team = 'Sin Team';
        if (team.miembros.length === 0) delete teams[tid];
        else if (team.lider === socket.id) team.lider = team.miembros[0];
        socket.emit('mensaje', 'Saliste del equipo');
        io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${players[socket.id].name} salio del equipo` });
    });

    socket.on('talarArbol', (data) => {
        const j = players[socket.id];
        if (!j || !j.isAlive) return;
        const arbol = arboles.find(a => a.activo && getDistance(data.x, data.y, a.x, a.y) < 80);
        if (!arbol) return;
        if (getDistance(j.x, j.y, arbol.x, arbol.y) > 100) { socket.emit('mensaje', '❌ Muy lejos'); return; }
        io.emit('arbolTalado', { id: arbol.id, x: arbol.x, y: arbol.y, taladoPor: j.name });
        arbol.activo = false;
        io.emit('arbolDesaparece', { id: arbol.id, x: arbol.x, y: arbol.y });
        setTimeout(() => {
            arbol.x = Math.random() * 2800 + 100;
            arbol.y = Math.random() * 2800 + 100;
            arbol.activo = true;
            io.emit('arbolRespawn', { id: arbol.id, x: arbol.x, y: arbol.y });
        }, 15000);
    });

    socket.on('recogerRoca', (data) => {
        let j = players[socket.id];
        if (!j || !j.isAlive) return;
        let roca = rocas.find(r => r.activo && getDistance(data.x, data.y, r.x, r.y) < 50);
        if (!roca) return;
        if (getDistance(j.x, j.y, roca.x, roca.y) > 70) { socket.emit('mensaje', '❌ Muy lejos'); return; }
        roca.activo = false;
        io.emit('rocaDesaparece', { id: roca.id, x: roca.x, y: roca.y });
        socket.emit('rocaObtenida');
        io.emit('rocaRecogida', { id: roca.id, recolectadoPor: j.name });
        setTimeout(() => {
            const idx = rocas.findIndex(r => r.id === roca.id);
            if (idx !== -1) {
                rocas[idx].activo = true;
                rocas[idx].x = Math.random() * 2800 + 100;
                rocas[idx].y = Math.random() * 2800 + 100;
                io.emit('rocaRespawn', { id: rocas[idx].id, x: rocas[idx].x, y: rocas[idx].y });
            }
        }, CONFIG.ROCAS.RESPAWN_TIME);
    });

    socket.on('equiparHachaLegendaria', () => {
        const j = players[socket.id];
        if (j) {
            j.contraGolpeContador = 0;
            j.contraGolpeDañoAcumulado = 0;
            j.contraGolpeCargado = false;
            j.contraGolpeBonus = 0;
            io.emit('contraGolpeUsado', { playerId: socket.id });
            console.log(`⚔️ ${j.name} equipó el Hacha Legendaria`);
        }
    });

    socket.on('desequiparHachaLegendaria', () => {
        const j = players[socket.id];
        if (j) {
            j.contraGolpeCargado = false;
            j.contraGolpeBonus = 0;
            io.emit('contraGolpeUsado', { playerId: socket.id });
            console.log(`⚔️ ${j.name} desequipó el Hacha Legendaria`);
        }
    });

    socket.on('disconnect', () => {
        const tid = playerTeam[socket.id];
        if (tid && teams[tid]) {
            const team = teams[tid];
            const idx = team.miembros.indexOf(socket.id);
            if (idx !== -1) team.miembros.splice(idx, 1);
            if (team.miembros.length === 0) delete teams[tid];
            else if (team.lider === socket.id) team.lider = team.miembros[0];
        }
        delete playerTeam[socket.id];
        delete players[socket.id];
        delete inventariosJugadores[socket.id];
        delete skillCooldowns[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// ============================================
// MOVIMIENTO Y ATAQUE DEL DEMONLORD
// ============================================
setInterval(() => {
    if (!demonlord.isAlive) return;
    let closest = null, closestDist = Infinity;
    for (let id in players) {
        let p = players[id];
        if (p && p.isAlive) {
            let d = getDistance(demonlord.x, demonlord.y, p.x, p.y);
            if (d < closestDist) { closestDist = d; closest = p; }
        }
    }
    if (!closest) {
        for (let e of esqueletos) {
            if (e.isAlive) {
                let d = getDistance(demonlord.x, demonlord.y, e.x, e.y);
                if (d < closestDist) { closestDist = d; closest = e; }
            }
        }
    }
    if (!closest) return;
    const dx = closest.x - demonlord.x, dy = closest.y - demonlord.y, dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > Math.abs(dy)) demonlord.dir = dx > 0 ? 'Derecha' : 'Izquierda';
    else demonlord.dir = dy > 0 ? 'Abajo' : 'Arriba';
    if (dist < 400) {
        if (dist > 70) {
            const moveX = (dx / dist) * CONFIG.DEMONLORD.SPEED;
            const moveY = (dy / dist) * CONFIG.DEMONLORD.SPEED;
            demonlord.x = Math.min(Math.max(demonlord.x + moveX, 50), 2950);
            demonlord.y = Math.min(Math.max(demonlord.y + moveY, 50), 2950);
            io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: true });
        } else {
            io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: false });
        }
        if (demonlord.attackCooldown <= 0 && dist < 70) {
            demonlord.attackCooldown = CONFIG.DEMONLORD.ATTACK_COOLDOWN;
            const isPlayer = players[closest.id] ? true : false;
            let damage = CONFIG.DEMONLORD.ATTACK_DAMAGE;
            io.emit('demonlordAtkVisual', { dir: demonlord.dir, esFuerte: false });
            setTimeout(() => {
                if (!demonlord.isAlive || !closest) return;
                if (isPlayer && closest.hp <= 0) return;
                if (!isPlayer && !closest.isAlive) return;
                if (isPlayer) {
                    let offX = 0, offY = 0;
                    switch (demonlord.dir) {
                        case 'Derecha': offX = 30; break;
                        case 'Izquierda': offX = -30; break;
                        case 'Arriba': offY = -30; break;
                        case 'Abajo': offY = 30; break;
                    }
                    const cx = demonlord.x + offX, cy = demonlord.y + offY;
                    const golpeado = Math.abs(closest.x - cx) < 25 && Math.abs(closest.y - cy) < 25;
                    io.emit('demonlordAttack', { targetId: closest.id, damage: damage, x: demonlord.x, y: demonlord.y, dir: demonlord.dir });
                    if (golpeado) {
                        damage = calcularDañoFinal(closest.id, CONFIG.DEMONLORD.ATTACK_DAMAGE, 'fisico');
                        const j = players[closest.id];
                        if (j && tieneHachaLegendaria(j)) {
                            j.contraGolpeContador = (j.contraGolpeContador || 0) + 1;
                            j.contraGolpeDañoAcumulado = (j.contraGolpeDañoAcumulado || 0) + damage;
                            if (j.contraGolpeContador >= 10) {
                                j.contraGolpeBonus = Math.floor(j.contraGolpeDañoAcumulado * 0.15);
                                j.contraGolpeCargado = true;
                                io.emit('contraGolpeCargado', { playerId: j.id });
                                j.contraGolpeContador = 0;
                                j.contraGolpeDañoAcumulado = 0;
                                io.to(j.id).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `⚔️ ¡Contra-golpe listo! +${j.contraGolpeBonus} de daño.` });
                            }
                        }
                        closest.hp = Math.max(0, closest.hp - damage);
                        io.emit('playerStatsUpdate', { id: closest.id, hp: closest.hp });
                        io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: damage, hp: demonlord.hp });
                    }
                    if (closest.hp <= 0) {
                        closest.isAlive = false;
                        io.emit('playerDeath', { id: closest.id, name: closest.name });
                        setTimeout(() => revivirJugador(closest.id), CONFIG.PLAYER.RESPAWN_TIME);
                    }
                } else {
                    closest.hp = Math.max(0, closest.hp - damage);
                    io.emit('enemyDamaged', { id: closest.id, x: closest.x, y: closest.y, dmg: damage });
                    if (closest.hp <= 0) {
                        closest.isAlive = false;
                        io.emit('esqueletoDeath', { id: closest.id, x: closest.x, y: closest.y, exp: CONFIG.SKELETON.EXP, attackers: ['demonlord'], dir: closest.dir || 'Abajo' });
                    }
                }
            }, 300);
        }
    } else {
        io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: false });
    }
    if (demonlord.attackCooldown > 0) demonlord.attackCooldown -= 100;
}, 100);

// ============================================
// MOVIMIENTO Y ATAQUE DE ESQUELETOS
// ============================================
setInterval(() => {
    esqueletos.forEach(e => {
        if (!e.isAlive) return;

        // ✅ ESQUELETOS ALIADOS
        if (e.isAlly) {
            let closest = null, closestDist = Infinity;
            if (demonlord && demonlord.isAlive) {
                let d = getDistance(e.x, e.y, demonlord.x, demonlord.y);
                if (d < CONFIG.SKELETON.VISION_RANGE) { closestDist = d; closest = demonlord; }
            }
            for (let oe of esqueletos) {
                if (oe.isAlive && !oe.isAlly && oe.id !== e.id) {
                    let d = getDistance(e.x, e.y, oe.x, oe.y);
                    if (d < closestDist && d < CONFIG.SKELETON.VISION_RANGE) { closestDist = d; closest = oe; }
                }
            }
            if (!closest) {
                // ✅ Seguir al dueño si no hay enemigos
                const owner = players[e.ownerId];
                if (owner && owner.isAlive) {
                    const d = getDistance(e.x, e.y, owner.x, owner.y);
                    if (d > 80) {
                        const dx = owner.x - e.x, dy = owner.y - e.y;
                        const moveX = (dx / d) * CONFIG.SKELETON.SPEED;
                        const moveY = (dy / d) * CONFIG.SKELETON.SPEED;
                        e.x = Math.min(Math.max(e.x + moveX, 50), 2950);
                        e.y = Math.min(Math.max(e.y + moveY, 50), 2950);
                        if (Math.abs(dx) > Math.abs(dy)) e.dir = dx > 0 ? 'Derecha' : 'Izquierda';
                        else e.dir = dy > 0 ? 'Abajo' : 'Arriba';
                        io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: true });
                    } else {
                        io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false });
                    }
                } else {
                    io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false });
                }
                return;
            }
            const dx = closest.x - e.x, dy = closest.y - e.y, dist = Math.hypot(dx, dy);
            if (dist > 35) {
                const moveX = (dx / dist) * CONFIG.SKELETON.SPEED;
                const moveY = (dy / dist) * CONFIG.SKELETON.SPEED;
                e.x = Math.min(Math.max(e.x + moveX, 50), 2950);
                e.y = Math.min(Math.max(e.y + moveY, 50), 2950);
                if (Math.abs(dx) > Math.abs(dy)) e.dir = dx > 0 ? 'Derecha' : 'Izquierda';
                else e.dir = dy > 0 ? 'Abajo' : 'Arriba';
                io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: true });
            } else {
                io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false });
            }
            if (e.attackCooldown <= 0 && closestDist < 45) {
                e.attackCooldown = CONFIG.SKELETON.ATTACK_COOLDOWN;
                let damage = CONFIG.SKELETON.ATTACK_DAMAGE + (e.damageBonus || 0);
                if (closest.id === 'demonlord') {
                    demonlord.hp = Math.max(0, demonlord.hp - damage);
                    io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: damage });
                    if (demonlord.hp <= 0) {
                        demonlord.isAlive = false;
                        io.emit('demonlordDeath', { x: demonlord.x, y: demonlord.y });
                        setTimeout(() => {
                            demonlord.hp = CONFIG.DEMONLORD.MAX_HP;
                            demonlord.isAlive = true;
                            demonlord.x = 1500; demonlord.y = 1500;
                            io.emit('demonlordRespawn', { x: demonlord.x, y: demonlord.y });
                        }, CONFIG.DEMONLORD.RESPAWN_TIME);
                    }
                } else if (closest.isAlive && !closest.isAlly) {
                    closest.hp = Math.max(0, closest.hp - damage);
                    io.emit('enemyDamaged', { id: closest.id, x: closest.x, y: closest.y, dmg: damage });
                    if (closest.hp <= 0) {
                        closest.isAlive = false;
                        io.emit('esqueletoDeath', { id: closest.id, x: closest.x, y: closest.y, exp: CONFIG.SKELETON.EXP, attackers: [e.ownerId || 'esqueleto_aliado'], dir: closest.dir || 'Abajo' });
                    }
                }
                io.emit('esqueletoAttackAnim', { id: e.id, targetId: closest.id, damage: damage, x: e.x, y: e.y, dir: e.dir });
            }
            if (e.attackCooldown > 0) e.attackCooldown -= 100;
            return;
        }

        // ✅ ESQUELETOS ENEMIGOS
        let closest = null, closestDist = Infinity;
        for (let id in players) {
            let p = players[id];
            if (p && p.isAlive) {
                let d = getDistance(e.x, e.y, p.x, p.y);
                if (d < closestDist && d < CONFIG.SKELETON.VISION_RANGE) { closestDist = d; closest = p; }
            }
        }
        if (!closest && demonlord && demonlord.isAlive) {
            let d = getDistance(e.x, e.y, demonlord.x, demonlord.y);
            if (d < CONFIG.SKELETON.VISION_RANGE) { closest = demonlord; closestDist = d; }
        }
        if (!closest) {
            for (let oe of esqueletos) {
                if (oe.isAlive && oe.isAlly && oe.id !== e.id) {
                    let d = getDistance(e.x, e.y, oe.x, oe.y);
                    if (d < closestDist && d < CONFIG.SKELETON.VISION_RANGE) { closestDist = d; closest = oe; }
                }
            }
        }
        if (!closest) { io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false }); return; }
        const dx = closest.x - e.x, dy = closest.y - e.y, dist = Math.hypot(dx, dy);
        if (dist > 35) {
            const moveX = (dx / dist) * CONFIG.SKELETON.SPEED;
            const moveY = (dy / dist) * CONFIG.SKELETON.SPEED;
            e.x = Math.min(Math.max(e.x + moveX, 50), 2950);
            e.y = Math.min(Math.max(e.y + moveY, 50), 2950);
            if (Math.abs(dx) > Math.abs(dy)) e.dir = dx > 0 ? 'Derecha' : 'Izquierda';
            else e.dir = dy > 0 ? 'Abajo' : 'Arriba';
            io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: true });
        } else {
            io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false });
        }
        if (e.attackCooldown <= 0 && closestDist < 45) {
            e.attackCooldown = CONFIG.SKELETON.ATTACK_COOLDOWN;
            let dañoBase = CONFIG.SKELETON.ATTACK_DAMAGE + (e.damageBonus || 0);
            let damage;
            if (players[closest.id]) {
                damage = calcularDañoFinal(closest.id, dañoBase, 'fisico');
                const j = players[closest.id];
                if (j && tieneHachaLegendaria(j)) {
                    j.contraGolpeContador = (j.contraGolpeContador || 0) + 1;
                    j.contraGolpeDañoAcumulado = (j.contraGolpeDañoAcumulado || 0) + damage;
                    if (j.contraGolpeContador >= 10) {
                        j.contraGolpeBonus = Math.floor(j.contraGolpeDañoAcumulado * 0.15);
                        j.contraGolpeCargado = true;
                        io.emit('contraGolpeCargado', { playerId: j.id });
                        j.contraGolpeContador = 0;
                        j.contraGolpeDañoAcumulado = 0;
                        io.to(j.id).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `⚔️ ¡Contra-golpe listo! +${j.contraGolpeBonus} de daño.` });
                    }
                }
                closest.hp = Math.max(0, closest.hp - damage);
                io.emit('playerStatsUpdate', { id: closest.id, hp: closest.hp });
            } else if (closest.id === 'demonlord') {
                damage = dañoBase;
                closest.hp = Math.max(0, closest.hp - damage);
            } else if (closest.isAlly) {
                damage = dañoBase;
                closest.hp = Math.max(0, closest.hp - damage);
                io.emit('enemyDamaged', { id: closest.id, x: closest.x, y: closest.y, dmg: damage });
                if (closest.hp <= 0) {
                    closest.isAlive = false;
                    io.emit('esqueletoDeath', { id: closest.id, x: closest.x, y: closest.y, exp: 0, attackers: [], dir: closest.dir || 'Abajo' });
                }
            }
            io.emit('esqueletoAttackAnim', { id: e.id, targetId: closest.id, damage: damage, x: e.x, y: e.y, dir: e.dir });
            io.emit('enemyDamaged', { id: closest.id, x: closest.x, y: closest.y, dmg: damage });
            if (closest.hp <= 0) {
                if (closest.id === 'demonlord') {
                    closest.isAlive = false;
                    io.emit('demonlordDeath', { x: closest.x, y: closest.y });
                    setTimeout(() => {
                        demonlord.hp = CONFIG.DEMONLORD.MAX_HP;
                        demonlord.isAlive = true;
                        demonlord.x = 1500;
                        demonlord.y = 1500;
                        io.emit('demonlordRespawn', { x: demonlord.x, y: demonlord.y });
                    }, CONFIG.DEMONLORD.RESPAWN_TIME);
                } else if (players[closest.id]) {
                    closest.isAlive = false;
                    io.emit('playerDeath', { id: closest.id, name: closest.name });
                    setTimeout(() => revivirJugador(closest.id), CONFIG.PLAYER.RESPAWN_TIME);
                }
            }
        }
        if (e.attackCooldown > 0) e.attackCooldown -= 100;
    });
}, 150);

setInterval(() => { const vivos = esqueletos.filter(e => e.isAlive).length; console.log(`🦴 Esqueletos vivos: ${vivos}/50`); }, 10000);
setInterval(() => { if (demonlord.isAlive && Math.random() < 0.3) io.emit('demonlordAtkVisual', { dir: demonlord.dir, esFuerte: Math.random() < 0.3 }); }, 2000);

const PORT = process.env.PORT || 10000;
http.listen(PORT, '0.0.0.0', () => console.log(`🔥 DEVILAND - Puerto ${PORT}`));