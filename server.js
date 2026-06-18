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
        barbaro: { fuerza: 18, defensaFisica: 10, defensaMagica: 0, agilidad: 8, vitalidad: 12, attackSpeed: 0.7, baseDamage: 60, mana: 50, velocidad: 120 },
        caballero: { fuerza: 12, defensaFisica: 15, defensaMagica: 0, agilidad: 8, vitalidad: 14, attackSpeed: 0.9, baseDamage: 45, mana: 60, velocidad: 130 },
        warrior: { fuerza: 10, defensaFisica: 10, defensaMagica: 0, agilidad: 15, vitalidad: 10, attackSpeed: 1.0, baseDamage: 50, mana: 60, velocidad: 150 },
        mago: { fuerza: 5, defensaFisica: 0, defensaMagica: 40, agilidad: 12, vitalidad: 8, attackSpeed: 0.7, baseDamage: 35, mana: 150, velocidad: 180 },
        necromancer: { fuerza: 5, defensaFisica: 0, defensaMagica: 40, agilidad: 10, vitalidad: 10, attackSpeed: 0.7, baseDamage: 35, mana: 150, velocidad: 180 }
    }},
    ROCAS: { CANTIDAD_INICIAL: 20, MAX_POR_JUGADOR: 50, RESPAWN_TIME: 30000 }
};

app.use(express.static(__dirname));
app.use('/ui', express.static(path.join(__dirname, 'ui')));
app.use('/skills', express.static(path.join(__dirname, 'skills')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let players = {};
let ultimoAtaque = new Map();
let demonlord = { id: 'demonlord', x: 1500, y: 1500, hp: CONFIG.DEMONLORD.MAX_HP, maxHp: CONFIG.DEMONLORD.MAX_HP, isAlive: true, dir: 'Abajo', attackCooldown: 0, attackers: [], isAttacking: false, currentTarget: null, aturdido: false };
let esqueletos = [];
let arboles = [];
let rocas = [];
let inventariosJugadores = {};
let nextSkeletonId = 100;
let skillCooldowns = {};
let teams = {};
let playerTeam = {};
let invitacionesPendientes = {};
let estadosAlterados = {};

function getDistance(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

function getPlayerDefenseFisica(playerId) {
    const j = players[playerId];
    if (!j) return 0;
    const inv = inventariosJugadores[playerId];
    if (!inv) return 0;
    let def = 0;
    const statsBase = CONFIG.PLAYER.BASE_STATS[j.class] || CONFIG.PLAYER.BASE_STATS.warrior;
    def += statsBase.defensaFisica || 0;
    const vitalidad = Math.floor(j.stats?.vitalidad || 0);
    def += Math.floor(vitalidad * 0.5);
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
    return Math.max(0, def);
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
    return Math.max(0, def);
}

function calcularPoderJugador(playerId) {
    const j = players[playerId];
    if (!j) return 0;
    let ataqueFisico = j.ataqueFisico || 0;
    let ataqueMagico = 0;
    let defensaFisica = getPlayerDefenseFisica(playerId);
    let defensaMagica = getPlayerDefensaMagica(playerId);
    let hpMax = j.maxHp || 500;
    let manaMax = j.maxMana || 100;
    let velocidad = 150;
    const statsBase = CONFIG.PLAYER.BASE_STATS[j.class] || CONFIG.PLAYER.BASE_STATS.warrior;
    velocidad = statsBase.velocidad || 150;
    const inv = inventariosJugadores[playerId];
    if (inv) {
        const armaId = j.equipamiento?.arma;
        if (armaId) {
            const arma = inv.items.find(i => i.id === armaId);
            if (arma) { 
                ataqueFisico += arma.ataqueFisico || 0; 
                ataqueMagico += arma.ataqueMagico || 0; 
                velocidad += arma.velocidad || 0;
                if (arma.dañoFuego) ataqueMagico += arma.dañoFuego;
                if (arma.dañoLuz) ataqueMagico += arma.dañoLuz;
                if (arma.manaBonus) manaMax += arma.manaBonus;
            }
        }
        const escudoId = j.equipamiento?.escudo;
        if (escudoId) {
            const escudo = inv.items.find(i => i.id === escudoId);
            if (escudo) { defensaFisica += escudo.defensaFisica || 0; defensaMagica += escudo.defensaMagica || 0; velocidad += escudo.velocidad || 0; }
        }
        const armaduraId = j.equipamiento?.armadura;
        if (armaduraId) {
            const armadura = inv.items.find(i => i.id === armaduraId);
            if (armadura) { defensaFisica += armadura.defensaFisica || 0; defensaMagica += armadura.defensaMagica || 0; velocidad += armadura.velocidad || 0; }
        }
    }
    if (j.stats) {
        ataqueFisico += (j.stats.fuerza || 0) * 1.5;
        ataqueMagico += (j.stats.inteligencia || 0) * 1.5;
        hpMax += (j.stats.vitalidad || 0) * 10;
        manaMax += (j.stats.sabiduria || 0) * 10;
        velocidad += (j.stats.agilidad || 0) * 1.5;
    }
    const nivel = j.level || 1;
    const poder = Math.floor((ataqueFisico * 2) + (ataqueMagico * 2) + (defensaFisica * 1.5) + (defensaMagica * 1.5) + (hpMax * 0.5) + (manaMax * 0.2) + (velocidad * 0.3) + (nivel * 10));
    return Math.max(1, poder);
}

function obtenerTop10() {
    const ranking = [];
    for (let id in players) {
        const j = players[id];
        if (j && j.isAlive !== false) {
            ranking.push({ id: id, nombre: j.name, clase: j.className, nivel: j.level || 1, poder: calcularPoderJugador(id) });
        }
    }
    ranking.sort((a, b) => b.poder - a.poder);
    return ranking.slice(0, 10);
}

function calcularDañoFinal(objetivoId, dañoBase, tipo = 'fisico', elemento = null) {
    const j = players[objetivoId];
    let daño = dañoBase;
    
    // Buscar Caballeros aliados en rango con sacrificio
    const tid = playerTeam[objetivoId];
    if (tid && teams[tid]) {
        const team = teams[tid];
        let caballeroCercano = null;
        let menorDistancia = Infinity;
        
        team.miembros.forEach(m => {
            if (m !== objetivoId && players[m] && players[m].className === 'CABALLERO' && players[m].isAlive) {
                const cab = players[m];
                if (cab.stats && cab.stats.sacrificio > 0) {
                    const rango = 50 + (cab.stats.sacrificio || 0);
                    const dist = getDistance(j.x, j.y, cab.x, cab.y);
                    if (dist < rango && dist < menorDistancia) {
                        menorDistancia = dist;
                        caballeroCercano = cab;
                    }
                }
            }
        });
        
        if (caballeroCercano) {
            const dañoAbsorbido = Math.floor(daño * 0.15);
            if (dañoAbsorbido > 0) {
                caballeroCercano.hp = Math.max(0, caballeroCercano.hp - dañoAbsorbido);
                daño = Math.max(1, daño - dañoAbsorbido);
                io.emit('playerStatsUpdate', { id: caballeroCercano.id, hp: caballeroCercano.hp });
                io.to(caballeroCercano.id).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🛡️ Sacrificio: absorbiste ${dañoAbsorbido} de daño de ${j.name}` });
                io.to(objetivoId).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🛡️ ${caballeroCercano.name} absorbió ${dañoAbsorbido} de daño por ti` });
            }
        }
    }
    
    let defensa = 0;
    if (tipo === 'fisico') {
        defensa = getPlayerDefenseFisica(objetivoId);
    } else if (tipo === 'magico' && elemento) {
        switch(elemento) {
            case 'fuego': defensa = j?.stats?.defFuego || 0; break;
            case 'agua': defensa = j?.stats?.defAgua || 0; break;
            case 'viento': defensa = j?.stats?.defViento || 0; break;
            case 'rayo': defensa = j?.stats?.defRayo || 0; break;
            case 'luz': defensa = j?.stats?.defLuz || 0; break;
            case 'oscuridad': defensa = j?.stats?.defOscuridad || 0; break;
            default: defensa = 0;
        }
    } else {
        defensa = getPlayerDefensaMagica(objetivoId);
    }
    if (defensa < 0) defensa = 0;
    return Math.floor(Math.max(1, daño - defensa));
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
    j.hp = j.maxHp || CONFIG.PLAYER.MAX_HP;
    j.mana = (CONFIG.PLAYER.BASE_STATS[j.class]?.mana || 100);
    j.x = 512;
    j.y = 470;
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
    hachadehierroleg: { nombre: 'Hacha Legendaria', tipo: 'espada', icono: 'hachadehierroleg_img', stats: { ataqueFisico: 250, velocidad: -50 }, calidad: 'LEGENDARIA', dropChance: 0.001, textoDorado: true, lootIndicator: 'yellow', efectoEspecial: 'contraGolpe' },
    
    // ============================================
    // NUEVOS ITEMS: BASTONES
    // ============================================
    bastondefuego: { 
        nombre: 'Bastón de Fuego', 
        tipo: 'arma_magica', 
        icono: 'bastondefuego_img', 
        stats: { dañoFuego: 15, manaBonus: 50, velocidad: 0 }, 
        calidad: '', 
        dropChance: 0.0, 
        textoVerde: false,
        clasePermitida: ['MAGO', 'NECROMANCER']
    },
    bastondefuego_1: { 
        nombre: 'Bastón de Fuego+', 
        tipo: 'arma_magica', 
        icono: 'bastondefuego_img', 
        stats: { dañoFuego: 25, manaBonus: 65, velocidad: 0 }, 
        calidad: '+', 
        dropChance: 0.08, 
        textoVerde: false,
        clasePermitida: ['MAGO', 'NECROMANCER']
    },
    bastondefuego_2: { 
        nombre: 'Bastón de Fuego++', 
        tipo: 'arma_magica', 
        icono: 'bastondefuego_img', 
        stats: { dañoFuego: 40, manaBonus: 85, velocidad: 0 }, 
        calidad: '++', 
        dropChance: 0.03, 
        textoVerde: false,
        clasePermitida: ['MAGO', 'NECROMANCER']
    },
    bastondefuego_3: { 
        nombre: 'Bastón de Fuego+++', 
        tipo: 'arma_magica', 
        icono: 'bastondefuego_img', 
        stats: { dañoFuego: 60, manaBonus: 110, velocidad: 0 }, 
        calidad: '+++', 
        dropChance: 0.01, 
        textoVerde: true,
        clasePermitida: ['MAGO', 'NECROMANCER']
    },
    bastondefuegoleg: { 
        nombre: 'Bastón de Fuego Legendario', 
        tipo: 'arma_magica', 
        icono: 'bastondefuegoleg_img', 
        stats: { dañoFuego: 500, manaBonus: 500, velocidad: -10 }, 
        calidad: 'LEGENDARIA', 
        dropChance: 0.001, 
        textoDorado: true,
        lootIndicator: 'yellow',
        clasePermitida: ['MAGO', 'NECROMANCER'],
        efectoEspecial: 'quemadura'
    },
    bastonderayo: { 
        nombre: 'Bastón de Rayo', 
        tipo: 'arma_magica', 
        icono: 'bastonderayo_img', 
        stats: { dañoLuz: 15, manaBonus: 50, velocidad: 0 }, 
        calidad: '', 
        dropChance: 0.0, 
        textoVerde: false,
        clasePermitida: ['MAGO', 'NECROMANCER']
    },
    bastonderayo_1: { 
        nombre: 'Bastón de Rayo+', 
        tipo: 'arma_magica', 
        icono: 'bastonderayo_img', 
        stats: { dañoLuz: 25, manaBonus: 65, velocidad: 0 }, 
        calidad: '+', 
        dropChance: 0.08, 
        textoVerde: false,
        clasePermitida: ['MAGO', 'NECROMANCER']
    },
    bastonderayo_2: { 
        nombre: 'Bastón de Rayo++', 
        tipo: 'arma_magica', 
        icono: 'bastonderayo_img', 
        stats: { dañoLuz: 40, manaBonus: 85, velocidad: 0 }, 
        calidad: '++', 
        dropChance: 0.03, 
        textoVerde: false,
        clasePermitida: ['MAGO', 'NECROMANCER']
    },
    bastonderayo_3: { 
        nombre: 'Bastón de Rayo+++', 
        tipo: 'arma_magica', 
        icono: 'bastonderayo_img', 
        stats: { dañoLuz: 60, manaBonus: 110, velocidad: 0 }, 
        calidad: '+++', 
        dropChance: 0.01, 
        textoVerde: true,
        clasePermitida: ['MAGO', 'NECROMANCER']
    },
    bastonderayoleg: { 
        nombre: 'Bastón de Rayo Legendario', 
        tipo: 'arma_magica', 
        icono: 'bastonderayoleg_img', 
        stats: { dañoLuz: 500, manaBonus: 500, velocidad: -10 }, 
        calidad: 'LEGENDARIA', 
        dropChance: 0.001, 
        textoDorado: true,
        lootIndicator: 'yellow',
        clasePermitida: ['MAGO', 'NECROMANCER'],
        efectoEspecial: 'aturdimiento'
    }
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
            id: 'esqueleto_' + (nextSkeletonId++), x: Math.random() * 2800 + 100, y: Math.random() * 2800 + 100,
            hp: CONFIG.SKELETON.MAX_HP, maxHp: CONFIG.SKELETON.MAX_HP, isAlive: true, isAlly: false,
            ownerId: null, targetId: null, targetType: null, dir: 'Abajo', attackCooldown: 0,
            damageBonus: 0, baseDamage: CONFIG.SKELETON.ATTACK_DAMAGE, attackers: [], aturdido: false
        });
    }
    console.log(`💀 Generados ${esqueletos.length} esqueletos`);
    return esqueletos;
}

function dropearItem(x, y, itemId) {
    const item = ITEMS_DATA[itemId];
    if (!item) return;
    io.emit('dropItem', {
        x, y, itemId, nombre: item.nombre, tipo: item.tipo, icono: item.icono,
        stats: item.stats, calidad: item.calidad || '', textoVerde: item.textoVerde || false,
        textoDorado: item.textoDorado || false, lootIndicator: item.lootIndicator || 'white'
    });
}

function tieneHachaLegendaria(jugador) {
    if (!jugador) return false;
    const armaId = jugador.equipamiento?.arma;
    if (armaId && armaId.includes('hachadehierroleg')) return true;
    const inventario = inventariosJugadores[jugador.id];
    if (inventario && inventario.items) {
        const itemArma = inventario.items.find(i => i.id === armaId);
        if (itemArma && (itemArma.idBase === 'hachadehierroleg' || (itemArma.id && itemArma.id.includes('hachadehierroleg')) || itemArma.nombre === 'Hacha Legendaria')) return true;
    }
    return false;
}

// ============================================
// SISTEMA DE ESTADOS ALTERADOS
// ============================================
function aplicarQuemadura(objetivoId, dañoFuegoTotal, duracionSegundos = 5) {
    if (!estadosAlterados[objetivoId]) estadosAlterados[objetivoId] = {};
    const dañoPorTick = Math.floor(dañoFuegoTotal * 0.1);
    estadosAlterados[objetivoId].quemadura = {
        daño: dañoPorTick,
        fin: Date.now() + (duracionSegundos * 1000)
    };
    // Buscar coordenadas del objetivo
    let ox = 0, oy = 0;
    const obj = esqueletos.find(e => e.id === objetivoId);
    if (obj) { ox = obj.x; oy = obj.y; }
    else if (objetivoId === 'demonlord') { ox = demonlord.x; oy = demonlord.y; }
    
    io.emit('enemyDamaged', { id: objetivoId, x: ox, y: oy, dmg: dañoPorTick, tipo: 'quemadura' });
    io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🔥 ¡Quemadura! ${dañoPorTick} daño/s por ${duracionSegundos}s` });
    console.log(`🔥 Quemadura aplicada a ${objetivoId}: ${dañoPorTick} daño/tick por ${duracionSegundos}s`);
}

function aplicarAturdimiento(objetivoId, duracionSegundos = 5) {
    if (!estadosAlterados[objetivoId]) estadosAlterados[objetivoId] = {};
    estadosAlterados[objetivoId].aturdimiento = {
        fin: Date.now() + (duracionSegundos * 1000)
    };
    const esqueleto = esqueletos.find(e => e.id === objetivoId && e.isAlive);
    if (esqueleto) {
        esqueleto.aturdido = true;
        io.emit('esqueletoMoved', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dir: esqueleto.dir, isMoving: false });
    }
    if (objetivoId === 'demonlord' && demonlord.isAlive) {
        demonlord.aturdido = true;
        io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: false });
    }
    console.log(`⚡ Aturdimiento aplicado a ${objetivoId} por ${duracionSegundos}s`);
}

function dañarEsqueleto(esqueleto, atacanteId, daño, elemento = null) {
    if (!esqueleto || !esqueleto.isAlive) return;
    
    const jugador = players[atacanteId];
    
    // DEBUG
    if (elemento) {
        console.log(`🧪 [DEBUG] elemento=${elemento} jugador=${jugador?.name} daño=${daño}`);
        console.log(`🧪 armaEquipada=${jugador?.equipamiento?.arma || 'ninguna'}`);
        const inv = inventariosJugadores[atacanteId];
        if (inv && jugador?.equipamiento?.arma) {
            const arma = inv.items.find(i => i.id === jugador.equipamiento.arma);
            console.log(`🧪 arma=${arma?.nombre} idBase=${arma?.idBase}`);
        }
    }
    
    // Verificar bastón de fuego legendario (quemadura)
    if (jugador && elemento === 'fuego') {
        const armaId = jugador.equipamiento?.arma;
        if (armaId) {
            const inv = inventariosJugadores[atacanteId];
            if (inv) {
                const arma = inv.items.find(i => i.id === armaId);
                if (arma && (arma.idBase === 'bastondefuegoleg' || arma.nombre === 'Bastón de Fuego Legendario')) {
                    console.log(`🧪 [QUEMADURA] ✅ Arma detectada, probando 15%...`);
                    if (Math.random() < 1) {
                        const dañoFuegoTotal = (jugador.stats?.atqFuego || 0) + 500;
                        console.log(`🧪 [QUEMADURA] ✅ APLICADA! dañoTotal=${dañoFuegoTotal}`);
                        aplicarQuemadura(esqueleto.id, dañoFuegoTotal, 5);
                        io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🔥 ¡${jugador.name} aplicó QUEMADURA!` });
                    } else {
                        console.log(`🧪 [QUEMADURA] ❌ No pasó el 15%`);
                    }
                } else {
                    console.log(`🧪 [QUEMADURA] ❌ Arma no es bastondefuegoleg. Es: ${arma?.idBase}`);
                }
            }
        }
    }
    
    // Verificar bastón de rayo legendario (aturdimiento)
    if (jugador && elemento === 'luz') {
        const armaId = jugador.equipamiento?.arma;
        if (armaId) {
            const inv = inventariosJugadores[atacanteId];
            if (inv) {
                const arma = inv.items.find(i => i.id === armaId);
                if (arma && (arma.idBase === 'bastonderayoleg' || arma.nombre === 'Bastón de Rayo Legendario')) {
                    console.log(`🧪 [ATURDIMIENTO] ✅ Arma detectada, probando 15%...`);
                    if (Math.random() < 0.15) {
                        console.log(`🧪 [ATURDIMIENTO] ✅ APLICADO!`);
                        aplicarAturdimiento(esqueleto.id, 5);
                        io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `⚡ ¡${jugador.name} aplicó ATURDIMIENTO!` });
                    } else {
                        console.log(`🧪 [ATURDIMIENTO] ❌ No pasó el 15%`);
                    }
                } else {
                    console.log(`🧪 [ATURDIMIENTO] ❌ Arma no es bastonderayoleg. Es: ${arma?.idBase}`);
                }
            }
        }
    }
    
    if (jugador && jugador.stats && jugador.stats.brutalidad > 0) {
        const knockback = 5 + (jugador.stats.brutalidad || 0) * 1.5;
        const angle = Math.atan2(esqueleto.y - jugador.y, esqueleto.x - jugador.x);
        esqueleto.x = Math.min(Math.max(esqueleto.x + Math.cos(angle) * knockback, 50), 2950);
        esqueleto.y = Math.min(Math.max(esqueleto.y + Math.sin(angle) * knockback, 50), 2950);
        io.emit('esqueletoMoved', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dir: esqueleto.dir, isMoving: true });
    }
    
    if (!esqueleto.attackers) esqueleto.attackers = [];
    if (!esqueleto.attackers.includes(atacanteId)) esqueleto.attackers.push(atacanteId);
    esqueleto.hp = Math.max(0, esqueleto.hp - daño);
    io.emit('enemyDamaged', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dmg: daño });
    
    if (esqueleto.hp <= 0) {
        esqueleto.isAlive = false;
        esqueletos.forEach(o => { if (o.isAlive && o.targetId === esqueleto.id) { o.targetId = null; o.targetType = null; } });
        if (players[atacanteId] && players[atacanteId].className === 'BARBARO') io.emit('barbaroAsesinato', { playerId: atacanteId });
        const team = playerTeam[atacanteId];
        let destinos = team && teams[team] ? teams[team].miembros : [atacanteId];
        if (Math.random() < 0.1) destinos.forEach(d => io.to(d).emit('dropPocion', { x: esqueleto.x, y: esqueleto.y, tipo: Math.random() < 0.5 ? 'hp' : 'mana', cantidad: 1 }));
        const dropRand = Math.random();
        let dropObtenido = false;
        for (const [id, data] of Object.entries(ITEMS_DATA)) {
            if (id !== 'hachadehierroleg' && id !== 'bastondefuegoleg' && id !== 'bastonderayoleg' && dropRand < data.dropChance && !dropObtenido) { 
                dropearItem(esqueleto.x, esqueleto.y, id); 
                dropObtenido = true; 
            }
        }
        if (esqueleto.attackers && esqueleto.attackers.length > 0) esqueleto.attackers.forEach(a => darExpAJugadorYEquipo(a, CONFIG.SKELETON.EXP));
        else darExpAJugadorYEquipo(atacanteId, CONFIG.SKELETON.EXP);
        io.emit('esqueletoDeath', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, exp: CONFIG.SKELETON.EXP, attackers: esqueleto.attackers || [], dir: esqueleto.dir || 'Abajo' });
        setTimeout(() => {
            if (!esqueleto.isAlive && !esqueleto.isAlly) {
                esqueleto.isAlive = true; esqueleto.hp = CONFIG.SKELETON.MAX_HP;
                esqueleto.x = Math.random() * 2800 + 100; esqueleto.y = Math.random() * 2800 + 100;
                esqueleto.attackers = []; esqueleto.targetId = null; esqueleto.targetType = null;
                esqueleto.attackCooldown = 0; esqueleto.dir = 'Abajo'; esqueleto.aturdido = false;
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

setInterval(() => { esqueletos.forEach(e => { if (!e.isAlly) e.damageBonus = 0; }); }, 1000);

// ============================================
// PROCESAR ESTADOS ALTERADOS
// ============================================
setInterval(() => {
    const ahora = Date.now();
    
    for (let id in estadosAlterados) {
        const estados = estadosAlterados[id];
        if (!estados) { delete estadosAlterados[id]; continue; }
        
        // Procesar quemadura
        if (estados.quemadura && estados.quemadura.fin > ahora) {
            let objetivo = esqueletos.find(e => e.id === id && e.isAlive);
            let esDemonlord = false;
            if (!objetivo && id === 'demonlord' && demonlord.isAlive) {
                objetivo = demonlord;
                esDemonlord = true;
            }
            
            if (objetivo) {
                objetivo.hp = Math.max(0, objetivo.hp - estados.quemadura.daño);
                io.emit('enemyDamaged', { 
                    id: id, 
                    x: objetivo.x, 
                    y: objetivo.y, 
                    dmg: estados.quemadura.daño,
                    tipo: 'quemadura'
                });
                
                if (objetivo.hp <= 0) {
                    if (esDemonlord) {
                        demonlord.isAlive = false;
                        demonlord.aturdido = false;
                        io.emit('demonlordDeath', { x: demonlord.x, y: demonlord.y, attackers: demonlord.attackers || [] });
                        setTimeout(() => {
                            demonlord.hp = CONFIG.DEMONLORD.MAX_HP;
                            demonlord.isAlive = true;
                            demonlord.x = 1500;
                            demonlord.y = 1500;
                            demonlord.attackers = [];
                            io.emit('demonlordRespawn', { x: demonlord.x, y: demonlord.y });
                        }, CONFIG.DEMONLORD.RESPAWN_TIME);
                    } else {
                        objetivo.isAlive = false;
                        objetivo.aturdido = false;
                        io.emit('esqueletoDeath', { 
                            id: objetivo.id, x: objetivo.x, y: objetivo.y, 
                            exp: CONFIG.SKELETON.EXP, attackers: objetivo.attackers || [], 
                            dir: objetivo.dir || 'Abajo' 
                        });
                        setTimeout(() => {
                            if (!objetivo.isAlive && !objetivo.isAlly) {
                                objetivo.isAlive = true;
                                objetivo.hp = CONFIG.SKELETON.MAX_HP;
                                objetivo.x = Math.random() * 2800 + 100;
                                objetivo.y = Math.random() * 2800 + 100;
                                objetivo.attackers = [];
                                objetivo.targetId = null;
                                objetivo.targetType = null;
                                objetivo.attackCooldown = 0;
                                objetivo.dir = 'Abajo';
                                io.emit('esqueletoNew', { id: objetivo.id, x: objetivo.x, y: objetivo.y });
                            }
                        }, CONFIG.SKELETON.RESPAWN_TIME);
                    }
                    delete estadosAlterados[id];
                }
            } else {
                delete estadosAlterados[id];
            }
        } else if (estados.quemadura) {
            delete estados.quemadura;
        }
        
        // Procesar aturdimiento
        if (estados.aturdimiento && estados.aturdimiento.fin <= ahora) {
            const esqueleto = esqueletos.find(e => e.id === id);
            if (esqueleto) esqueleto.aturdido = false;
            if (id === 'demonlord') demonlord.aturdido = false;
            delete estados.aturdimiento;
            io.emit('estadoTerminado', { id: id, tipo: 'aturdimiento' });
        }
        
        if (Object.keys(estados).length === 0) {
            delete estadosAlterados[id];
        }
    }
}, 1000);

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
        let atq = 15, hpInicial = 500;
        if (d.className === 'BARBARO') { atq = 80; hpInicial = 800; }
        else if (d.className === 'CABALLERO') { atq = 50; hpInicial = 500; }
        else if (d.className === 'WARRIOR') { atq = 50; hpInicial = 500; }
        else if (d.className === 'MAGO') { atq = 15; hpInicial = 300; }
        else if (d.className === 'NECROMANCER') { atq = 15; hpInicial = 300; }
        players[socket.id] = {
            id: socket.id, x: 512, y: 470, class: d.class, name: d.name, className: d.className,
            hp: hpInicial, maxHp: hpInicial, isAlive: true, deathCount: 0, deathPosition: null,
            team: 'Sin Team', level: 1, exp: 0, dir: 'Abajo',
            stats: { fuerza: bs.fuerza, defensaFisica: bs.defensaFisica, defensaMagica: bs.defensaMagica, agilidad: bs.agilidad, vitalidad: bs.vitalidad, puntosDisponibles: 5, defFuego: 0, defAgua: 0, defViento: 0, defRayo: 0, defLuz: 0, defOscuridad: 0, corte: 0, regeneracion: 0, destreza: 0, virtuoso: 0, brutalidad: 0, actoFugaz: 0, bendito: 0, sacrificio: 0, furia: 0, critico: 0, atqFuego: 0, atqAgua: 0, atqViento: 0, atqTierra: 0, atqLuz: 0, atqOscuridad: 0 },
            minerales: {}, equipamiento: { cabeza: null, pecho: null, piernas: null, pies: null, arma: null, escudo: null, ring1: null, ring2: null },
            mana: bs.mana || 100, maxMana: bs.mana || 100, esqueletosSummon: 0,
            skillsEquipadas: d.className === 'NECROMANCER' ? ['levantar_muerto', 'furia_necrotica', 'ataque_distancia'] : (d.className === 'MAGO' ? ['fireball'] : []),
            attackSpeedModifier: bs.attackSpeed || 1.0, baseDamage: bs.baseDamage || 50, ataqueFisico: atq,
            contraGolpeContador: 0, contraGolpeDañoAcumulado: 0, contraGolpeCargado: false, contraGolpeBonus: 0
        };
        if (!inventariosJugadores[socket.id]) inventariosJugadores[socket.id] = { items: [], equipamiento: {} };
        inventariosJugadores[socket.id].items.push({ id: 'pocion_1', tipo: 'pocion', nombre: 'Pocion de Vida', icono: 'pocion_img', cantidad: 2, slot: 0 });
        socket.emit('inventarioCompleto', inventariosJugadores[socket.id]);
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    socket.on('solicitarInventarioCompleto', () => {
        if (inventariosJugadores[socket.id]) socket.emit('inventarioCompleto', inventariosJugadores[socket.id]);
        else {
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
        if (data.equipamiento) j.equipamiento = data.equipamiento;
        if (data.playerStats) {
            const stats = data.playerStats;
            j.stats.vitalidad = Math.max(0, stats.vitalidad || 0);
            j.stats.fuerza = Math.max(0, stats.fuerza || 0);
            j.stats.inteligencia = Math.max(0, stats.inteligencia || 0);
            j.stats.agilidad = Math.max(0, stats.agilidad || 0);
            j.stats.sabiduria = Math.max(0, stats.sabiduria || 0);
            j.stats.corte = Math.max(0, stats.corte || 0);
            j.stats.regeneracion = Math.max(0, stats.regeneracion || 0);
            j.stats.destreza = Math.max(0, stats.destreza || 0);
            j.stats.virtuoso = Math.max(0, stats.virtuoso || 0);
            j.stats.brutalidad = Math.max(0, stats.brutalidad || 0);
            j.stats.actoFugaz = Math.max(0, stats.actoFugaz || 0);
            j.stats.bendito = Math.max(0, stats.bendito || 0);
            j.stats.sacrificio = Math.max(0, stats.sacrificio || 0);
            j.stats.furia = Math.max(0, stats.furia || 0);
            j.stats.critico = Math.max(0, stats.critico || 0);
            j.stats.atqFuego = Math.max(0, stats.atqFuego || 0);
            j.stats.atqAgua = Math.max(0, stats.atqAgua || 0);
            j.stats.atqViento = Math.max(0, stats.atqViento || 0);
            j.stats.atqTierra = Math.max(0, stats.atqTierra || 0);
            j.stats.atqLuz = Math.max(0, stats.atqLuz || 0);
            j.stats.atqOscuridad = Math.max(0, stats.atqOscuridad || 0);
            const bs = CONFIG.PLAYER.BASE_STATS[j.class] || CONFIG.PLAYER.BASE_STATS.warrior;
            j.maxHp = hpInicialDefault(j.className) + ((j.stats.vitalidad || 0) * 10);
            
            // Calcular maxMana con bonus de bastones
            let manaBase = bs.mana || 100;
            const inv = inventariosJugadores[socket.id];
            if (inv && j.equipamiento?.arma) {
                const arma = inv.items.find(i => i.id === j.equipamiento.arma);
                if (arma && arma.manaBonus) manaBase += arma.manaBonus;
            }
            j.maxMana = manaBase + ((j.stats.sabiduria || 0) * 10);
        }
    });

    function hpInicialDefault(className) {
        if (className === 'BARBARO') return 800;
        if (className === 'MAGO' || className === 'NECROMANCER') return 300;
        return 500;
    }

    socket.on('usarPocion', (data) => { const j = players[socket.id]; if (j) { j.hp = Math.min(j.maxHp, j.hp + (data.curacion || 20)); io.emit('playerStatsUpdate', { id: socket.id, hp: j.hp }); } });
    socket.on('usarPocionMana', (data) => { const j = players[socket.id]; if (j) { j.mana = Math.min(j.maxMana, j.mana + data.restauracion); io.emit('playerStatsUpdate', { id: socket.id, mana: j.mana }); } });

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
        if (j.contraGolpeCargado && j.contraGolpeBonus > 0) { dañoTotal += j.contraGolpeBonus; io.emit('contraGolpeActivado', { playerId: socket.id, x: j.x, y: j.y, bonus: j.contraGolpeBonus }); io.emit('contraGolpeUsado', { playerId: socket.id }); j.contraGolpeCargado = false; j.contraGolpeBonus = 0; }
        let esqCercano = null, distMin = 80;
        for (let e of esqueletos) { if (e.isAlive && !e.isAlly && getDistance(j.x, j.y, e.x, e.y) < distMin) { distMin = getDistance(j.x, j.y, e.x, e.y); esqCercano = e; } }
        if (esqCercano) dañarEsqueleto(esqCercano, socket.id, Math.floor(Math.max(1, dañoTotal)));
    });

    socket.on('esqueletoHit', (data) => {
        const j = players[socket.id];
        if (!j || !j.isAlive) return;
        let dañoTotal = data.damageBonus || 0;
        if (j.contraGolpeCargado && j.contraGolpeBonus > 0) { dañoTotal += j.contraGolpeBonus; io.emit('contraGolpeActivado', { playerId: socket.id, x: j.x, y: j.y, bonus: j.contraGolpeBonus }); io.emit('contraGolpeUsado', { playerId: socket.id }); j.contraGolpeCargado = false; j.contraGolpeBonus = 0; }
        let e = esqueletos.find(e => e.id === data.id && e.isAlive);
        if (e) dañarEsqueleto(e, socket.id, Math.floor(Math.max(1, dañoTotal)), data.elemento || null);
    });

    socket.on('playerMurio', (data) => {
        const j = players[data.id];
        if (j && j.isAlive) { j.isAlive = false; j.hp = 0; io.emit('playerDeath', { id: data.id, name: j.name }); esqueletos.forEach(e => { if (e.targetId === data.id) { e.targetId = null; e.targetType = null; } }); }
    });

    socket.on('playerRespawn', (data) => { if (data.id === socket.id) revivirJugador(socket.id); });

    socket.on('demonlordHit', (data) => {
        console.log('📡 [demonlordHit] data:', JSON.stringify(data));
        console.log('📡 [demonlordHit] elemento:', data.elemento);
        if (!demonlord.isAlive) return;
        const j = players[socket.id];
        if (!j || !j.isAlive) return;
        if (!demonlord.attackers) demonlord.attackers = [];
        if (!demonlord.attackers.includes(socket.id)) demonlord.attackers.push(socket.id);
        let dmg = Math.floor(data.damageBonus || j.ataqueFisico);
        if (data.esCritico) dmg *= 2;
        demonlord.hp = Math.max(0, demonlord.hp - dmg);
        io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: dmg, hp: demonlord.hp });
        
        // Verificar bastones legendarios contra Demonlord
        if (j && data.elemento === 'fuego') {
            const armaId = j.equipamiento?.arma;
            if (armaId) {
                const inv = inventariosJugadores[socket.id];
                if (inv) {
                    const arma = inv.items.find(i => i.id === armaId);
                    if (arma && (arma.idBase === 'bastondefuegoleg' || arma.nombre === 'Bastón de Fuego Legendario')) {
                        if (Math.random() < 0.15) {
                            const dañoFuegoTotal = (j.stats?.atqFuego || 0) + 500;
                            aplicarQuemadura('demonlord', dañoFuegoTotal, 5);
                            io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🔥 ¡${j.name} aplicó QUEMADURA al Demonlord!` });
                        }
                    }
                }
            }
        }
        if (j && data.elemento === 'luz') {
            const armaId = j.equipamiento?.arma;
            if (armaId) {
                const inv = inventariosJugadores[socket.id];
                if (inv) {
                    const arma = inv.items.find(i => i.id === armaId);
                    if (arma && (arma.idBase === 'bastonderayoleg' || arma.nombre === 'Bastón de Rayo Legendario')) {
                        if (Math.random() < 0.15) {
                            aplicarAturdimiento('demonlord', 5);
                            io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `⚡ ¡${j.name} aplicó ATURDIMIENTO al Demonlord!` });
                        }
                    }
                }
            }
        }
        
        if (demonlord.hp <= 0) {
            demonlord.isAlive = false;
            demonlord.aturdido = false;
            if (Math.random() < 0.0005) dropearItem(demonlord.x, demonlord.y, 'hachadehierroleg');
            if (Math.random() < 0.0005) dropearItem(demonlord.x + (Math.random() - 0.5) * 80, demonlord.y + (Math.random() - 0.5) * 80, 'bastondefuegoleg');
            if (Math.random() < 0.0005) dropearItem(demonlord.x + (Math.random() - 0.5) * 80, demonlord.y + (Math.random() - 0.5) * 80, 'bastonderayoleg');
            if (demonlord.attackers && demonlord.attackers.length > 0) demonlord.attackers.forEach(a => darExpAJugadorYEquipo(a, CONFIG.DEMONLORD.EXP));
            else darExpAJugadorYEquipo(socket.id, CONFIG.DEMONLORD.EXP);
            demonlord.attackers.forEach(a => {
                for (let i = 0; i < 20; i++) {
                    const ang = (i / 20) * Math.PI * 2;
                    const dist = 60 + Math.random() * 80;
                    io.to(a).emit('crearMonedaServidor', { x: demonlord.x + Math.cos(ang) * dist, y: demonlord.y + Math.sin(ang) * dist, cantidad: Math.floor(Math.random() * 50) + 20 });
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
                demonlord.aturdido = false;
                io.emit('demonlordRespawn', { x: demonlord.x, y: demonlord.y }); 
            }, CONFIG.DEMONLORD.RESPAWN_TIME);
        }
    });

    socket.on('solicitarDemonlordHP', () => {
        const j = players[socket.id];
        if (!j) return;
        const dist = getDistance(demonlord.x, demonlord.y, j.x, j.y);
        if (dist < CONFIG.DEMONLORD.VISION_RANGE + 100) socket.emit('demonlordHPResponse', { hp: demonlord.hp, maxHp: demonlord.maxHp, visible: true });
        else socket.emit('demonlordHPResponse', { visible: false });
    });

    socket.on('levantarEsqueleto', (data) => {
        const j = players[socket.id];
        if (!j || j.className !== 'NECROMANCER') { socket.emit('mensaje', '❌ Solo Necromancer'); return; }
        let cadaver = esqueletos.find(e => e.id === data.id && !e.isAlive && !e.isAlly);
        if (!cadaver) { socket.emit('mensaje', '❌ No hay cadaver'); return; }
        if (getDistance(j.x, j.y, cadaver.x, cadaver.y) > 100) { socket.emit('mensaje', '❌ Muy lejos'); return; }
        cadaver.isAlive = true; cadaver.isAlly = true; cadaver.ownerId = socket.id; cadaver.hp = cadaver.maxHp;
        cadaver.x = j.x + (Math.random() * 100 - 50); cadaver.y = j.y + (Math.random() * 100 - 50); cadaver.attackers = [];
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
        setTimeout(() => { esqueletos.filter(e => e.isAlly && e.ownerId === socket.id && e.isAlive).forEach(e => e.damageBonus = 0); io.emit('furiaNecroticaEnd', { playerId: socket.id }); }, 10000);
    });

    socket.on('crearProyectil', (data) => socket.broadcast.emit('proyectilCreado', data));
    socket.on('solicitarEsqueletos', () => { if (players[socket.id]) socket.emit('esqueletosIniciales', esqueletos.filter(e => e.isAlive === true)); });
    socket.on('solicitarRanking', () => { const ranking = obtenerTop10(); socket.emit('rankingTop10', { ranking: ranking }); });
    socket.on('solicitarInfoTeam', () => { const tid = playerTeam[socket.id]; if (tid && teams[tid]) { const team = teams[tid]; socket.emit('infoTeamRecibida', { enTeam: true, lider: players[team.lider]?.name || '???', miembros: team.miembros.map(m => players[m]?.name || '???') }); } else { socket.emit('infoTeamRecibida', { enTeam: false }); } });
    socket.on('solicitarPoder', () => { if (players[socket.id]) { const poder = calcularPoderJugador(socket.id); socket.emit('poderJugador', { poder: poder }); } });

    socket.on('chatMessage', (msg) => {
        const j = players[socket.id];
        if (!j) return;
        if (msg === '/hacha') { dropearItem(j.x, j.y, 'hachadehierroleg'); io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🗡️ ${j.name} invocó el Hacha Legendaria` }); return; }
        if (msg === '/bastonfuego') { dropearItem(j.x, j.y, 'bastondefuegoleg'); io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🔥 ${j.name} invocó el Bastón de Fuego Legendario` }); return; }
        if (msg === '/bastonrayo') { dropearItem(j.x, j.y, 'bastonderayoleg'); io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `⚡ ${j.name} invocó el Bastón de Rayo Legendario` }); return; }
        if (msg === '/ranking' || msg === '/top') { const ranking = obtenerTop10(); socket.emit('rankingTop10', { ranking: ranking }); return; }
        if (msg === '/poder' || msg === '/power') { const poder = calcularPoderJugador(socket.id); socket.emit('mensaje', `⚡ Tu poder de combate: ${poder}`); return; }
        if (msg.startsWith('/poder ')) {
            const nombre = msg.split(' ')[1];
            for (let id in players) { if (players[id].name.toLowerCase() === nombre.toLowerCase()) { const poder = calcularPoderJugador(id); socket.emit('mensaje', `⚡ Poder de ${players[id].name}: ${poder}`); return; } }
            socket.emit('mensaje', '❌ Jugador no encontrado'); return;
        }
        io.emit('chatMessage', { type: 'user', name: j.name, msg: msg });
    });

    socket.on('invitarJugador', (data) => {
        const j = players[socket.id];
        const objetivo = players[data.playerId];
        if (!j || !objetivo) { socket.emit('mensaje', '❌ Jugador no encontrado'); return; }
        if (!objetivo.isAlive) { socket.emit('mensaje', '❌ El jugador está muerto'); return; }
        invitacionesPendientes[data.playerId] = { de: socket.id, nombre: j.name, timestamp: Date.now() };
        io.to(data.playerId).emit('invitacionRecibida', { de: socket.id, nombre: j.name });
        socket.emit('mensaje', `📨 Invitación enviada a ${objetivo.name}`);
    });

    socket.on('aceptarInvitacion', (data) => {
   const invitacion = invitacionesPendientes[socket.id];
        if (!invitacion) { socket.emit('mensaje', '❌ No tenés invitaciones pendientes'); return; }
        const lider = players[invitacion.de];
        if (!lider) { socket.emit('mensaje', '❌ El jugador que te invitó ya no está'); delete invitacionesPendientes[socket.id]; return; }
        let teamId = playerTeam[invitacion.de];
        if (!teamId || !teams[teamId]) { teamId = 'team_' + Date.now(); teams[teamId] = { lider: invitacion.de, miembros: [invitacion.de], nombre: `Equipo de ${lider.name}` }; playerTeam[invitacion.de] = teamId; }
        if (!teams[teamId].miembros.includes(socket.id)) teams[teamId].miembros.push(socket.id);
        playerTeam[socket.id] = teamId;
        players[socket.id].team = teams[teamId].nombre;
        players[invitacion.de].team = teams[teamId].nombre;
        delete invitacionesPendientes[socket.id];
        teams[teamId].miembros.forEach(m => { io.to(m).emit('mensaje', `✅ ${players[socket.id].name} se unió al equipo`); });
        const teamActual = teams[teamId]; io.to(socket.id).emit('infoTeamRecibida', { enTeam: true, lider: players[teamActual.lider]?.name, miembros: teamActual.miembros.map(m => players[m]?.name) }); io.to(teamActual.lider).emit('infoTeamRecibida', { enTeam: true, lider: players[teamActual.lider]?.name, miembros: teamActual.miembros.map(m => players[m]?.name) });
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
        socket.emit('infoTeamRecibida', { enTeam: false }); if (team && team.miembros) { team.miembros.forEach(m => { if (players[m]) { io.to(m).emit('infoTeamRecibida', { enTeam: team.miembros.length > 0, lider: players[team.lider]?.name || '???', miembros: team.miembros.map(mi => players[mi]?.name || '???') }); } }); }
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
        setTimeout(() => { arbol.x = Math.random() * 2800 + 100; arbol.y = Math.random() * 2800 + 100; arbol.activo = true; io.emit('arbolRespawn', { id: arbol.id, x: arbol.x, y: arbol.y }); }, 15000);
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
        setTimeout(() => { const idx = rocas.findIndex(r => r.id === roca.id); if (idx !== -1) { rocas[idx].activo = true; rocas[idx].x = Math.random() * 2800 + 100; rocas[idx].y = Math.random() * 2800 + 100; io.emit('rocaRespawn', { id: rocas[idx].id, x: rocas[idx].x, y: rocas[idx].y }); } }, CONFIG.ROCAS.RESPAWN_TIME);
    });

    socket.on('equiparHachaLegendaria', () => { const j = players[socket.id]; if (j) { j.contraGolpeContador = 0; j.contraGolpeDañoAcumulado = 0; j.contraGolpeCargado = false; j.contraGolpeBonus = 0; io.emit('contraGolpeUsado', { playerId: socket.id }); } });
    socket.on('desequiparHachaLegendaria', () => { const j = players[socket.id]; if (j) { j.contraGolpeCargado = false; j.contraGolpeBonus = 0; io.emit('contraGolpeUsado', { playerId: socket.id }); } });

    socket.on('disconnect', () => {
        const tid = playerTeam[socket.id];
        if (tid && teams[tid]) { const team = teams[tid]; const idx = team.miembros.indexOf(socket.id); if (idx !== -1) team.miembros.splice(idx, 1); if (team.miembros.length === 0) delete teams[tid]; else if (team.lider === socket.id) team.lider = team.miembros[0]; }
        delete playerTeam[socket.id];
        delete players[socket.id];
        delete inventariosJugadores[socket.id];
        delete skillCooldowns[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// Limpiar invitaciones viejas
setInterval(() => { const ahora = Date.now(); for (let id in invitacionesPendientes) { if (ahora - invitacionesPendientes[id].timestamp > 30000) { io.to(id).emit('mensaje', '⏰ La invitación expiró'); delete invitacionesPendientes[id]; } } }, 30000);

// Mostrar ranking en consola
setInterval(() => { const ranking = obtenerTop10(); console.log('🏆 TOP 10 JUGADORES:'); ranking.forEach((j, i) => { console.log(`  ${i+1}. ${j.nombre} (${j.clase}) - Nivel ${j.nivel} - Poder: ${j.poder}`); }); }, 60000);

// ============================================
// MOVIMIENTO Y ATAQUE DEL DEMONLORD
// ============================================
setInterval(() => {
    if (!demonlord.isAlive) return;
    
    // Si está aturdido, no moverse
    if (demonlord.aturdido) {
        io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: false });
        return;
    }
    
    let closest = null, closestDist = Infinity;
    for (let id in players) { let p = players[id]; if (p && p.isAlive) { let d = getDistance(demonlord.x, demonlord.y, p.x, p.y); if (d < closestDist) { closestDist = d; closest = p; } } }
    if (!closest) { for (let e of esqueletos) { if (e.isAlive) { let d = getDistance(demonlord.x, demonlord.y, e.x, e.y); if (d < closestDist) { closestDist = d; closest = e; } } } }
    if (!closest) return;
    const dx = closest.x - demonlord.x, dy = closest.y - demonlord.y, dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > Math.abs(dy)) demonlord.dir = dx > 0 ? 'Derecha' : 'Izquierda';
    else demonlord.dir = dy > 0 ? 'Abajo' : 'Arriba';
    if (dist < 400) {
        if (dist > 70) {
            const moveX = (dx / dist) * CONFIG.DEMONLORD.SPEED, moveY = (dy / dist) * CONFIG.DEMONLORD.SPEED;
            demonlord.x = Math.min(Math.max(demonlord.x + moveX, 50), 2950);
            demonlord.y = Math.min(Math.max(demonlord.y + moveY, 50), 2950);
            io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: true });
        } else { io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: false }); }
        if (demonlord.attackCooldown <= 0 && dist < 70) {
            demonlord.attackCooldown = CONFIG.DEMONLORD.ATTACK_COOLDOWN;
            const isPlayer = players[closest.id] ? true : false;
            io.emit('demonlordAtkVisual', { dir: demonlord.dir, esFuerte: Math.random() < 0.2 });
            setTimeout(() => {
                if (!demonlord.isAlive || !closest) return;
                if (isPlayer && closest.hp <= 0) return;
                if (!isPlayer && !closest.isAlive) return;
                if (isPlayer) {
                    const jugadorObj = players[closest.id];
                    if (jugadorObj && jugadorObj.stats && jugadorObj.stats.destreza > 0) {
                        const esquivaChance = 5 + (jugadorObj.stats.destreza || 0);
                        if (Math.random() * 100 < esquivaChance) { io.to(closest.id).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `💨 ¡Esquivaste el ataque del Demonlord!` }); io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: 0, hp: demonlord.hp }); return; }
                    }
                    let offX = 0, offY = 0;
                    switch (demonlord.dir) { case 'Derecha': offX = 30; break; case 'Izquierda': offX = -30; break; case 'Arriba': offY = -30; break; case 'Abajo': offY = 30; break; }
                    const cx = demonlord.x + offX, cy = demonlord.y + offY;
                    const golpeado = Math.abs(closest.x - cx) < 25 && Math.abs(closest.y - cy) < 25;
                    io.emit('demonlordAttack', { targetId: closest.id, damage: Math.floor(CONFIG.DEMONLORD.ATTACK_DAMAGE), x: demonlord.x, y: demonlord.y, dir: demonlord.dir });
                    if (golpeado) {
                        let damage = calcularDañoFinal(closest.id, CONFIG.DEMONLORD.ATTACK_DAMAGE, 'fisico');
                        if (damage < 0) damage = 1;
                        const j = players[closest.id];
                        if (j && tieneHachaLegendaria(j)) { j.contraGolpeContador = (j.contraGolpeContador || 0) + 1; j.contraGolpeDañoAcumulado = (j.contraGolpeDañoAcumulado || 0) + damage; if (j.contraGolpeContador >= 10) { j.contraGolpeBonus = Math.floor(j.contraGolpeDañoAcumulado * 0.15); j.contraGolpeCargado = true; io.emit('contraGolpeCargado', { playerId: j.id }); j.contraGolpeContador = 0; j.contraGolpeDañoAcumulado = 0; io.to(j.id).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `⚔️ ¡Contra-golpe listo! +${j.contraGolpeBonus} de daño.` }); } }
                        closest.hp = Math.max(0, closest.hp - damage);
                        io.emit('playerStatsUpdate', { id: closest.id, hp: closest.hp });
                        io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: damage, hp: demonlord.hp });
                    }
                    if (closest.hp <= 0) { closest.isAlive = false; io.emit('playerDeath', { id: closest.id, name: closest.name }); setTimeout(() => revivirJugador(closest.id), CONFIG.PLAYER.RESPAWN_TIME); }
                } else {
                    closest.hp = Math.max(0, closest.hp - Math.floor(CONFIG.DEMONLORD.ATTACK_DAMAGE));
                    io.emit('enemyDamaged', { id: closest.id, x: closest.x, y: closest.y, dmg: Math.floor(CONFIG.DEMONLORD.ATTACK_DAMAGE) });
                    if (closest.hp <= 0) { closest.isAlive = false; io.emit('esqueletoDeath', { id: closest.id, x: closest.x, y: closest.y, exp: CONFIG.SKELETON.EXP, attackers: ['demonlord'], dir: closest.dir || 'Abajo' }); }
                }
            }, 300);
        }
    } else { io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: false }); }
    if (demonlord.attackCooldown > 0) demonlord.attackCooldown -= 100;
}, 100);

// ============================================
// MOVIMIENTO Y ATAQUE DE ESQUELETOS
// ============================================
setInterval(() => {
    esqueletos.forEach(e => {
        if (!e.isAlive) return;
        
        // Si está aturdido, no moverse
        if (e.aturdido) {
            io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false });
            return;
        }
        
        if (e.isAlly) {
            let closest = null, closestDist = Infinity;
            if (demonlord && demonlord.isAlive) { let d = getDistance(e.x, e.y, demonlord.x, demonlord.y); if (d < CONFIG.SKELETON.VISION_RANGE) { closestDist = d; closest = demonlord; } }
            for (let oe of esqueletos) { if (oe.isAlive && !oe.isAlly && oe.id !== e.id) { let d = getDistance(e.x, e.y, oe.x, oe.y); if (d < closestDist && d < CONFIG.SKELETON.VISION_RANGE) { closestDist = d; closest = oe; } } }
            if (!closest) {
                const owner = players[e.ownerId];
                if (owner && owner.isAlive) { const d = getDistance(e.x, e.y, owner.x, owner.y); if (d > 80) { const dx = owner.x - e.x, dy = owner.y - e.y; const moveX = (dx / d) * CONFIG.SKELETON.SPEED, moveY = (dy / d) * CONFIG.SKELETON.SPEED; e.x = Math.min(Math.max(e.x + moveX, 50), 2950); e.y = Math.min(Math.max(e.y + moveY, 50), 2950); if (Math.abs(dx) > Math.abs(dy)) e.dir = dx > 0 ? 'Derecha' : 'Izquierda'; else e.dir = dy > 0 ? 'Abajo' : 'Arriba'; io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: true }); } else { io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false }); } } else { io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false }); }
                return;
            }
            const dx = closest.x - e.x, dy = closest.y - e.y, dist = Math.hypot(dx, dy);
            if (dist > 35) { const moveX = (dx / dist) * CONFIG.SKELETON.SPEED, moveY = (dy / dist) * CONFIG.SKELETON.SPEED; e.x = Math.min(Math.max(e.x + moveX, 50), 2950); e.y = Math.min(Math.max(e.y + moveY, 50), 2950); if (Math.abs(dx) > Math.abs(dy)) e.dir = dx > 0 ? 'Derecha' : 'Izquierda'; else e.dir = dy > 0 ? 'Abajo' : 'Arriba'; io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: true }); } else { io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false }); }
            if (e.attackCooldown <= 0 && closestDist < 45) {
                e.attackCooldown = CONFIG.SKELETON.ATTACK_COOLDOWN;
                let damage = CONFIG.SKELETON.ATTACK_DAMAGE + (e.damageBonus || 0);
                if (closest.id === 'demonlord') { demonlord.hp = Math.max(0, demonlord.hp - damage); io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: damage }); if (demonlord.hp <= 0) { demonlord.isAlive = false; io.emit('demonlordDeath', { x: demonlord.x, y: demonlord.y }); setTimeout(() => { demonlord.hp = CONFIG.DEMONLORD.MAX_HP; demonlord.isAlive = true; demonlord.x = 1500; demonlord.y = 1500; io.emit('demonlordRespawn', { x: demonlord.x, y: demonlord.y }); }, CONFIG.DEMONLORD.RESPAWN_TIME); } }
                else if (closest.isAlive && !closest.isAlly) { closest.hp = Math.max(0, closest.hp - damage); io.emit('enemyDamaged', { id: closest.id, x: closest.x, y: closest.y, dmg: damage }); if (closest.hp <= 0) { closest.isAlive = false; io.emit('esqueletoDeath', { id: closest.id, x: closest.x, y: closest.y, exp: CONFIG.SKELETON.EXP, attackers: [e.ownerId || 'esqueleto_aliado'], dir: closest.dir || 'Abajo' }); } }
                io.emit('esqueletoAttackAnim', { id: e.id, targetId: closest.id, damage: damage, x: e.x, y: e.y, dir: e.dir });
            }
            if (e.attackCooldown > 0) e.attackCooldown -= 100;
            return;
        }
        let closest = null, closestDist = Infinity;
        for (let id in players) { let p = players[id]; if (p && p.isAlive) { let d = getDistance(e.x, e.y, p.x, p.y); if (d < closestDist && d < CONFIG.SKELETON.VISION_RANGE) { closestDist = d; closest = p; } } }
        if (!closest && demonlord && demonlord.isAlive) { let d = getDistance(e.x, e.y, demonlord.x, demonlord.y); if (d < CONFIG.SKELETON.VISION_RANGE) { closest = demonlord; closestDist = d; } }
        if (!closest) { for (let oe of esqueletos) { if (oe.isAlive && oe.isAlly && oe.id !== e.id) { let d = getDistance(e.x, e.y, oe.x, oe.y); if (d < closestDist && d < CONFIG.SKELETON.VISION_RANGE) { closestDist = d; closest = oe; } } } }
        if (!closest) { io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false }); return; }
        const dx = closest.x - e.x, dy = closest.y - e.y, dist = Math.hypot(dx, dy);
        if (dist > 35) { const moveX = (dx / dist) * CONFIG.SKELETON.SPEED, moveY = (dy / dist) * CONFIG.SKELETON.SPEED; e.x = Math.min(Math.max(e.x + moveX, 50), 2950); e.y = Math.min(Math.max(e.y + moveY, 50), 2950); if (Math.abs(dx) > Math.abs(dy)) e.dir = dx > 0 ? 'Derecha' : 'Izquierda'; else e.dir = dy > 0 ? 'Abajo' : 'Arriba'; io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: true }); } else { io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false }); }
        if (e.attackCooldown <= 0 && closestDist < 45) {
            e.attackCooldown = CONFIG.SKELETON.ATTACK_COOLDOWN;
            let dañoBase = CONFIG.SKELETON.ATTACK_DAMAGE;
            let damage;
            if (players[closest.id]) {
                damage = calcularDañoFinal(closest.id, dañoBase, 'fisico');
                const j = players[closest.id];
                if (j && tieneHachaLegendaria(j)) { j.contraGolpeContador = (j.contraGolpeContador || 0) + 1; j.contraGolpeDañoAcumulado = (j.contraGolpeDañoAcumulado || 0) + damage; if (j.contraGolpeContador >= 10) { j.contraGolpeBonus = Math.floor(j.contraGolpeDañoAcumulado * 0.15); j.contraGolpeCargado = true; io.emit('contraGolpeCargado', { playerId: j.id }); j.contraGolpeContador = 0; j.contraGolpeDañoAcumulado = 0; io.to(j.id).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `⚔️ ¡Contra-golpe listo! +${j.contraGolpeBonus} de daño.` }); } }
                closest.hp = Math.max(0, closest.hp - damage);
                io.emit('playerStatsUpdate', { id: closest.id, hp: closest.hp });
            } else if (closest.id === 'demonlord') { damage = dañoBase; closest.hp = Math.max(0, closest.hp - damage); }
            else if (closest.isAlly) { damage = dañoBase; closest.hp = Math.max(0, closest.hp - damage); io.emit('enemyDamaged', { id: closest.id, x: closest.x, y: closest.y, dmg: damage }); if (closest.hp <= 0) { closest.isAlive = false; io.emit('esqueletoDeath', { id: closest.id, x: closest.x, y: closest.y, exp: 0, attackers: [], dir: closest.dir || 'Abajo' }); } }
            io.emit('esqueletoAttackAnim', { id: e.id, targetId: closest.id, damage: Math.floor(damage), x: e.x, y: e.y, dir: e.dir });
            io.emit('enemyDamaged', { id: closest.id, x: closest.x, y: closest.y, dmg: Math.floor(damage) });
            if (closest.hp <= 0) {
                if (closest.id === 'demonlord') { closest.isAlive = false; io.emit('demonlordDeath', { x: closest.x, y: closest.y }); setTimeout(() => { demonlord.hp = CONFIG.DEMONLORD.MAX_HP; demonlord.isAlive = true; demonlord.x = 1500; demonlord.y = 1500; io.emit('demonlordRespawn', { x: demonlord.x, y: demonlord.y }); }, CONFIG.DEMONLORD.RESPAWN_TIME); }
                else if (players[closest.id]) { closest.isAlive = false; io.emit('playerDeath', { id: closest.id, name: closest.name }); setTimeout(() => revivirJugador(closest.id), CONFIG.PLAYER.RESPAWN_TIME); }
            }
        }
        if (e.attackCooldown > 0) e.attackCooldown -= 100;
    });
}, 150);

setInterval(() => { const vivos = esqueletos.filter(e => e.isAlive).length; console.log(`🦴 Esqueletos vivos: ${vivos}/50`); }, 10000);
setInterval(() => { if (demonlord.isAlive && Math.random() < 0.3) io.emit('demonlordAtkVisual', { dir: demonlord.dir, esFuerte: Math.random() < 0.3 }); }, 2000);
setInterval(() => { esqueletos.forEach(e => { if (!e.isAlly) e.damageBonus = 0; }); }, 1000);

const PORT = process.env.PORT || 10000;
http.listen(PORT, '0.0.0.0', () => console.log(`🔥 DEVILAND - Puerto ${PORT}`));