// ═══════════════════════════════════════════════════════════════
// ═══ PARTE 1/3 — SERVIDOR: CONFIG, ESTRUCTURAS, FUNCIONES BASE ═══
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

const CONFIG = {
    PORT: 10000,
    DEMONLORD: { MAX_HP: 5000, RESPAWN_TIME: 50000, SPEED: 6, ATTACK_COOLDOWN: 2000, ATTACK_DAMAGE: 200, VISION_RANGE: 400, EXP: 500 },
    SKELETON: { MAX_HP: 200, RESPAWN_TIME: 5000, SPEED: 6, ATTACK_COOLDOWN: 1000, ATTACK_DAMAGE: 30, VISION_RANGE: 400, EXP: 50, DEFENSE: 0 },
    PLAYER: { MAX_HP: 500, RESPAWN_TIME: 10000, BASE_STATS: {
        barbaro: { fuerza: 18, defensaFisica: 10, defensaMagica: 0, agilidad: 7, vitalidad: 12, attackSpeed: 0.7, baseDamage: 60, mana: 50, velocidad: 100 },
        caballero: { fuerza: 12, defensaFisica: 15, defensaMagica: 0, agilidad: 6, vitalidad: 14, attackSpeed: 0.9, baseDamage: 45, mana: 60, velocidad: 90 },
        warrior: { fuerza: 10, defensaFisica: 10, defensaMagica: 0, agilidad: 8, vitalidad: 10, attackSpeed: 1.0, baseDamage: 50, mana: 60, velocidad: 110 },
        mago: { fuerza: 5, defensaFisica: 0, defensaMagica: 40, agilidad: 7, vitalidad: 8, attackSpeed: 0.7, baseDamage: 35, mana: 150, velocidad: 100 },
        necromancer: { fuerza: 5, defensaFisica: 0, defensaMagica: 40, agilidad: 7, vitalidad: 10, attackSpeed: 0.7, baseDamage: 35, mana: 150, velocidad: 100 }
    }},
    ROCAS: { CANTIDAD_INICIAL: 20, MAX_POR_JUGADOR: 50, RESPAWN_TIME: 30000 },
    MINAS: { CANTIDAD_INICIAL: 15, RESPAWN_TIME: 60000 },
    MAPAS: { PRINCIPAL: { id: 'principal', width: 3000, height: 3000, groundTexture: 'suelo' }, NEVADO: { id: 'nevado', width: 3000, height: 800, groundTexture: 'suelo_nieve' } },
    INVOCADOR: { MAX_HP: 2500, SPEED: 5, SPEED_RUN: 9, VISION_RANGE: 600, SAFE_DISTANCE: 350, MAX_DISTANCE: 500, ATTACK_COOLDOWN: 3000, ATTACK_COOLDOWN_MELEE: 1500, ATTACK_DAMAGE: 60, MELEE_RANGE: 80, MAX_SKELETONS: 15, SUMMON_BATCH: 2, SUMMON_RADIUS: 100, FURIA_COOLDOWN: 20000, FURIA_DURATION: 10000, FURIA_MIN_SKELETONS: 5, FURIA_DAMAGE_PER_SKELETON: 0.10, FURIA_SPEED_PER_SKELETON: 0.05, HIT_THRESHOLD: 3, HIT_WINDOW: 2000, TELEPORT_MIN_DIST: 400, TELEPORT_MAX_DIST: 700, ESCAPE_RUN_DURATION: 1000, EXP: 300, DROP_ORO: { min: 20, max: 50 }, DROP_POCION_HP: 3, DROP_POCION_MANA: 3, DROP_ITEM_RARO: 0.15, DROP_BASTON_SANGRE: 0.0005, CANTIDAD: 2, RESPAWN_TIME: 60000, MAPA: 'principal' },
    // ═══ NUEVO: CONFIG DE PILARES Y LIGAS ═══
    PILARES: {
        HP_BASE: 1000,
        HP_REGEN_POR_MINUTO: 0.01,          // +1% HP por minuto
        COOLDOWN_CONQUISTA: 5 * 60 * 1000,  // 5 minutos
        VENTANA_RECUPERACION: 24 * 60 * 60 * 1000, // 24 horas
        RADIO_ALARMA: 800,                  // rango para detectar atacantes
        INTERVALO_ALARMA: 5000,             // cada 5s se repite la alarma
        ORO_EXTRA_POR_PILAR: 0.10,          // +10% oro por pilar
        PODER_EXTRA_POR_PILAR: 50,          // +50 poder por pilar
        BUFF_BASE: {
            rojo:     { tipo: 'daño',       valor: 0.05, desc: '+5% daño (físico o mágico según clase)' },
            azul:     { tipo: 'defFisica',  valor: 0.05, desc: '+5% defensa física' },
            verde:    { tipo: 'vida',       valor: 0.05, desc: '+5% vida máxima' },
            amarillo: { tipo: 'oro',        valor: 50,   desc: '+50 oro cada 30s (+50 por nivel de Buff)' }
        },
        COLORES: {
            rojo:     0xff0000,
            azul:     0x0066ff,
            verde:    0x00cc00,
            amarillo: 0xffcc00
        },
        POSICIONES: [
            { id: 'pilar_rojo',     color: 'rojo',     x: 400,  y: 400  },
            { id: 'pilar_azul',     color: 'azul',     x: 2600, y: 400  },
            { id: 'pilar_verde',    color: 'verde',    x: 400,  y: 2600 },
            { id: 'pilar_amarillo', color: 'amarillo', x: 2600, y: 2600 }
        ],
        MEJORAS: {
            vida: {
                nombre: 'Vida',
                niveles: [
                    { nivel: 1, valor: 200,  costo: { hierro: 50 } },
                    { nivel: 2, valor: 500,  costo: { hierro: 100, plata: 20 } },
                    { nivel: 3, valor: 1000, costo: { hierro: 200, plata: 50, acero: 10 } },
                    { nivel: 4, valor: 2000, costo: { hierro: 400, plata: 100, acero: 30, mithril: 5 } },
                    { nivel: 5, valor: 4000, costo: { hierro: 800, plata: 200, acero: 60, mithril: 15, titanio: 5 } }
                ]
            },
            defFisica: {
                nombre: 'Defensa Física',
                niveles: [
                    { nivel: 1, valor: 5,  costo: { hierro: 50 } },
                    { nivel: 2, valor: 10, costo: { hierro: 100, plata: 20 } },
                    { nivel: 3, valor: 20, costo: { hierro: 200, plata: 50, acero: 10 } },
                    { nivel: 4, valor: 35, costo: { hierro: 400, plata: 100, acero: 30, mithril: 5 } },
                    { nivel: 5, valor: 50, costo: { hierro: 800, plata: 200, acero: 60, mithril: 15, titanio: 5 } }
                ]
            },
            defMagica: {
                nombre: 'Defensa Mágica',
                niveles: [
                    { nivel: 1, valor: 5,  costo: { hierro: 50 } },
                    { nivel: 2, valor: 10, costo: { hierro: 100, plata: 20 } },
                    { nivel: 3, valor: 20, costo: { hierro: 200, plata: 50, acero: 10 } },
                    { nivel: 4, valor: 35, costo: { hierro: 400, plata: 100, acero: 30, mithril: 5 } },
                    { nivel: 5, valor: 50, costo: { hierro: 800, plata: 200, acero: 60, mithril: 15, titanio: 5 } }
                ]
            },
            buff: {
                nombre: 'Buff',
                niveles: [
                    { nivel: 1, valor: 0.02, costo: { hierro: 50 } },
                    { nivel: 2, valor: 0.03, costo: { hierro: 100, plata: 20 } },
                    { nivel: 3, valor: 0.05, costo: { hierro: 200, plata: 50, acero: 10 } },
                    { nivel: 4, valor: 0.07, costo: { hierro: 400, plata: 100, acero: 30, mithril: 5 } },
                    { nivel: 5, valor: 0.10, costo: { hierro: 800, plata: 200, acero: 60, mithril: 15, titanio: 5 } }
                ]
            }
        }
    },
    LIGAS: {
        COSTO_CREACION: 5000000,   // 5M de oro
        MAX_MIEMBROS: 100,
        PENALIZACION_SALIR: 48 * 60 * 60 * 1000, // 48 horas
        PUNTOS_POR_PILAR: 100,
        PUNTOS_POR_KILL: 10,
        PUNTOS_POR_EXP: 0.1
    }
};

app.use(express.static(__dirname));
app.use('/ui', express.static(path.join(__dirname, 'ui')));
app.use('/skills', express.static(path.join(__dirname, 'skills')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let players = {};
let ultimoAtaque = new Map();
let demonlord = { id: 'demonlord', x: 1500, y: 1500, hp: CONFIG.DEMONLORD.MAX_HP, maxHp: CONFIG.DEMONLORD.MAX_HP, isAlive: true, dir: 'Abajo', attackCooldown: 0, attackers: [], isAttacking: false, currentTarget: null, aturdido: false, mapa: 'principal' };
let esqueletos = [];
let arboles = [];
let rocas = [];
let minas = [];
let inventariosJugadores = {};

// ═══ NUEVO: ESTRUCTURAS DE PILARES Y LIGAS ═══
let pilares = [];
let ligas = {};
let invitacionesLiga = {};       // { socketId: { de: socketIdLider, ligaId, timestamp } }
let chatLiga = {};               // { ligaId: [ { nombre, msg, timestamp } ] }
let chatTeam = {};               // { teamId: [ { nombre, msg, timestamp } ] }
let penalizacionesLiga = {};     // { socketId: timestampFinPenalizacion }
let ultimaAlarmaPilar = {};      // { pilarId: timestampUltimaAlarma }

// ═══ PERSISTENCIA DE INVENTARIOS ═══
const INVENTARIOS_FILE = './inventarios.json';
const PILARES_FILE = './pilares.json';
const LIGAS_FILE = './ligas.json';

try {
    if (fs.existsSync(INVENTARIOS_FILE)) {
        inventariosJugadores = JSON.parse(fs.readFileSync(INVENTARIOS_FILE, 'utf8'));
        console.log(`✅ Inventarios cargados desde disco (${Object.keys(inventariosJugadores).length} jugadores)`);
    } else {
        console.log('📂 No hay inventarios previos, arrancando de cero');
    }
} catch(e) {
    console.log('⚠️ Error al cargar inventarios:', e.message);
}

try {
    if (fs.existsSync(PILARES_FILE)) {
        pilares = JSON.parse(fs.readFileSync(PILARES_FILE, 'utf8'));
        console.log(`✅ Pilares cargados desde disco (${pilares.length} pilares)`);
    } else {
        console.log('📂 No hay pilares previos, se generarán al inicio');
    }
} catch(e) {
    console.log('⚠️ Error al cargar pilares:', e.message);
}

try {
    if (fs.existsSync(LIGAS_FILE)) {
        ligas = JSON.parse(fs.readFileSync(LIGAS_FILE, 'utf8'));
        console.log(`✅ Ligas cargadas desde disco (${Object.keys(ligas).length} ligas)`);
    } else {
        console.log('📂 No hay ligas previas, arrancando de cero');
    }
} catch(e) {
    console.log('⚠️ Error al cargar ligas:', e.message);
}

// Guardar automáticamente cada 30 segundos
setInterval(() => {
    try {
        fs.writeFileSync(INVENTARIOS_FILE, JSON.stringify(inventariosJugadores, null, 2));
        fs.writeFileSync(PILARES_FILE, JSON.stringify(pilares, null, 2));
        fs.writeFileSync(LIGAS_FILE, JSON.stringify(ligas, null, 2));
        console.log(`💾 Guardado: ${Object.keys(inventariosJugadores).length} inv, ${pilares.length} pilares, ${Object.keys(ligas).length} ligas`);
    } catch(e) {
        console.log('⚠️ Error al guardar datos:', e.message);
    }
}, 10000);

let nextSkeletonId = 100;
let skillCooldowns = {};
let teams = {};
let playerTeam = {};
let invitacionesPendientes = {};
let estadosAlterados = {};
let jugadoresEnMapa = {};
let esqueletosEnAuraSacrificio = {};
let cofre = { x: Math.random() * 2800 + 100, y: Math.random() * 2800 + 100, abierto: false };
let sacrificioActivoServer = {};
let invocadores = [];
let nextInvocadorId = 1;

function getDistance(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
function rectanguloColisiona(r1, r2) { return !(r1.x + r1.w < r2.x || r1.x > r2.x + r2.w || r1.y + r1.h < r2.y || r1.y > r2.y + r2.h); }

function getPlayerDefenseFisica(playerId) {
    const j = players[playerId];
    if (!j) return 0;
    const inv = inventariosJugadores[playerId];
    let def = 0;
    let claseKey = (j.className || j.class || 'warrior').toLowerCase();
    if (claseKey.includes('mago')) claseKey = 'mago';
    if (claseKey.includes('necromancer')) claseKey = 'necromancer';
    const statsBase = CONFIG.PLAYER.BASE_STATS[claseKey] || CONFIG.PLAYER.BASE_STATS.warrior;
    def += (statsBase.defensaFisica || 0);
    if (inv && inv.items) {
        const cabezaId = j.equipamiento?.cabeza; if (cabezaId) { const item = inv.items.find(i => i.id === cabezaId); if (item && item.defensaFisica) def += Math.floor(item.defensaFisica); }
        const pechoId = j.equipamiento?.pecho; if (pechoId) { const item = inv.items.find(i => i.id === pechoId); if (item && item.defensaFisica) def += Math.floor(item.defensaFisica); }
        const armaduraId = j.equipamiento?.armadura; if (armaduraId) { const item = inv.items.find(i => i.id === armaduraId); if (item && item.defensaFisica) def += Math.floor(item.defensaFisica); }
        const piernasId = j.equipamiento?.piernas; if (piernasId) { const item = inv.items.find(i => i.id === piernasId); if (item && item.defensaFisica) def += Math.floor(item.defensaFisica); }
        const piesId = j.equipamiento?.pies; if (piesId) { const item = inv.items.find(i => i.id === piesId); if (item && item.defensaFisica) def += Math.floor(item.defensaFisica); }
        const escudoId = j.equipamiento?.escudo; if (escudoId) { const item = inv.items.find(i => i.id === escudoId); if (item && item.defensaFisica) def += Math.floor(item.defensaFisica); }
    }
    // ═══ NUEVO: BUFF DE PILARES (defensa física) ═══
    def += obtenerBuffPilarJugador(playerId, 'defFisica');
    return Math.max(0, Math.floor(def));
}

function getPlayerDefensaMagica(playerId) {
    const j = players[playerId];
    if (!j) return 0;
    const inv = inventariosJugadores[playerId];
    let def = 0;
    let claseKey = (j.className || j.class || 'warrior').toLowerCase();
    if (claseKey.includes('mago')) claseKey = 'mago';
    if (claseKey.includes('necromancer')) claseKey = 'necromancer';
    const statsBase = CONFIG.PLAYER.BASE_STATS[claseKey] || CONFIG.PLAYER.BASE_STATS.warrior;
    def += (statsBase.defensaMagica || 0);
    def += Math.floor((j.stats?.inteligencia || 0) / 2);
    if (inv && inv.items) {
        const cabezaId = j.equipamiento?.cabeza; if (cabezaId) { const item = inv.items.find(i => i.id === cabezaId); if (item && item.defensaMagica) def += Math.floor(item.defensaMagica); }
        const pechoId = j.equipamiento?.pecho; if (pechoId) { const item = inv.items.find(i => i.id === pechoId); if (item && item.defensaMagica) def += Math.floor(item.defensaMagica); }
        const armaduraId = j.equipamiento?.armadura; if (armaduraId) { const item = inv.items.find(i => i.id === armaduraId); if (item && item.defensaMagica) def += Math.floor(item.defensaMagica); }
        const piernasId = j.equipamiento?.piernas; if (piernasId) { const item = inv.items.find(i => i.id === piernasId); if (item && item.defensaMagica) def += Math.floor(item.defensaMagica); }
        const piesId = j.equipamiento?.pies; if (piesId) { const item = inv.items.find(i => i.id === piesId); if (item && item.defensaMagica) def += Math.floor(item.defensaMagica); }
        const escudoId = j.equipamiento?.escudo; if (escudoId) { const item = inv.items.find(i => i.id === escudoId); if (item && item.defensaMagica) def += Math.floor(item.defensaMagica); }
    }
    // ═══ NUEVO: BUFF DE PILARES (defensa mágica) ═══
    def += obtenerBuffPilarJugador(playerId, 'defMagica');
    return Math.max(0, Math.floor(def));
}

// ═══════════════════════════════════════════════════════════════
// ═══ NUEVO: FUNCIONES DE PILARES ═══
// ═══════════════════════════════════════════════════════════════

function generarPilares() {
    // Solo genera si no hay pilares cargados de disco
    if (pilares.length > 0) return;
    pilares = CONFIG.PILARES.POSICIONES.map(p => ({
        id: p.id,
        color: p.color,
        x: p.x,
        y: p.y,
        hp: CONFIG.PILARES.HP_BASE,
        maxHp: CONFIG.PILARES.HP_BASE,
        nivelVida: 0,
        nivelDefFisica: 0,
        nivelDefMagica: 0,
        nivelBuff: 0,
        dueñoId: null,
        dueñoLigaId: null,
        dueñoOriginalId: null,
        conquistadoEn: null,
        ventanaRecuperacion: null,
        recursosInvertidos: {},
        ultimoAtaque: 0
    }));
    console.log(`✅ ${pilares.length} pilares generados`);
}

function getPilar(pilarId) {
    return pilares.find(p => p.id === pilarId);
}

function getDueñoPilar(pilar) {
    if (!pilar) return null;
    return players[pilar.dueñoId] || null;
}

function esAliadoDelDueño(pilar, jugadorId) {
    if (!pilar || !pilar.dueñoId) return false;
    if (pilar.dueñoId === jugadorId) return true;
    // Team
    const teamDueño = playerTeam[pilar.dueñoId];
    const teamJugador = playerTeam[jugadorId];
    if (teamDueño && teamJugador && teamDueño === teamJugador) return true;
    // Liga
    const ligaDueño = pilar.dueñoLigaId;
    if (ligaDueño && ligas[ligaDueño] && ligas[ligaDueño].miembros.includes(jugadorId)) return true;
    return false;
}

function getLigaDeJugador(jugadorId) {
    for (let ligaId in ligas) {
        if (ligas[ligaId].miembros.includes(jugadorId)) return ligas[ligaId];
    }
    return null;
}

function getPilaresDeJugador(jugadorId) {
    // Pilares donde el jugador es dueño O aliado (team/liga)
    return pilares.filter(p => {
        if (!p.dueñoId) return false;
        if (p.dueñoId === jugadorId) return true;
        const teamDueño = playerTeam[p.dueñoId];
        const teamJugador = playerTeam[jugadorId];
        if (teamDueño && teamJugador && teamDueño === teamJugador) return true;
        if (p.dueñoLigaId && ligas[p.dueñoLigaId] && ligas[p.dueñoLigaId].miembros.includes(jugadorId)) return true;
        return false;
    });
}

function obtenerBuffPilarJugador(jugadorId, tipo) {
    // tipo: 'daño', 'defFisica', 'defMagica', 'vida', 'mana'
    const pilaresJugador = getPilaresDeJugador(jugadorId);
    if (pilaresJugador.length === 0) return 0;
    let total = 0;
    pilaresJugador.forEach(p => {
        const buffBase = CONFIG.PILARES.BUFF_BASE[p.color];
        if (!buffBase) return;
        const nivelBuff = p.nivelBuff || 0;
        // Calcular valor del buff según nivel
        let valorBuff = buffBase.valor;
        for (let i = 0; i < nivelBuff; i++) {
            valorBuff += CONFIG.PILARES.MEJORAS.buff.niveles[i].valor;
        }
        if (tipo === 'daño' && buffBase.tipo === 'daño') {
            const j = players[jugadorId];
            const claseKey = (j?.className || j?.class || '').toUpperCase();
            const esMagico = claseKey === 'MAGO' || claseKey === 'NECROMANCER';
            total += valorBuff;
        } else if (tipo === 'defFisica' && buffBase.tipo === 'defFisica') {
            total += valorBuff;
        } else if (tipo === 'defMagica' && buffBase.tipo === 'defFisica') {
            // El azul también da def mágica (mitad)
            total += valorBuff * 0.5;
        } else if (tipo === 'vida' && buffBase.tipo === 'vida') {
            total += valorBuff;
        }
    });
    return total;
}

function aplicarOroExtra(jugadorId, oroBase) {
    const pilaresJugador = getPilaresDeJugador(jugadorId);
    const bonus = pilaresJugador.length * CONFIG.PILARES.ORO_EXTRA_POR_PILAR;
    return Math.floor(oroBase * (1 + bonus));
}

function aplicarPoderExtra(jugadorId) {
    const pilaresJugador = getPilaresDeJugador(jugadorId);
    return pilaresJugador.length * CONFIG.PILARES.PODER_EXTRA_POR_PILAR;
}

function atacarPilar(socketId, pilarId, daño) {
    const pilar = getPilar(pilarId);
    const j = players[socketId];
    if (!pilar || !j || !j.isAlive) return;
    // No podés atacar tu propio pilar
    if (esAliadoDelDueño(pilar, socketId)) return;
    // Cooldown de conquista
    if (pilar.conquistadoEn && Date.now() - pilar.conquistadoEn < CONFIG.PILARES.COOLDOWN_CONQUISTA) return;
    
    pilar.hp = Math.max(0, pilar.hp - daño);
    pilar.ultimoAtaque = Date.now();
    
    // Alarma al dueño y aliados
    enviarAlertaPilar(pilar, socketId, daño);
    
    // Notificar a todos del daño
    io.emit('pilarDañado', {
        pilarId: pilar.id,
        hp: pilar.hp,
        maxHp: pilar.maxHp,
        atacante: j.name,
        daño: daño
    });
    
    // Si el pilar llegó a 0, se conquista
    if (pilar.hp <= 0) {
        conquistarPilar(socketId, pilar);
    }
}

function conquistarPilar(socketId, pilar) {
    const j = players[socketId];
    if (!j) return;
    
    const dueñoAnterior = pilar.dueñoId;
    const ligaAnterior = pilar.dueñoLigaId;
    
    // Si el dueño anterior es el mismo que conquista, no hacer nada
    if (dueñoAnterior === socketId) return;
    
if (!pilar.dueñoOriginalId && dueñoAnterior) {
    pilar.dueñoOriginalId = dueñoAnterior;
    pilar.dueñoOriginalNombre = players[dueñoAnterior]?.name || null;   // ⬅️ ¿Está?
    pilar.ventanaRecuperacion = Date.now() + CONFIG.PILARES.VENTANA_RECUPERACION;
}
    
    // Si el dueño anterior está en la ventana de recuperación y reconquista
if (pilar.dueñoOriginalId === socketId) {
    // Recuperó su pilar: hereda las mejoras del nuevo dueño
    pilar.dueñoOriginalId = null;
    pilar.dueñoOriginalNombre = null;   // ⬅️ NUEVO: limpiar nombre original
    pilar.ventanaRecuperacion = null;
        // Las mejoras se mantienen (se acumulan)
        io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🏆 ${j.name} recuperó su pilar ${pilar.color.toUpperCase()} y heredó las mejoras` });
    } else {
        // Nuevo dueño
        io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `⚔️ ${j.name} conquistó el pilar ${pilar.color.toUpperCase()}!` });
    }
    
    // Actualizar dueño
pilar.dueñoId = socketId;
pilar.dueñoNombre = j.name;   // ⬅️ NUEVO: guardar nombre para persistencia
pilar.dueñoLigaId = getLigaDeJugador(socketId)?.id || null;
    pilar.hp = Math.max(1, Math.floor(pilar.maxHp * 0.1)); // Empieza con 10% HP
    pilar.conquistadoEn = Date.now();
    pilar.ultimoAtaque = 0;
    
    // Sumar puntos a la liga
    if (pilar.dueñoLigaId && ligas[pilar.dueñoLigaId]) {
        ligas[pilar.dueñoLigaId].puntos += CONFIG.LIGAS.PUNTOS_POR_PILAR;
    }
    
    // Notificar a todos
    io.emit('pilarConquistado', {
        pilarId: pilar.id,
        color: pilar.color,
        x: pilar.x,
        y: pilar.y,
        nuevoDueño: j.name,
        nuevoDueñoId: socketId,
        ligaId: pilar.dueñoLigaId,
        hp: pilar.hp,
        maxHp: pilar.maxHp
    });
}

function enviarAlertaPilar(pilar, atacanteId, daño) {
    const ahora = Date.now();
    const ultima = ultimaAlarmaPilar[pilar.id] || 0;
    if (ahora - ultima < CONFIG.PILARES.INTERVALO_ALARMA) return;
    ultimaAlarmaPilar[pilar.id] = ahora;
    
    const atacante = players[atacanteId];
    const dueño = players[pilar.dueñoId];
    if (!dueño) return;
    
    const mensaje = {
        type: 'alarma',
        name: 'Sistema',
        msg: `⚠️ ¡Tu Pilar ${pilar.color.toUpperCase()} está siendo atacado por ${atacante?.name || '???'}!`,
        pilarId: pilar.id,
        pilarColor: pilar.color,
        pilarX: pilar.x,
        pilarY: pilar.y,
        hp: pilar.hp,
        maxHp: pilar.maxHp,
        timestamp: ahora
    };
    
    // Al dueño siempre
    io.to(pilar.dueñoId).emit('chatMessage', mensaje);
    io.to(pilar.dueñoId).emit('pilarAtacado', mensaje);
    
    // Al team del dueño
    const teamId = playerTeam[pilar.dueñoId];
    if (teamId && teams[teamId]) {
        teams[teamId].miembros.forEach(m => {
            if (m !== pilar.dueñoId) {
                io.to(m).emit('chatMessage', { ...mensaje, chatCanal: 'team' });
                io.to(m).emit('pilarAtacado', { ...mensaje, chatCanal: 'team' });
            }
        });
    }
    
    // A la liga del dueño
    if (pilar.dueñoLigaId && ligas[pilar.dueñoLigaId]) {
        ligas[pilar.dueñoLigaId].miembros.forEach(m => {
            if (m !== pilar.dueñoId) {
                io.to(m).emit('chatMessage', { ...mensaje, chatCanal: 'liga' });
                io.to(m).emit('pilarAtacado', { ...mensaje, chatCanal: 'liga' });
            }
        });
    }
}

function mejorarPilar(socketId, pilarId, stat) {
    const pilar = getPilar(pilarId);
    const j = players[socketId];
    if (!pilar || !j) return;
    // Solo el dueño o aliados pueden mejorar
    if (!esAliadoDelDueño(pilar, socketId)) {
        io.to(socketId).emit('mensaje', '❌ No sos dueño ni aliado de este pilar');
        return;
    }
    const mejora = CONFIG.PILARES.MEJORAS[stat];
    if (!mejora) {
        io.to(socketId).emit('mensaje', '❌ Stat inválido');
        return;
    }
    const nivelActual = pilar['nivel' + stat.charAt(0).toUpperCase() + stat.slice(1)] || 0;
    if (nivelActual >= mejora.niveles.length) {
        io.to(socketId).emit('mensaje', `❌ ${mejora.nombre} ya está al máximo`);
        return;
    }
    const siguienteNivel = mejora.niveles[nivelActual];
    // Verificar recursos
    const inv = inventariosJugadores[socketId];
    if (!inv || !inv.items) {
        io.to(socketId).emit('mensaje', '❌ No tenés inventario');
        return;
    }
    for (let recurso in siguienteNivel.costo) {
        const itemRecurso = inv.items.find(i => i.tipo === 'material' && i.nombre === recurso);
        const cantidad = itemRecurso ? itemRecurso.cantidad : 0;
        if (cantidad < siguienteNivel.costo[recurso]) {
            io.to(socketId).emit('mensaje', `❌ Faltan ${recurso} (tenés ${cantidad}, necesitás ${siguienteNivel.costo[recurso]})`);
            return;
        }
    }
    // Descontar recursos
    for (let recurso in siguienteNivel.costo) {
        const itemRecurso = inv.items.find(i => i.tipo === 'material' && i.nombre === recurso);
        if (itemRecurso) itemRecurso.cantidad -= siguienteNivel.costo[recurso];
    }
    // Aplicar mejora
    pilar['nivel' + stat.charAt(0).toUpperCase() + stat.slice(1)] = nivelActual + 1;
    if (stat === 'vida') {
        pilar.maxHp += siguienteNivel.valor;
        pilar.hp += siguienteNivel.valor;
    }
    // Guardar recursos invertidos
    if (!pilar.recursosInvertidos[stat]) pilar.recursosInvertidos[stat] = 0;
    pilar.recursosInvertidos[stat]++;
    
io.to(socketId).emit('mensaje', `✅ ${mejora.nombre} mejorada a Nv${nivelActual + 1}`);
io.emit('pilarMejorado', {
    pilarId: pilar.id,
    stat: stat,
    nuevoNivel: nivelActual + 1,
    maxHp: pilar.maxHp,
    hp: pilar.hp
});
// 🧪 Reenviar inventario + materiales al cliente (para que vea los materiales gastados)
const invActual = inventariosJugadores[socketId];
const materialesActuales = {};
if (invActual && invActual.items) {
    invActual.items.forEach(it => {
        if (it.tipo === 'material' && it.nombre) {
            materialesActuales[it.nombre] = (materialesActuales[it.nombre] || 0) + (it.cantidad || 0);
        }
    });
}
io.to(socketId).emit('inventarioCompleto', { ...invActual, materiales: materialesActuales });
}

function regenerarPilares() {
    const ahora = Date.now();
    pilares.forEach(p => {
        if (p.hp < p.maxHp && ahora - (p.ultimoAtaque || 0) > 60000) {
            const regen = Math.floor(p.maxHp * CONFIG.PILARES.HP_REGEN_POR_MINUTO);
            p.hp = Math.min(p.maxHp, p.hp + regen);
        }
        // Verificar ventana de recuperación expirada
        if (p.ventanaRecuperacion && ahora > p.ventanaRecuperacion) {
            // El dueño original perdió el progreso
if (p.dueñoOriginalId) {
    const dueñoOriginal = players[p.dueñoOriginalId];
    if (dueñoOriginal) {
        io.to(p.dueñoOriginalId).emit('mensaje', `⏰ Perdiste el progreso de tu pilar ${p.color.toUpperCase()} (pasaron las 24h)`);
    }
    p.dueñoOriginalId = null;
    p.dueñoOriginalNombre = null;   // ⬅️ NUEVO
    p.ventanaRecuperacion = null;
}
        }
    });
}
// ═══════════════════════════════════════════════════════════════
// ═══ NUEVO: MIGRAR PILARES AL RECONECTAR ═══
// Si un jugador se reconecta con nuevo socket.id, reasignamos
// sus pilares (guardados por dueñoNombre) al nuevo ID.
// ═══════════════════════════════════════════════════════════════
function migrarLigasAlReconectar(socketId) {
    const j = players[socketId];
    if (!j) return 0;
    let migrados = 0;
    for (let ligaId in ligas) {
        const liga = ligas[ligaId];
        if (!liga.miembrosNombres) continue;
        
        // Verificar si el jugador está en la lista de nombres
        const idxNombre = liga.miembrosNombres.indexOf(j.name);
        if (idxNombre === -1) continue;
        
        // Verificar si el socket viejo ya no existe
        const socketViejo = liga.miembros[idxNombre];
        const viejoExiste = socketViejo && players[socketViejo];
        if (viejoExiste) continue;
        
        // Migrar: reemplazar el socket viejo por el nuevo
        liga.miembros[idxNombre] = socketId;
        migrados++;
        
        // Si era el líder, actualizar líder también
        if (liga.liderNombre === j.name) {
            liga.lider = socketId;
        }
    }
    if (migrados > 0) {
        console.log(`🔄 ${j.name}: ${migrados} liga(s) migrada(s) al nuevo socket ${socketId}`);
        io.to(socketId).emit('mensaje', `🏅 Recuperaste tu liga al reconectar`);
    }
    return migrados;
}
function migrarPilaresAlReconectar(socketId) {
    const j = players[socketId];
    if (!j) return 0;
    let migrados = 0;
    pilares.forEach(p => {
        // Solo migrar si el pilar tiene dueñoNombre, no tiene dueñoId válido, y coincide con el jugador
        if (p.dueñoNombre && p.dueñoNombre === j.name) {
            const dueñoViejoExiste = p.dueñoId && players[p.dueñoId];
            if (!dueñoViejoExiste) {
                p.dueñoId = socketId;
                p.dueñoLigaId = getLigaDeJugador(socketId)?.id || null;
                migrados++;
            }
        }
    });
    // También migrar dueñoOriginalId
    pilares.forEach(p => {
        if (p.dueñoOriginalNombre && p.dueñoOriginalNombre === j.name) {
            const origViejoExiste = p.dueñoOriginalId && players[p.dueñoOriginalId];
            if (!origViejoExiste) {
                p.dueñoOriginalId = socketId;
            }
        }
    });
    if (migrados > 0) {
        console.log(`🔄 ${j.name}: ${migrados} pilar(es) migrado(s) al nuevo socket ${socketId}`);
        io.to(socketId).emit('mensaje', `🏛️ Recuperaste ${migrados} pilar(es) al reconectar`);
    }
    return migrados;
}

// ═══════════════════════════════════════════════════════════════
// ═══ NUEVO: FUNCIONES DE LIGAS ═══
// ═══════════════════════════════════════════════════════════════

function crearLiga(socketId, nombre) {
    const j = players[socketId];
    if (!j) return;
    if (!nombre || nombre.trim().length < 3 || nombre.trim().length > 20) {
        io.to(socketId).emit('mensaje', '❌ El nombre debe tener entre 3 y 20 caracteres');
        return;
    }
    // Verificar que no exista otra liga con ese nombre
    for (let ligaId in ligas) {
        if (ligas[ligaId].nombre.toLowerCase() === nombre.trim().toLowerCase()) {
            io.to(socketId).emit('mensaje', '❌ Ya existe una liga con ese nombre');
            return;
        }
    }
    // Verificar que no esté en otra liga
    if (getLigaDeJugador(socketId)) {
        io.to(socketId).emit('mensaje', '❌ Ya estás en una liga');
        return;
    }
    // Verificar penalización
    if (penalizacionesLiga[socketId] && Date.now() < penalizacionesLiga[socketId]) {
        const restante = Math.ceil((penalizacionesLiga[socketId] - Date.now()) / 3600000);
        io.to(socketId).emit('mensaje', `❌ Estás penalizado por ${restante}h más`);
        return;
    }
    // Verificar oro
    const inv = inventariosJugadores[socketId];
    if (!inv || !inv.items) {
        io.to(socketId).emit('mensaje', '❌ No tenés inventario');
        return;
    }
    const oroItem = inv.items.find(i => i.id === 'oro');
    const oroActual = oroItem ? oroItem.cantidad : 0;
    if (oroActual < CONFIG.LIGAS.COSTO_CREACION) {
        io.to(socketId).emit('mensaje', `❌ Necesitás ${CONFIG.LIGAS.COSTO_CREACION.toLocaleString()} de oro (tenés ${oroActual.toLocaleString()})`);
        return;
    }
    // Descontar oro
    oroItem.cantidad -= CONFIG.LIGAS.COSTO_CREACION;
    if (oroItem.cantidad <= 0) {
        const idx = inv.items.findIndex(i => i.id === 'oro');
        if (idx !== -1) inv.items.splice(idx, 1);
    }
    // Crear liga
    const ligaId = 'liga_' + Date.now();
ligas[ligaId] = {
    id: ligaId,
    nombre: nombre.trim(),
    lider: socketId,
    liderNombre: j.name,
    miembros: [socketId],
    miembrosNombres: [j.name],
    puntos: 0,
    pilares: [],
    fechaCreacion: Date.now(),
    oro: 0,
    exp: 0,
    nivel: 1,
    misionActual: null
};
    chatLiga[ligaId] = [];
    io.to(socketId).emit('mensaje', `✅ Liga "${nombre}" creada!`);
    io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🏅 ${j.name} creó la liga "${nombre}"` });
    io.to(socketId).emit('ligasActualizadas', { ligas: obtenerRankingLigas() });
}

function invitarLiga(socketId, nombreJugador) {
    const j = players[socketId];
    if (!j) return;
    const liga = getLigaDeJugador(socketId);
    if (!liga) {
        io.to(socketId).emit('mensaje', '❌ No estás en una liga');
        return;
    }
    if (liga.lider !== socketId) {
        io.to(socketId).emit('mensaje', '❌ Solo el líder puede invitar');
        return;
    }
    if (liga.miembros.length >= CONFIG.LIGAS.MAX_MIEMBROS) {
        io.to(socketId).emit('mensaje', '❌ Liga llena');
        return;
    }
    let targetId = null;
    for (let id in players) {
        if (players[id].name.toLowerCase() === nombreJugador.toLowerCase()) {
            targetId = id;
            break;
        }
    }
    if (!targetId) {
        io.to(socketId).emit('mensaje', '❌ Jugador no encontrado');
        return;
    }
    if (liga.miembros.includes(targetId)) {
        io.to(socketId).emit('mensaje', '❌ Ya está en la liga');
        return;
    }
    invitacionesLiga[targetId] = {
        de: socketId,
        ligaId: liga.id,
        nombreLiga: liga.nombre,
        timestamp: Date.now()
    };
    io.to(targetId).emit('invitacionLigaRecibida', {
        de: socketId,
        nombreLider: j.name,
        ligaId: liga.id,
        nombreLiga: liga.nombre
    });
    io.to(socketId).emit('mensaje', `📨 Invitación enviada a ${nombreJugador}`);
}

function aceptarInvitacionLiga(socketId, ligaId) {
    const inv = invitacionesLiga[socketId];
    if (!inv || inv.ligaId !== ligaId) {
        io.to(socketId).emit('mensaje', '❌ No tenés invitación');
        return;
    }
    const liga = ligas[ligaId];
    if (!liga) {
        io.to(socketId).emit('mensaje', '❌ La liga ya no existe');
        delete invitacionesLiga[socketId];
        return;
    }
    if (liga.miembros.length >= CONFIG.LIGAS.MAX_MIEMBROS) {
        io.to(socketId).emit('mensaje', '❌ Liga llena');
        delete invitacionesLiga[socketId];
        return;
    }
    if (getLigaDeJugador(socketId)) {
        io.to(socketId).emit('mensaje', '❌ Ya estás en una liga');
        delete invitacionesLiga[socketId];
        return;
    }
    if (penalizacionesLiga[socketId] && Date.now() < penalizacionesLiga[socketId]) {
        const restante = Math.ceil((penalizacionesLiga[socketId] - Date.now()) / 3600000);
        io.to(socketId).emit('mensaje', `❌ Estás penalizado por ${restante}h más`);
        delete invitacionesLiga[socketId];
        return;
    }
    liga.miembros.push(socketId);
if (!liga.miembrosNombres) liga.miembrosNombres = [];
liga.miembrosNombres.push(players[socketId].name);
    delete invitacionesLiga[socketId];
    const j = players[socketId];
    io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🏅 ${j.name} se unió a la liga "${liga.nombre}"` });
    io.to(socketId).emit('mensaje', `✅ Te uniste a la liga "${liga.nombre}"`);
    // Notificar a todos los miembros
    liga.miembros.forEach(m => {
        io.to(m).emit('ligaActualizada', { liga: { id: liga.id, nombre: liga.nombre, lider: liga.lider, miembros: liga.miembros.map(id => players[id]?.name || '???'), puntos: liga.puntos } });
    });
}

function salirLiga(socketId) {
    const liga = getLigaDeJugador(socketId);
    if (!liga) {
        io.to(socketId).emit('mensaje', '❌ No estás en una liga');
        return;
    }
    const j = players[socketId];
    if (liga.lider === socketId) {
        // Si es líder, disolver liga
        disolverLiga(socketId, liga.id);
        return;
    }
const idx = liga.miembros.indexOf(socketId);
if (idx !== -1) {
    liga.miembros.splice(idx, 1);
    if (liga.miembrosNombres) {
        const idxNombre = liga.miembrosNombres.indexOf(j.name);
        if (idxNombre !== -1) liga.miembrosNombres.splice(idxNombre, 1);
    }
}
    penalizacionesLiga[socketId] = Date.now() + CONFIG.LIGAS.PENALIZACION_SALIR;
    io.to(socketId).emit('mensaje', `❌ Saliste de la liga "${liga.nombre}". Penalización: 48h`);
    io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🏅 ${j.name} salió de la liga "${liga.nombre}"` });
    liga.miembros.forEach(m => {
        io.to(m).emit('ligaActualizada', { liga: { id: liga.id, nombre: liga.nombre, lider: liga.lider, miembros: liga.miembros.map(id => players[id]?.name || '???'), puntos: liga.puntos } });
    });
}

function expulsarMiembro(socketId, nombreJugador) {
    const liga = getLigaDeJugador(socketId);
    if (!liga || liga.lider !== socketId) {
        io.to(socketId).emit('mensaje', '❌ Solo el líder puede expulsar');
        return;
    }
    let targetId = null;
    for (let id in players) {
        if (players[id].name.toLowerCase() === nombreJugador.toLowerCase()) {
            targetId = id;
            break;
        }
    }
    if (!targetId || !liga.miembros.includes(targetId)) {
        io.to(socketId).emit('mensaje', '❌ Jugador no está en la liga');
        return;
    }
const idx = liga.miembros.indexOf(targetId);
if (idx !== -1) {
    liga.miembros.splice(idx, 1);
    if (liga.miembrosNombres) {
        const idxNombre = liga.miembrosNombres.indexOf(players[targetId].name);
        if (idxNombre !== -1) liga.miembrosNombres.splice(idxNombre, 1);
    }
}
    penalizacionesLiga[targetId] = Date.now() + CONFIG.LIGAS.PENALIZACION_SALIR;
    io.to(targetId).emit('mensaje', `❌ Fuiste expulsado de la liga "${liga.nombre}"`);
    io.to(socketId).emit('mensaje', `✅ Expulsaste a ${nombreJugador}`);
    liga.miembros.forEach(m => {
        io.to(m).emit('ligaActualizada', { liga: { id: liga.id, nombre: liga.nombre, lider: liga.lider, miembros: liga.miembros.map(id => players[id]?.name || '???'), puntos: liga.puntos } });
    });
}

function disolverLiga(socketId, ligaId) {
    const liga = ligas[ligaId];
    if (!liga) return;
    if (liga.lider !== socketId) {
        io.to(socketId).emit('mensaje', '❌ Solo el líder puede disolver');
        return;
    }
    liga.miembros.forEach(m => {
        if (m !== socketId) {
            penalizacionesLiga[m] = Date.now() + CONFIG.LIGAS.PENALIZACION_SALIR;
            io.to(m).emit('mensaje', `❌ La liga "${liga.nombre}" fue disuelta`);
        }
    });
    io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🏅 La liga "${liga.nombre}" fue disuelta` });
    delete ligas[ligaId];
    delete chatLiga[ligaId];
    io.to(socketId).emit('mensaje', '✅ Liga disuelta');
}

function obtenerRankingLigas() {
    const ranking = [];
    for (let ligaId in ligas) {
        const liga = ligas[ligaId];
        ranking.push({
            id: liga.id,
            nombre: liga.nombre,
            lider: players[liga.lider]?.name || '???',
            miembros: liga.miembros.length,
            puntos: liga.puntos,
            pilares: pilares.filter(p => p.dueñoLigaId === liga.id).length
        });
    }
    ranking.sort((a, b) => b.puntos - a.puntos);
    return ranking.slice(0, 20);
}

function enviarMensajeChatLiga(socketId, msg) {
    const liga = getLigaDeJugador(socketId);
    if (!liga) {
        io.to(socketId).emit('mensaje', '❌ No estás en una liga');
        return;
    }
    const j = players[socketId];
    const mensaje = { nombre: j.name, msg: msg, timestamp: Date.now() };
    if (!chatLiga[liga.id]) chatLiga[liga.id] = [];
    chatLiga[liga.id].push(mensaje);
    if (chatLiga[liga.id].length > 50) chatLiga[liga.id].shift();
    liga.miembros.forEach(m => {
        io.to(m).emit('chatLigaMensaje', { ligaId: liga.id, nombre: j.name, msg: msg });
    });
}

function enviarMensajeChatTeam(socketId, msg) {
    const teamId = playerTeam[socketId];
    if (!teamId || !teams[teamId]) {
        io.to(socketId).emit('mensaje', '❌ No estás en un team');
        return;
    }
    const j = players[socketId];
    const mensaje = { nombre: j.name, msg: msg, timestamp: Date.now() };
    if (!chatTeam[teamId]) chatTeam[teamId] = [];
    chatTeam[teamId].push(mensaje);
    if (chatTeam[teamId].length > 50) chatTeam[teamId].shift();
    teams[teamId].miembros.forEach(m => {
        io.to(m).emit('chatTeamMensaje', { teamId: teamId, nombre: j.name, msg: msg });
    });
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
    let claseKey = (j.className || j.class || 'warrior').toLowerCase();
    if (claseKey.includes('mago')) claseKey = 'mago';
    if (claseKey.includes('necromancer')) claseKey = 'necromancer';
    const statsBase = CONFIG.PLAYER.BASE_STATS[claseKey] || CONFIG.PLAYER.BASE_STATS.warrior;
    velocidad = statsBase.velocidad || 150;
    const inv = inventariosJugadores[playerId];
    if (inv) {
        const armaId = j.equipamiento?.arma; if (armaId) { const arma = inv.items.find(i => i.id === armaId); if (arma) { ataqueFisico += arma.ataqueFisico || 0; ataqueMagico += arma.ataqueMagico || 0; velocidad += arma.velocidad || 0; if (arma.dañoFuego) ataqueMagico += arma.dañoFuego; if (arma.dañoLuz) ataqueMagico += arma.dañoLuz; if (arma.manaBonus) manaMax += arma.manaBonus; } }
        const escudoId = j.equipamiento?.escudo; if (escudoId) { const escudo = inv.items.find(i => i.id === escudoId); if (escudo) { defensaFisica += escudo.defensaFisica || 0; defensaMagica += escudo.defensaMagica || 0; velocidad += escudo.velocidad || 0; } }
        const armaduraId = j.equipamiento?.armadura; if (armaduraId) { const armadura = inv.items.find(i => i.id === armaduraId); if (armadura) { defensaFisica += armadura.defensaFisica || 0; defensaMagica += armadura.defensaMagica || 0; velocidad += armadura.velocidad || 0; } }
    }
    if (j.stats) { ataqueFisico += (j.stats.fuerza || 0) * 1.5; ataqueMagico += (j.stats.inteligencia || 0) * 1.5; hpMax += (j.stats.vitalidad || 0) * 10; manaMax += (j.stats.sabiduria || 0) * 10; velocidad += (j.stats.agilidad || 0) * 1.5; }
    const nivel = j.level || 1;
    let poder = Math.floor((ataqueFisico * 2) + (ataqueMagico * 2) + (defensaFisica * 1.5) + (defensaMagica * 1.5) + (hpMax * 0.5) + (manaMax * 0.2) + (velocidad * 0.3) + (nivel * 10));
    // ═══ NUEVO: PODER EXTRA POR PILARES ═══
    poder += aplicarPoderExtra(playerId);
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
    if (!j) return Math.max(1, Math.floor(dañoBase));
    let daño = Math.floor(dañoBase);
    if (objetivoId && players[objetivoId] && (players[objetivoId].className || '').toUpperCase() === 'CABALLERO' && sacrificioActivoServer[objetivoId] && (players[objetivoId].stats?.sacrificio || 0) > 0 && !playerTeam[objetivoId]) {
        const absorbido = Math.floor(daño * 0.15);
        if (absorbido > 0) daño = Math.max(0, daño - absorbido);
    }
    const tid = playerTeam[objetivoId];
    if (tid && teams[tid]) {
        const team = teams[tid];
        let caballeroCercano = null;
        let menorDistancia = Infinity;
        team.miembros.forEach(m => {
            if (m !== objetivoId && players[m] && players[m].className === 'CABALLERO' && players[m].isAlive) {
                const cab = players[m];
                if (cab.stats && cab.stats.sacrificio > 0 && sacrificioActivoServer[cab.id]) {
                    const rango = 50 + ((cab.stats.sacrificio || 0) * 2);
                    const dist = getDistance(j.x, j.y, cab.x, cab.y);
                    if (dist < rango && dist < menorDistancia) { menorDistancia = dist; caballeroCercano = cab; }
                }
            }
        });
        if (caballeroCercano) {
            const porcentajeAbsorcion = 0.15 + ((caballeroCercano.stats.sacrificio || 0) * 0.005);
            const dañoAbsorbido = Math.floor(daño * porcentajeAbsorcion);
            if (dañoAbsorbido > 0) {
                caballeroCercano.hp = Math.max(0, caballeroCercano.hp - dañoAbsorbido);
                daño = Math.max(0, daño - dañoAbsorbido);
                io.emit('playerStatsUpdate', { id: caballeroCercano.id, hp: caballeroCercano.hp });
                io.to(caballeroCercano.id).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `Sacrificio: absorbiste ${dañoAbsorbido} de daño` });
                io.to(objetivoId).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${caballeroCercano.name} absorbio ${dañoAbsorbido} de daño por ti` });
            }
        }
    }
    let defensa = 0;
    if (tipo === 'fisico') {
        defensa = Math.floor(getPlayerDefenseFisica(objetivoId));
    } else if (tipo === 'magico' && elemento) {
        switch(elemento) {
            case 'fuego': defensa = Math.floor(j?.stats?.defFuego || 0); break;
            case 'agua': defensa = Math.floor(j?.stats?.defAgua || 0); break;
            case 'viento': defensa = Math.floor(j?.stats?.defViento || 0); break;
            case 'rayo': defensa = Math.floor(j?.stats?.defRayo || 0); break;
            case 'luz': defensa = Math.floor(j?.stats?.defLuz || 0); break;
            case 'oscuridad': defensa = Math.floor(j?.stats?.defOscuridad || 0); break;
            default: defensa = 0;
        }
    } else if (tipo === 'magico') {
        defensa = Math.floor(getPlayerDefensaMagica(objetivoId));
    }
    if (defensa < 0) defensa = 0;
    let dañoFinal = Math.max(0, Math.floor(daño - defensa));
    return dañoFinal;
}

function darExpAJugadorYEquipo(socketId, exp) {
    const j = players[socketId];
    if (!j) return;
    if (j.level === undefined || j.level === null || isNaN(j.level)) j.level = 1;
    if (j.exp === undefined || j.exp === null || isNaN(j.exp)) j.exp = 0;
    if (!j.stats) j.stats = {};
    if (j.stats.puntosDisponibles === undefined || j.stats.puntosDisponibles === null || isNaN(j.stats.puntosDisponibles)) j.stats.puntosDisponibles = 5;
    if (j.stats.puntosEspecialidad === undefined || j.stats.puntosEspecialidad === null || isNaN(j.stats.puntosEspecialidad)) j.stats.puntosEspecialidad = 0;
    j.exp += exp;
    const expNecesaria = j.level * 100;
    while (j.exp >= expNecesaria) {
        j.exp -= expNecesaria;
        j.level += 1;
        j.stats.puntosDisponibles += 3;
        j.stats.puntosEspecialidad += 1;
        io.to(socketId).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🎉 ¡Has subido al nivel ${j.level}! (+3 puntos, +1 especialidad)` });
    }
    io.to(socketId).emit('playerExpGain', { id: socketId, exp: exp, totalExp: j.exp, level: j.level, expNecesaria: j.level * 100, puntosDisponibles: j.stats.puntosDisponibles, puntosEspecialidad: j.stats.puntosEspecialidad });
    const t = playerTeam[socketId];
    if (t && teams[t]) {
        teams[t].miembros.forEach(m => {
            if (m !== socketId && players[m]) {
                if (players[m].exp === undefined || players[m].exp === null || isNaN(players[m].exp)) players[m].exp = 0;
                players[m].exp += exp;
                io.to(m).emit('playerExpGain', { id: m, exp: exp });
            }
        });
    }
    // ═══ NUEVO: PUNTOS DE LIGA POR EXP ═══
    const liga = getLigaDeJugador(socketId);
    if (liga) {
        liga.puntos += Math.floor(exp * CONFIG.LIGAS.PUNTOS_POR_EXP);
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
    jugadoresEnMapa[socketId] = 'principal';
    io.emit('playerRespawn', { id: socketId, x: 512, y: 512 });
}

function cambiarJugadorDeMapa(socketId, mapa) {
    if (!players[socketId]) return;
    jugadoresEnMapa[socketId] = mapa;
    players[socketId].mapa = mapa;
    io.to(socketId).emit('cambioMapa', { mapa: mapa });
    actualizarVisibilidadJugadores(socketId);
}

function actualizarVisibilidadJugadores(socketId) {
    const jugador = players[socketId];
    if (!jugador) return;
    const miMapa = jugadoresEnMapa[socketId] || 'principal';
    const jugadoresMismoMapa = {};
    for (let id in players) {
        if (id !== socketId && players[id] && (jugadoresEnMapa[id] || 'principal') === miMapa) {
            jugadoresMismoMapa[id] = players[id];
        }
    }
    io.to(socketId).emit('currentPlayers', jugadoresMismoMapa);
    for (let id in players) {
        if (id !== socketId && players[id] && (jugadoresEnMapa[id] || 'principal') === miMapa) {
            io.to(id).emit('newPlayer', players[socketId]);
        }
    }
}

const ITEMS_DATA = {
    armadura_3: { nombre: 'Armadura+++', tipo: 'armadura', icono: 'armadura_de_cuero_img', stats: { defensaFisica: 50, defensaMagica: 25, velocidad: -10 }, calidad: '+++', dropChance: 0.005, textoVerde: true },
    espada_3: { nombre: 'Espada+++', tipo: 'espada', icono: 'espada_img', stats: { ataqueFisico: 40, velocidad: -5 }, calidad: '+++', dropChance: 0.01, textoVerde: true },
    escudo_3: { nombre: 'Escudo+++', tipo: 'escudo', icono: 'escudo_madera_img', stats: { defensaFisica: 55, defensaMagica: 20, velocidad: -5 }, calidad: '+++', dropChance: 0.01, textoVerde: true },
    escudo_espejo_3: { nombre: 'Escudo Espejo+++', tipo: 'escudo', icono: 'escudo_espejo_img', stats: { defensaFisica: 60, defensaMagica: 25, velocidad: -5 }, calidad: '+++', dropChance: 0.01, textoVerde: true, soloCaballero: true, efectoEspecial: 'espejo', probEspejo: 0.30 },
    hachadehierro_3: { nombre: 'Hacha de Hierro+++', tipo: 'espada', icono: 'hachadehierro_img', stats: { ataqueFisico: 80, velocidad: 0 }, calidad: '+++', dropChance: 0.002, textoVerde: true },
    anillo_cura_3: { nombre: 'Anillo de Cura+++', tipo: 'anillo', icono: 'anillo_cura_img', stats: { curacion: 0.30 }, calidad: '+++', dropChance: 0.01, efectoEspecial: 'curacion' },
    armadura_2: { nombre: 'Armadura++', tipo: 'armadura', icono: 'armadura_de_cuero_img', stats: { defensaFisica: 30, defensaMagica: 15, velocidad: -15 }, calidad: '++', dropChance: 0.02, textoVerde: false },
    espada_2: { nombre: 'Espada++', tipo: 'espada', icono: 'espada_img', stats: { ataqueFisico: 25, velocidad: -10 }, calidad: '++', dropChance: 0.03, textoVerde: false },
    escudo_2: { nombre: 'Escudo++', tipo: 'escudo', icono: 'escudo_madera_img', stats: { defensaFisica: 35, defensaMagica: 12, velocidad: -10 }, calidad: '++', dropChance: 0.03, textoVerde: false },
    escudo_espejo_2: { nombre: 'Escudo Espejo++', tipo: 'escudo', icono: 'escudo_espejo_img', stats: { defensaFisica: 40, defensaMagica: 15, velocidad: -10 }, calidad: '++', dropChance: 0.02, textoVerde: false, soloCaballero: true, efectoEspecial: 'espejo', probEspejo: 0.20 },
    hachadehierro_2: { nombre: 'Hacha de Hierro++', tipo: 'espada', icono: 'hachadehierro_img', stats: { ataqueFisico: 50, velocidad: -5 }, calidad: '++', dropChance: 0.008, textoVerde: false },
    anillo_cura_2: { nombre: 'Anillo de Cura++', tipo: 'anillo', icono: 'anillo_cura_img', stats: { curacion: 0.10 }, calidad: '++', dropChance: 0.02, efectoEspecial: 'curacion' },
    armadura_1: { nombre: 'Armadura+', tipo: 'armadura', icono: 'armadura_de_cuero_img', stats: { defensaFisica: 15, defensaMagica: 5, velocidad: -20 }, calidad: '+', dropChance: 0.05, textoVerde: false },
    espada_1: { nombre: 'Espada+', tipo: 'espada', icono: 'espada_img', stats: { ataqueFisico: 15, velocidad: -15 }, calidad: '+', dropChance: 0.08, textoVerde: false },
    escudo_1: { nombre: 'Escudo+', tipo: 'escudo', icono: 'escudo_madera_img', stats: { defensaFisica: 20, defensaMagica: 5, velocidad: -15 }, calidad: '+', dropChance: 0.08, textoVerde: false },
    escudo_espejo_1: { nombre: 'Escudo Espejo+', tipo: 'escudo', icono: 'escudo_espejo_img', stats: { defensaFisica: 25, defensaMagica: 10, velocidad: -15 }, calidad: '+', dropChance: 0.05, textoVerde: false, soloCaballero: true, efectoEspecial: 'espejo', probEspejo: 0.15 },
    hachadehierro_1: { nombre: 'Hacha de Hierro+', tipo: 'espada', icono: 'hachadehierro_img', stats: { ataqueFisico: 25, velocidad: -10 }, calidad: '+', dropChance: 0.02, textoVerde: false },
    anillo_cura_1: { nombre: 'Anillo de Cura+', tipo: 'anillo', icono: 'anillo_cura_img', stats: { curacion: 0.05 }, calidad: '+', dropChance: 0.04, efectoEspecial: 'curacion' },
    hachadehierroleg: { nombre: 'Hacha Legendaria', tipo: 'espada', icono: 'hachadehierroleg_img', stats: { ataqueFisico: 250, velocidad: -50 }, calidad: 'LEGENDARIA', dropChance: 0.001, textoDorado: true, lootIndicator: 'yellow', efectoEspecial: 'contraGolpe' },
    bastondefuego: { nombre: 'Baston de Fuego', tipo: 'arma_magica', icono: 'bastondefuego_img', stats: { dañoFuego: 15, manaBonus: 50, velocidad: 0 }, calidad: '', dropChance: 0.0, textoVerde: false, clasePermitida: ['MAGO', 'NECROMANCER'] },
    bastondefuego_1: { nombre: 'Baston de Fuego+', tipo: 'arma_magica', icono: 'bastondefuego_img', stats: { dañoFuego: 25, manaBonus: 65, velocidad: 0 }, calidad: '+', dropChance: 0.08, textoVerde: false, clasePermitida: ['MAGO', 'NECROMANCER'] },
    bastondefuego_2: { nombre: 'Baston de Fuego++', tipo: 'arma_magica', icono: 'bastondefuego_img', stats: { dañoFuego: 40, manaBonus: 85, velocidad: 0 }, calidad: '++', dropChance: 0.03, textoVerde: false, clasePermitida: ['MAGO', 'NECROMANCER'] },
    bastondefuego_3: { nombre: 'Baston de Fuego+++', tipo: 'arma_magica', icono: 'bastondefuego_img', stats: { dañoFuego: 60, manaBonus: 110, velocidad: 0 }, calidad: '+++', dropChance: 0.01, textoVerde: true, clasePermitida: ['MAGO', 'NECROMANCER'] },
    bastondefuegoleg: { nombre: 'Baston de Fuego Legendario', tipo: 'arma_magica', icono: 'bastondefuegoleg_img', stats: { dañoFuego: 500, manaBonus: 500, velocidad: -10 }, calidad: 'LEGENDARIA', dropChance: 0.001, textoDorado: true, lootIndicator: 'yellow', clasePermitida: ['MAGO', 'NECROMANCER'], efectoEspecial: 'quemadura' },
    bastonderayo: { nombre: 'Baston de Rayo', tipo: 'arma_magica', icono: 'bastonderayo_img', stats: { dañoLuz: 15, manaBonus: 50, velocidad: 0 }, calidad: '', dropChance: 0.0, textoVerde: false, clasePermitida: ['MAGO', 'NECROMANCER'] },
    bastonderayo_1: { nombre: 'Baston de Rayo+', tipo: 'arma_magica', icono: 'bastonderayo_img', stats: { dañoLuz: 25, manaBonus: 65, velocidad: 0 }, calidad: '+', dropChance: 0.08, textoVerde: false, clasePermitida: ['MAGO', 'NECROMANCER'] },
    bastonderayo_2: { nombre: 'Baston de Rayo++', tipo: 'arma_magica', icono: 'bastonderayo_img', stats: { dañoLuz: 40, manaBonus: 85, velocidad: 0 }, calidad: '++', dropChance: 0.03, textoVerde: false, clasePermitida: ['MAGO', 'NECROMANCER'] },
    bastonderayo_3: { nombre: 'Baston de Rayo+++', tipo: 'arma_magica', icono: 'bastonderayo_img', stats: { dañoLuz: 60, manaBonus: 110, velocidad: 0 }, calidad: '+++', dropChance: 0.01, textoVerde: true, clasePermitida: ['MAGO', 'NECROMANCER'] },
    bastonderayoleg: { nombre: 'Baston de Rayo Legendario', tipo: 'arma_magica', icono: 'bastonderayoleg_img', stats: { dañoLuz: 500, manaBonus: 500, velocidad: -10 }, calidad: 'LEGENDARIA', dropChance: 0.001, textoDorado: true, lootIndicator: 'yellow', clasePermitida: ['MAGO', 'NECROMANCER'], efectoEspecial: 'aturdimiento' },
    bastondesangre: { nombre: 'Baston de Sangre', tipo: 'arma_magica', icono: 'bastondesangre_img', stats: { dañoFisico: 10, dañoSangre: 15, manaBonus: 30, nivelOscuridadReq: 10, velocidad: 0 }, calidad: '', dropChance: 0.0, textoVerde: false, clasePermitida: ['MAGO', 'NECROMANCER'] },
    bastondesangre_1: { nombre: 'Baston de Sangre+', tipo: 'arma_magica', icono: 'bastondesangre_img', stats: { dañoFisico: 12, dañoSangre: 20, manaBonus: 40, nivelOscuridadReq: 15, velocidad: 0 }, calidad: '+', dropChance: 0.08, textoVerde: false, clasePermitida: ['MAGO', 'NECROMANCER'] },
    bastondesangre_2: { nombre: 'Baston de Sangre++', tipo: 'arma_magica', icono: 'bastondesangre_img', stats: { dañoFisico: 14, dañoSangre: 25, manaBonus: 55, nivelOscuridadReq: 20, velocidad: 0 }, calidad: '++', dropChance: 0.03, textoVerde: false, clasePermitida: ['MAGO', 'NECROMANCER'] },
    bastondesangre_3: { nombre: 'Baston de Sangre+++', tipo: 'arma_magica', icono: 'bastondesangre_img', stats: { dañoFisico: 16, dañoSangre: 30, manaBonus: 75, nivelOscuridadReq: 25, velocidad: 0 }, calidad: '+++', dropChance: 0.01, textoVerde: true, clasePermitida: ['MAGO', 'NECROMANCER'] },
    bastondesangreleg: { nombre: 'Baston de Sangre Legendario', tipo: 'arma_magica', icono: 'bastondesangreleg_img', stats: { dañoFisico: 20, dañoSangre: 50, manaBonus: 200, nivelOscuridadReq: 30, velocidad: -5 }, calidad: 'LEGENDARIA', dropChance: 0.001, textoDorado: true, lootIndicator: 'yellow', clasePermitida: ['MAGO', 'NECROMANCER'], efectoEspecial: 'drenaje' },
    bastondehueso: { nombre: 'Baston de Hueso', tipo: 'arma_magica', icono: 'bastondehueso_img', stats: { dañoFisico: 8, dañoOscuridad: 12, manaBonus: 25, nivelOscuridadReq: 0, bonusEsqueletos: 1, bonusAliados: 1, velocidad: 0 }, calidad: '', dropChance: 0.0, textoVerde: false, clasePermitida: ['NECROMANCER'] },
    bastondehueso_1: { nombre: 'Baston de Hueso+', tipo: 'arma_magica', icono: 'bastondehueso_img', stats: { dañoFisico: 12, dañoOscuridad: 18, manaBonus: 40, nivelOscuridadReq: 10, bonusEsqueletos: 1, bonusAliados: 2, velocidad: 0 }, calidad: '+', dropChance: 0.02, textoVerde: false, clasePermitida: ['NECROMANCER'] },
    bastondehueso_2: { nombre: 'Baston de Hueso++', tipo: 'arma_magica', icono: 'bastondehueso_img', stats: { dañoFisico: 16, dañoOscuridad: 26, manaBonus: 60, nivelOscuridadReq: 20, bonusEsqueletos: 2, bonusAliados: 3, velocidad: 0 }, calidad: '++', dropChance: 0.01, textoVerde: false, clasePermitida: ['NECROMANCER'] },
    bastondehueso_3: { nombre: 'Baston de Hueso+++', tipo: 'arma_magica', icono: 'bastondehueso_img', stats: { dañoFisico: 22, dañoOscuridad: 36, manaBonus: 85, nivelOscuridadReq: 30, bonusEsqueletos: 3, bonusAliados: 4, velocidad: 0 }, calidad: '+++', dropChance: 0.003, textoVerde: true, clasePermitida: ['NECROMANCER'] },
    bastondehuesoleg: { nombre: 'Baston de Hueso Legendario', tipo: 'arma_magica', icono: 'bastondehuesoleg_img', stats: { dañoFisico: 35, dañoOscuridad: 75, manaBonus: 200, nivelOscuridadReq: 50, bonusEsqueletos: 10, bonusAliados: 5, velocidad: -5 }, calidad: 'LEGENDARIA', dropChance: 0.0005, textoDorado: true, lootIndicator: 'yellow', clasePermitida: ['NECROMANCER'] }
};

function generarArboles() { arboles = []; for (let i = 0; i < 15; i++) { arboles.push({ id: 'arbol_' + i, x: Math.random() * 2800 + 100, y: Math.random() * 2800 + 100, activo: true, tipo: 'pino_con_nieve' }); } }
function generarRocas() { rocas = []; for (let i = 0; i < CONFIG.ROCAS.CANTIDAD_INICIAL; i++) { rocas.push({ id: 'roca_' + i, x: Math.random() * 2800 + 100, y: Math.random() * 2800 + 100, activo: true, mapa: 'principal' }); } }
function generarMinas() { minas = []; for (let i = 0; i < CONFIG.MINAS.CANTIDAD_INICIAL; i++) { minas.push({ id: 'mina_' + i, x: Math.random() * 2800 + 100, y: Math.random() * 2800 + 100, activo: true, mapa: 'principal' }); } }
function generarEsqueletosIniciales() { esqueletos = []; for (let i = 0; i < 100; i++) { esqueletos.push({ id: 'esqueleto_' + (nextSkeletonId++), x: Math.random() * 2800 + 100, y: Math.random() * 2800 + 100, hp: CONFIG.SKELETON.MAX_HP, maxHp: CONFIG.SKELETON.MAX_HP, isAlive: true, isAlly: false, ownerId: null, targetId: null, targetType: null, dir: 'Abajo', attackCooldown: 0, damageBonus: 0, baseDamage: CONFIG.SKELETON.ATTACK_DAMAGE, attackers: [], aturdido: false, mapa: 'principal' }); } return esqueletos; }
function generarInvocadores() { invocadores = []; for (let i = 0; i < CONFIG.INVOCADOR.CANTIDAD; i++) { invocadores.push({ id: 'invocador_' + (nextInvocadorId++), x: Math.random() * 2800 + 100, y: Math.random() * 2800 + 100, hp: CONFIG.INVOCADOR.MAX_HP, maxHp: CONFIG.INVOCADOR.MAX_HP, isAlive: true, dir: 'Abajo', estado: 'idle', attackCooldown: 0, furiaCooldown: 0, furiaActiva: false, furiaFin: 0, golpesRecibidos: [], escapeInicio: 0, teleportDestino: null, mapa: 'principal', esInvocador: true, velActual: CONFIG.INVOCADOR.SPEED, atacandoMelee: false, ultimoAtaqueMelee: 0 }); } console.log(`✅ ${invocadores.length} invocadores generados`); }

function buscarObjetivo(e) { const ahora = Date.now(); if (e.ultimoAtacante && e.ultimoAtacanteId && ahora - e.ultimoAtacante < 3000) { let atacante = players[e.ultimoAtacanteId] || esqueletos.find(s => s.id === e.ultimoAtacanteId) || (demonlord.id === e.ultimoAtacanteId ? demonlord : null) || invocadores.find(i => i.id === e.ultimoAtacanteId); if (atacante && atacante.isAlive !== false) { return { closest: atacante, closestDist: getDistance(e.x, e.y, atacante.x, atacante.y), closestType: 'aggro' }; } } let closest = null, closestDist = Infinity, closestType = null; for (let id in players) { let p = players[id]; if (p && p.isAlive && (jugadoresEnMapa[id] || 'principal') === 'principal') { let d = getDistance(e.x, e.y, p.x, p.y); if (d < closestDist && d < CONFIG.SKELETON.VISION_RANGE) { closestDist = d; closest = p; closestType = 'player'; } } } for (let oe of esqueletos) { if (oe.isAlive && oe.isAlly && oe.id !== e.id) { let d = getDistance(e.x, e.y, oe.x, oe.y); if (d < closestDist && d < CONFIG.SKELETON.VISION_RANGE) { closestDist = d; closest = oe; closestType = 'ally_skeleton'; } } } if (demonlord && demonlord.isAlive) { let d = getDistance(e.x, e.y, demonlord.x, demonlord.y); if (d < closestDist && d < CONFIG.SKELETON.VISION_RANGE) { closestDist = d; closest = demonlord; closestType = 'demonlord'; } } return { closest, closestDist, closestType }; }

function buscarObjetivoAliado(e) { const ahora = Date.now(); if (e.ultimoAtacante && e.ultimoAtacanteId && ahora - e.ultimoAtacante < 3000) { let atacante = esqueletos.find(s => s.id === e.ultimoAtacanteId && !s.isAlly) || (demonlord.id === e.ultimoAtacanteId ? demonlord : null) || invocadores.find(i => i.id === e.ultimoAtacanteId); if (atacante && atacante.isAlive !== false) { return { closest: atacante, closestDist: getDistance(e.x, e.y, atacante.x, atacante.y) }; } } let closest = null, closestDist = Infinity; for (let oe of esqueletos) { if (oe.isAlive && !oe.isAlly && oe.id !== e.id) { let d = getDistance(e.x, e.y, oe.x, oe.y); if (d < closestDist && d < CONFIG.SKELETON.VISION_RANGE) { closestDist = d; closest = oe; } } } if (demonlord && demonlord.isAlive) { let d = getDistance(e.x, e.y, demonlord.x, demonlord.y); if (d < closestDist && d < CONFIG.SKELETON.VISION_RANGE) { closestDist = d; closest = demonlord; } } for (let inv of invocadores) { if (inv.isAlive) { let d = getDistance(e.x, e.y, inv.x, inv.y); if (d < closestDist && d < CONFIG.SKELETON.VISION_RANGE) { closestDist = d; closest = inv; } } } return { closest, closestDist }; }

function invocarEsqueletosDelInvocador(invocadorId) { const inv = invocadores.find(i => i.id === invocadorId); if (!inv || !inv.isAlive) return; const propios = esqueletos.filter(e => e.isAlive && e.ownerId === inv.id); if (propios.length >= CONFIG.INVOCADOR.MAX_SKELETONS) return; const faltantes = CONFIG.INVOCADOR.MAX_SKELETONS - propios.length; const aInvocar = Math.min(CONFIG.INVOCADOR.SUMMON_BATCH, faltantes); for (let i = 0; i < aInvocar; i++) { const id = 'esqueleto_' + (nextSkeletonId++); const angulo = Math.random() * Math.PI * 2; const dist = 40 + Math.random() * (CONFIG.INVOCADOR.SUMMON_RADIUS - 40); const x = Math.min(Math.max(inv.x + Math.cos(angulo) * dist, 50), 2950); const y = Math.min(Math.max(inv.y + Math.sin(angulo) * dist, 50), 2950); const nuevoEsq = { id: id, x: x, y: y, hp: CONFIG.SKELETON.MAX_HP, maxHp: CONFIG.SKELETON.MAX_HP, isAlive: true, isAlly: false, ownerId: inv.id, targetId: null, targetType: null, dir: 'Abajo', attackCooldown: 0, damageBonus: 0, baseDamage: CONFIG.SKELETON.ATTACK_DAMAGE, attackers: [], aturdido: false, mapa: 'principal', speedBonus: 0, esInvocado: true, ultimoAtacante: 0, ultimoAtacanteId: null }; esqueletos.push(nuevoEsq); io.emit('esqueletoNew', { id: id, x: x, y: y }); } io.emit('invocadorAttack', { id: inv.id, dir: inv.dir }); }

function activarFuriaInvocador(invocadorId) { const inv = invocadores.find(i => i.id === invocadorId); if (!inv || !inv.isAlive || inv.furiaActiva) return; const misEsq = esqueletos.filter(e => e.isAlive && e.ownerId === inv.id); if (misEsq.length < CONFIG.INVOCADOR.FURIA_MIN_SKELETONS) return; const ahora = Date.now(); if (ahora - inv.furiaCooldown < CONFIG.INVOCADOR.FURIA_COOLDOWN) return; inv.furiaActiva = true; inv.furiaFin = ahora + CONFIG.INVOCADOR.FURIA_DURATION; inv.furiaCooldown = ahora; const cant = misEsq.length; const bonusDaño = cant * CONFIG.INVOCADOR.FURIA_DAMAGE_PER_SKELETON; const bonusVel = cant * CONFIG.INVOCADOR.FURIA_SPEED_PER_SKELETON; misEsq.forEach(e => { e.damageBonus = Math.floor(CONFIG.SKELETON.ATTACK_DAMAGE * bonusDaño); e.speedBonus = bonusVel; }); io.emit('invocadorFuria', { invocadorId: inv.id, esqueletosIds: misEsq.map(e => e.id), bonusDaño: bonusDaño, bonusVel: bonusVel, duracion: 10 }); }

function desactivarFuriaInvocador(invocadorId) { const inv = invocadores.find(i => i.id === invocadorId); if (!inv || !inv.furiaActiva) return; inv.furiaActiva = false; esqueletos.filter(e => e.ownerId === inv.id).forEach(e => { e.damageBonus = 0; e.speedBonus = 0; }); io.emit('invocadorFuriaEnd', { invocadorId: inv.id }); }

function teletransportarInvocador(invocadorId) { const inv = invocadores.find(i => i.id === invocadorId); if (!inv || !inv.isAlive) return; const atacanteCercano = players[inv.ultimoAtacanteId]; let cx = inv.x, cy = inv.y; if (atacanteCercano && atacanteCercano.isAlive) { cx = atacanteCercano.x; cy = atacanteCercano.y; } let nuevoX, nuevoY, intentos = 0, valido = false; while (!valido && intentos < 20) { intentos++; const angulo = Math.random() * Math.PI * 2; const dist = CONFIG.INVOCADOR.TELEPORT_MIN_DIST + Math.random() * (CONFIG.INVOCADOR.TELEPORT_MAX_DIST - CONFIG.INVOCADOR.TELEPORT_MIN_DIST); nuevoX = Math.min(Math.max(cx + Math.cos(angulo) * dist, 100), 2900); nuevoY = Math.min(Math.max(cy + Math.sin(angulo) * dist, 100), 2900); if (!colisionaConObjeto(nuevoX, nuevoY, 50)) valido = true; } if (!valido) { nuevoX = Math.random() * 2800 + 100; nuevoY = Math.random() * 2800 + 100; } inv.x = nuevoX; inv.y = nuevoY; inv.golpesRecibidos = []; inv.ultimoAtacante = 0; inv.ultimoAtacanteId = null; inv.estado = 'reaparecer'; io.emit('invocadorTeleportEnd', { id: inv.id, x: inv.x, y: inv.y }); }

function daniarInvocador(invocadorId, danio, atacanteId) { const inv = invocadores.find(i => i.id === invocadorId); if (!inv || !inv.isAlive) return; const ahora = Date.now(); inv.golpesRecibidos.push(ahora); inv.golpesRecibidos = inv.golpesRecibidos.filter(t => ahora - t < CONFIG.INVOCADOR.HIT_WINDOW); inv.ultimoAtacante = ahora; inv.ultimoAtacanteId = atacanteId; inv.hp = Math.max(0, inv.hp - danio); io.emit('enemyDamaged', { id: inv.id, x: inv.x, y: inv.y, dmg: danio }); if (inv.hp <= 0) { inv.isAlive = false; inv.furiaActiva = false; esqueletos.filter(e => e.ownerId === inv.id).forEach(e => { e.damageBonus = 0; e.speedBonus = 0; }); const oro = CONFIG.INVOCADOR.DROP_ORO.min + Math.floor(Math.random() * (CONFIG.INVOCADOR.DROP_ORO.max - CONFIG.INVOCADOR.DROP_ORO.min + 1)); io.emit('crearMonedaServidor', { x: inv.x, y: inv.y, cantidad: aplicarOroExtra(atacanteId, oro) }); if (Math.random() < 0.5) io.emit('dropPocion', { x: inv.x + 20, y: inv.y, tipo: 'hp', cantidad: CONFIG.INVOCADOR.DROP_POCION_HP }); if (Math.random() < 0.5) io.emit('dropPocion', { x: inv.x - 20, y: inv.y, tipo: 'mana', cantidad: CONFIG.INVOCADOR.DROP_POCION_MANA }); if (Math.random() < CONFIG.INVOCADOR.DROP_ITEM_RARO) { const items = ['espada_2', 'escudo_2', 'armadura_2']; dropearItem(inv.x, inv.y + 30, items[Math.floor(Math.random() * items.length)]); } if (Math.random() < 0.0005) dropearItem(inv.x + 40, inv.y + 50, 'bastondesangreleg'); if (Math.random() < 0.25) dropearItem(inv.x - 40, inv.y + 50, 'bastondehueso'); if (Math.random() < 0.15) dropearItem(inv.x - 20, inv.y + 60, 'bastondehueso_1'); if (Math.random() < 0.08) dropearItem(inv.x, inv.y + 70, 'bastondehueso_2'); if (Math.random() < 0.04) dropearItem(inv.x + 20, inv.y + 80, 'bastondehueso_3'); if (Math.random() < 0.01) dropearItem(inv.x + 40, inv.y + 90, 'bastondehuesoleg'); darExpAJugadorYEquipo(atacanteId, CONFIG.INVOCADOR.EXP); io.emit('invocadorDeath', { id: inv.id, x: inv.x, y: inv.y }); setTimeout(() => { inv.hp = CONFIG.INVOCADOR.MAX_HP; inv.isAlive = true; inv.x = Math.random() * 2800 + 100; inv.y = Math.random() * 2800 + 100; inv.golpesRecibidos = []; inv.estado = 'idle'; inv.furiaActiva = false; inv.ultimoAtacante = 0; inv.ultimoAtacanteId = null; io.emit('invocadorNew', { id: inv.id, x: inv.x, y: inv.y }); }, CONFIG.INVOCADOR.RESPAWN_TIME); return; } if (inv.golpesRecibidos.length >= CONFIG.INVOCADOR.HIT_THRESHOLD && inv.estado !== 'huir' && inv.estado !== 'escapar' && inv.estado !== 'reaparecer') { inv.estado = 'huir'; inv.escapeInicio = ahora; inv.golpesRecibidos = []; io.emit('invocadorEscape', { id: inv.id }); } }

function dropearItem(x, y, itemId) { const item = ITEMS_DATA[itemId]; if (!item) return; io.emit('dropItem', { x, y, itemId, nombre: item.nombre, tipo: item.tipo, icono: item.icono, stats: item.stats, calidad: item.calidad || '', textoVerde: item.textoVerde || false, textoDorado: item.textoDorado || false, lootIndicator: item.lootIndicator || 'white' }); }

function generarLootCofre() { const loot = []; if (Math.random() < 0.10) { loot.push({ tipo: 'vacio' }); return loot; } if (Math.random() < 0.50) loot.push({ tipo: 'oro', cantidad: Math.floor(Math.random() * 14990) + 10 }); if (Math.random() < 0.30) { const items = ['armadura_1', 'espada_1', 'escudo_1', 'hachadehierro_1', 'escudo_espejo_1', 'anillo_cura_1']; loot.push({ tipo: 'item', id: items[Math.floor(Math.random() * items.length)] }); } if (Math.random() < 0.15) { const items = ['armadura_2', 'espada_2', 'escudo_2', 'hachadehierro_2', 'escudo_espejo_2', 'anillo_cura_2']; loot.push({ tipo: 'item', id: items[Math.floor(Math.random() * items.length)] }); } if (Math.random() < 0.05) { const items = ['armadura_3', 'espada_3', 'escudo_3', 'hachadehierro_3', 'escudo_espejo_3', 'anillo_cura_3']; loot.push({ tipo: 'item', id: items[Math.floor(Math.random() * items.length)] }); } if (Math.random() < 0.40) loot.push({ tipo: 'pocion', clase: 'hp', cantidad: Math.floor(Math.random() * 15) + 1 }); if (Math.random() < 0.40) loot.push({ tipo: 'pocion', clase: 'mana', cantidad: Math.floor(Math.random() * 15) + 1 }); if (Math.random() < 0.30) loot.push({ tipo: 'material', nombre: 'hierro', cantidad: Math.floor(Math.random() * 16) + 5 }); if (Math.random() < 0.20) loot.push({ tipo: 'material', nombre: 'acero', cantidad: Math.floor(Math.random() * 13) + 3 }); if (Math.random() < 0.35) loot.push({ tipo: 'material', nombre: 'cobre', cantidad: Math.floor(Math.random() * 21) + 5 }); if (Math.random() < 0.25) loot.push({ tipo: 'material', nombre: 'plata', cantidad: Math.floor(Math.random() * 13) + 3 }); if (Math.random() < 0.10) loot.push({ tipo: 'material', nombre: 'mithril', cantidad: Math.floor(Math.random() * 10) + 1 }); if (Math.random() < 0.05) loot.push({ tipo: 'material', nombre: 'titanio', cantidad: Math.floor(Math.random() * 5) + 1 }); if (Math.random() < 0.02) loot.push({ tipo: 'material', nombre: 'adamantium', cantidad: Math.floor(Math.random() * 3) + 1 }); return loot; }

function tieneHachaLegendaria(jugador) { if (!jugador) return false; const armaId = jugador.equipamiento?.arma; if (armaId && armaId.includes('hachadehierroleg')) return true; const inventario = inventariosJugadores[jugador.id]; if (inventario && inventario.items) { const itemArma = inventario.items.find(i => i.id === armaId); if (itemArma && (itemArma.idBase === 'hachadehierroleg' || (itemArma.id && itemArma.id.includes('hachadehierroleg')) || itemArma.nombre === 'Hacha Legendaria')) return true; } return false; }

function colisionaConObjeto(x, y, radio) { for (let mina of minas) { if (mina.activo && getDistance(x, y, mina.x, mina.y) < radio + 35) return true; } return false; }

function getVelocidadEsqueleto(e) { for (let id in esqueletosEnAuraSacrificio) { if (esqueletosEnAuraSacrificio[id] && esqueletosEnAuraSacrificio[id].includes(e.id)) { return CONFIG.SKELETON.SPEED * 0.85; } } return CONFIG.SKELETON.SPEED; }

function moverEsqueletoHaciaObjetivo(e, objetivo) { const dx = objetivo.x - e.x, dy = objetivo.y - e.y, dist = Math.hypot(dx, dy); if (dist < 35) return; const velE = getVelocidadEsqueleto(e); const moveX = (dx / dist) * velE, moveY = (dy / dist) * velE; let newX = Math.min(Math.max(e.x + moveX, 50), 2950), newY = Math.min(Math.max(e.y + moveY, 50), 2950); if (colisionaConObjeto(newX, newY, 20)) { newX = Math.min(Math.max(e.x + moveX, 50), 2950); newY = e.y; if (!colisionaConObjeto(newX, newY, 20)) { e.x = newX; e.y = newY; e.dir = dx > 0 ? 'Derecha' : 'Izquierda'; io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: true }); return; } newX = e.x; newY = Math.min(Math.max(e.y + moveY, 50), 2950); if (!colisionaConObjeto(newX, newY, 20)) { e.x = newX; e.y = newY; e.dir = dy > 0 ? 'Abajo' : 'Arriba'; io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: true }); return; } io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false }); return; } e.x = newX; e.y = newY; if (Math.abs(dx) > Math.abs(dy)) e.dir = dx > 0 ? 'Derecha' : 'Izquierda'; else e.dir = dy > 0 ? 'Abajo' : 'Arriba'; io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: true }); }

function aplicarQuemadura(objetivoId, dañoFuegoTotal, duracionSegundos = 5) { if (!estadosAlterados[objetivoId]) estadosAlterados[objetivoId] = {}; const danioPorTick = Math.floor(dañoFuegoTotal * 0.1); estadosAlterados[objetivoId].quemadura = { danio: danioPorTick, fin: Date.now() + (duracionSegundos * 1000) }; let ox = 0, oy = 0; const obj = esqueletos.find(e => e.id === objetivoId); if (obj) { ox = obj.x; oy = obj.y; } else if (objetivoId === 'demonlord') { ox = demonlord.x; oy = demonlord.y; } io.emit('enemyDamaged', { id: objetivoId, x: ox, y: oy, dmg: danioPorTick, tipo: 'quemadura' }); }

function aplicarAturdimiento(objetivoId, duracionSegundos = 5) { if (!estadosAlterados[objetivoId]) estadosAlterados[objetivoId] = {}; estadosAlterados[objetivoId].aturdimiento = { fin: Date.now() + (duracionSegundos * 1000) }; const esqueleto = esqueletos.find(e => e.id === objetivoId && e.isAlive); if (esqueleto) { esqueleto.aturdido = true; io.emit('esqueletoMoved', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dir: esqueleto.dir, isMoving: false }); } if (objetivoId === 'demonlord' && demonlord.isAlive) { demonlord.aturdido = true; io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: false }); } }

function daniarEsqueleto(esqueleto, atacanteId, danio, elemento = null) { if (!esqueleto || !esqueleto.isAlive) return; esqueleto.ultimoAtacante = Date.now(); esqueleto.ultimoAtacanteId = atacanteId; const jugador = players[atacanteId]; if (jugador && elemento === 'fuego') { const armaId = jugador.equipamiento?.arma; if (armaId) { const inv = inventariosJugadores[atacanteId]; if (inv) { const arma = inv.items.find(i => i.id === armaId); if (arma && (arma.idBase === 'bastondefuegoleg' || arma.nombre === 'Baston de Fuego Legendario')) { if (Math.random() < 0.15) { const dañoFuegoTotal = (jugador.stats?.atqFuego || 0) + 500; aplicarQuemadura(esqueleto.id, dañoFuegoTotal, 5); io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${jugador.name} aplico QUEMADURA!` }); } } } } } if (jugador && elemento === 'luz') { const armaId = jugador.equipamiento?.arma; if (armaId) { const inv = inventariosJugadores[atacanteId]; if (inv) { const arma = inv.items.find(i => i.id === armaId); if (arma && (arma.idBase === 'bastonderayoleg' || arma.nombre === 'Baston de Rayo Legendario')) { if (Math.random() < 0.15) { aplicarAturdimiento(esqueleto.id, 5); io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${jugador.name} aplico ATURDIMIENTO!` }); } } } } } if (jugador && jugador.stats && jugador.stats.brutalidad > 0) { const knockback = 5 + (jugador.stats.brutalidad || 0) * 1.5; const angle = Math.atan2(esqueleto.y - jugador.y, esqueleto.x - jugador.x); esqueleto.x = Math.min(Math.max(esqueleto.x + Math.cos(angle) * knockback, 50), 2950); esqueleto.y = Math.min(Math.max(esqueleto.y + Math.sin(angle) * knockback, 50), 2950); io.emit('esqueletoMoved', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dir: esqueleto.dir, isMoving: true }); } if (!esqueleto.attackers) esqueleto.attackers = []; if (!esqueleto.attackers.includes(atacanteId)) esqueleto.attackers.push(atacanteId); esqueleto.hp = Math.max(0, esqueleto.hp - danio); io.emit('enemyDamaged', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dmg: danio }); if (esqueleto.hp <= 0) { esqueleto.isAlive = false; esqueleto.yaCosechado = false; esqueletos.forEach(o => { if (o.isAlive && o.targetId === esqueleto.id) { o.targetId = null; o.targetType = null; } }); if (players[atacanteId] && players[atacanteId].className === 'BARBARO') io.emit('barbaroAsesinato', { playerId: atacanteId }); if (Math.random() < 0.1) io.emit('dropPocion', { x: esqueleto.x, y: esqueleto.y, tipo: Math.random() < 0.5 ? 'hp' : 'mana', cantidad: 1 }); const dropRand = Math.random(); let dropObtenido = false; for (const [id, data] of Object.entries(ITEMS_DATA)) { if (id !== 'hachadehierroleg' && id !== 'bastondefuegoleg' && id !== 'bastonderayoleg' && id !== 'bastondesangreleg' && dropRand < data.dropChance && !dropObtenido) { dropearItem(esqueleto.x, esqueleto.y, id); dropObtenido = true; } } if (esqueleto.attackers && esqueleto.attackers.length > 0) esqueleto.attackers.forEach(a => darExpAJugadorYEquipo(a, CONFIG.SKELETON.EXP)); else darExpAJugadorYEquipo(atacanteId, CONFIG.SKELETON.EXP); io.emit('esqueletoDeath', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, exp: CONFIG.SKELETON.EXP, attackers: esqueleto.attackers || [], dir: esqueleto.dir || 'Abajo' }); setTimeout(() => { if (!esqueleto.isAlive && !esqueleto.isAlly) { esqueleto.isAlive = true; esqueleto.hp = CONFIG.SKELETON.MAX_HP; esqueleto.x = Math.random() * 2800 + 100; esqueleto.y = Math.random() * 2800 + 100; esqueleto.attackers = []; esqueleto.targetId = null; esqueleto.targetType = null; esqueleto.attackCooldown = 0; esqueleto.dir = 'Abajo'; esqueleto.aturdido = false; esqueleto.ultimoAtacante = 0; esqueleto.ultimoAtacanteId = null; io.emit('esqueletoNew', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y }); } }, CONFIG.SKELETON.RESPAWN_TIME); } }

// ═══════════════════════════════════════════════════════════════
// ═══ FIN PARTE 1/3 — SERVIDOR ═══
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// ═══ PARTE 2/3 — SERVIDOR: INICIO, INTERVALOS, IA ═══
// ═══════════════════════════════════════════════════════════════

console.log("DEVILAND SERVIDOR INICIADO");
generarArboles();
generarRocas();
generarMinas();
generarEsqueletosIniciales();
generarInvocadores();
generarPilares();   // ═══ NUEVO ═══

console.log(`Mundo generado: ${arboles.length} arboles, ${rocas.length} rocas, ${minas.length} minas, ${esqueletos.length} esqueletos`);
console.log(`Pilares: ${pilares.length} | Ligas: ${Object.keys(ligas).length}`);

setInterval(() => { esqueletos.forEach(e => { if (!e.isAlly) e.damageBonus = 0; }); }, 1000);

setInterval(() => {
    const ahora = Date.now();
    for (let id in estadosAlterados) {
        const estados = estadosAlterados[id];
        if (!estados) { delete estadosAlterados[id]; continue; }
        if (estados.quemadura && estados.quemadura.fin > ahora) {
            let objetivo = esqueletos.find(e => e.id === id && e.isAlive);
            let esDemonlord = false;
            if (!objetivo && id === 'demonlord' && demonlord.isAlive) { objetivo = demonlord; esDemonlord = true; }
            if (objetivo) {
                objetivo.hp = Math.max(0, objetivo.hp - estados.quemadura.danio);
                io.emit('enemyDamaged', { id: id, x: objetivo.x, y: objetivo.y, dmg: estados.quemadura.danio, tipo: 'quemadura' });
                if (objetivo.hp <= 0) {
                    if (esDemonlord) {
                        demonlord.isAlive = false; demonlord.aturdido = false;
                        io.emit('demonlordDeath', { x: demonlord.x, y: demonlord.y, attackers: demonlord.attackers || [] });
                        setTimeout(() => { demonlord.hp = CONFIG.DEMONLORD.MAX_HP; demonlord.isAlive = true; demonlord.x = 1500; demonlord.y = 1500; demonlord.attackers = []; io.emit('demonlordRespawn', { x: demonlord.x, y: demonlord.y }); }, CONFIG.DEMONLORD.RESPAWN_TIME);
                    } else {
                        objetivo.isAlive = false; objetivo.aturdido = false;
                        io.emit('esqueletoDeath', { id: objetivo.id, x: objetivo.x, y: objetivo.y, exp: CONFIG.SKELETON.EXP, attackers: objetivo.attackers || [], dir: objetivo.dir || 'Abajo' });
                        setTimeout(() => { if (!objetivo.isAlive && !objetivo.isAlly) { objetivo.isAlive = true; objetivo.hp = CONFIG.SKELETON.MAX_HP; objetivo.x = Math.random() * 2800 + 100; objetivo.y = Math.random() * 2800 + 100; objetivo.attackers = []; objetivo.targetId = null; objetivo.targetType = null; objetivo.attackCooldown = 0; objetivo.dir = 'Abajo'; io.emit('esqueletoNew', { id: objetivo.id, x: objetivo.x, y: objetivo.y }); } }, CONFIG.SKELETON.RESPAWN_TIME);
                    }
                    delete estadosAlterados[id];
                }
            } else { delete estadosAlterados[id]; }
        } else if (estados.quemadura) { delete estados.quemadura; }
        if (estados.aturdimiento && estados.aturdimiento.fin <= ahora) {
            const esqueleto = esqueletos.find(e => e.id === id);
            if (esqueleto) esqueleto.aturdido = false;
            if (id === 'demonlord') demonlord.aturdido = false;
            delete estados.aturdimiento;
            io.emit('estadoTerminado', { id: id, tipo: 'aturdimiento' });
        }
        if (Object.keys(estados).length === 0) { delete estadosAlterados[id]; }
    }
}, 1000);

// ═══════════════════════════════════════════════════════════════
// ═══ NUEVO: INTERVALO DE REGENERACIÓN Y VENTANA DE PILARES ═══
// ═══════════════════════════════════════════════════════════════
setInterval(() => {
    regenerarPilares();
}, 60000);
// ═══════════════════════════════════════════════════════════════
// 💰 PRODUCCIÓN PASIVA DE ORO POR PILAR AMARILLO
// ═══════════════════════════════════════════════════════════════
setInterval(() => {
    pilares.forEach(p => {
        // Solo pilares amarillos con dueño
        if (p.color !== 'amarillo' || !p.dueñoId) return;
        // ═══ NUEVO: No generar si el pilar está destruido ═══
        if (p.hp <= 0) return;
        const dueño = players[p.dueñoId];
        if (!dueño || !dueño.isAlive) return;
        // Base: 50 oro cada 30 segundos
        // +50 oro por cada nivel de buff (nivelBuff)
        const nivelBuff = p.nivelBuff || 0;
        const oroBase = 50 + (nivelBuff * 50);
        // Bonus por liga (+10% si el pilar tiene liga)
        const bonusLiga = p.dueñoLigaId ? 1.10 : 1.00;
        const oroFinal = Math.floor(oroBase * bonusLiga);
        // Sumar al inventario
if (!inventariosJugadores[p.dueñoId]) inventariosJugadores[p.dueñoId] = { items: [], equipamiento: {} };
const inv = inventariosJugadores[p.dueñoId];
if (!inv.items) inv.items = [];
const oroItem = inv.items.find(i => i.id === 'oro');
if (oroItem) {
    oroItem.cantidad += oroFinal;
} else {
    // ═══ NUEVO: Buscar el primer slot libre (0-35) ═══
    const slotsOcupados = new Set(inv.items.map(i => i.slot).filter(s => typeof s === 'number' && s >= 0));
    let slotLibre = -1;
    for (let i = 0; i < 36; i++) {
        if (!slotsOcupados.has(i)) { slotLibre = i; break; }
    }
    if (slotLibre === -1) {
        // Inventario lleno: igual guardamos el oro sin slot (no se mostrará pero no se pierde)
        console.log(`⚠️ Inventario lleno para ${p.dueñoId}, oro guardado sin slot`);
        inv.items.push({ id: 'oro', tipo: 'moneda', nombre: 'Oro', icono: '💰', cantidad: oroFinal, slot: -1 });
    } else {
        inv.items.push({ id: 'oro', tipo: 'moneda', nombre: 'Oro', icono: '💰', cantidad: oroFinal, slot: slotLibre });
    }
}
        // Notificar al dueño
        io.to(p.dueñoId).emit('oroPilarGenerado', {
            pilarId: p.id,
            cantidad: oroFinal,
            nivelBuff: nivelBuff,
            bonusLiga: p.dueñoLigaId ? 10 : 0,
            totalOro: oroItem ? oroItem.cantidad : oroFinal
        });
        // Reenviar inventario actualizado al cliente
        const materialesActuales = {};
        inv.items.forEach(it => {
            if (it.tipo === 'material' && it.nombre) {
                materialesActuales[it.nombre] = (materialesActuales[it.nombre] || 0) + (it.cantidad || 0);
            }
        });
        io.to(p.dueñoId).emit('inventarioCompleto', { ...inv, materiales: materialesActuales });
    });
}, 30000);   // cada 30 segundos
// ═══════════════════════════════════════════════════════════════
// ═══ NUEVO: INTERVALO DE BUFF DE PILARES A JUGADORES ═══
// Aplica el buff de vida/maná a los jugadores que tienen pilares
// ═══════════════════════════════════════════════════════════════
setInterval(() => {
    for (let socketId in players) {
        const j = players[socketId];
        if (!j || !j.isAlive) continue;
        const buffVida = obtenerBuffPilarJugador(socketId, 'vida');
        const buffMana = obtenerBuffPilarJugador(socketId, 'mana');
        // Recalcular maxHp y maxMana con buffs
        const bs = CONFIG.PLAYER.BASE_STATS[j.class] || CONFIG.PLAYER.BASE_STATS.warrior;
        let hpBase = (j.className === 'BARBARO' ? 800 : (j.className === 'MAGO' || j.className === 'NECROMANCER' ? 300 : 500)) + ((j.stats?.vitalidad || 0) * 10);
        let manaBase = bs.mana || 100;
        const inv = inventariosJugadores[socketId];
        if (inv && j.equipamiento?.arma) {
            const arma = inv.items.find(i => i.id === j.equipamiento.arma);
            if (arma && arma.manaBonus) manaBase += arma.manaBonus;
        }
        let manaTotal = manaBase + ((j.stats?.sabiduria || 0) * 10) + ((j.stats?.inteligencia || 0) * 10);
        let hpTotal = hpBase + (hpBase * buffVida);
        let manaTotalConBuff = manaTotal + (manaTotal * buffMana);
        if (j.maxHp !== Math.floor(hpTotal)) {
            j.maxHp = Math.floor(hpTotal);
            if (j.hp > j.maxHp) j.hp = j.maxHp;
            io.emit('playerStatsUpdate', { id: socketId, hp: j.hp, maxHp: j.maxHp });
        }
        if (j.maxMana !== Math.floor(manaTotalConBuff)) {
            j.maxMana = Math.floor(manaTotalConBuff);
            if (j.mana > j.maxMana) j.mana = j.maxMana;
            io.emit('playerStatsUpdate', { id: socketId, mana: j.mana, maxMana: j.maxMana });
        }
    }
}, 5000);

// ═══════════════════════════════════════════════════════════════
// ═══ IA DEL DEMONLORD (sin cambios) ═══
// ═══════════════════════════════════════════════════════════════
setInterval(() => {
    if (!demonlord.isAlive) return;
    if (demonlord.aturdido) { io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: false }); return; }
    let closest = null, closestDist = Infinity;
    for (let id in players) { let p = players[id]; if (p && p.isAlive && (jugadoresEnMapa[id] || 'principal') === 'principal') { let d = getDistance(demonlord.x, demonlord.y, p.x, p.y); if (d < closestDist) { closestDist = d; closest = p; } } }
    if (!closest) { for (let e of esqueletos) { if (e.isAlive && e.mapa === 'principal') { let d = getDistance(demonlord.x, demonlord.y, e.x, e.y); if (d < closestDist) { closestDist = d; closest = e; } } } }
    if (!closest) return;
    const dx = closest.x - demonlord.x, dy = closest.y - demonlord.y, dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > Math.abs(dy)) demonlord.dir = dx > 0 ? 'Derecha' : 'Izquierda'; else demonlord.dir = dy > 0 ? 'Abajo' : 'Arriba';
    if (dist < 400) {
        if (dist > 70) { const moveX = (dx/dist)*CONFIG.DEMONLORD.SPEED, moveY = (dy/dist)*CONFIG.DEMONLORD.SPEED; const newX = Math.min(Math.max(demonlord.x+moveX,50),2950), newY = Math.min(Math.max(demonlord.y+moveY,50),2950); if (!colisionaConObjeto(newX,newY,50)) { demonlord.x = newX; demonlord.y = newY; } io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: true }); } else { io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: false }); }
        if (demonlord.attackCooldown <= 0 && dist < 70) {
            demonlord.attackCooldown = CONFIG.DEMONLORD.ATTACK_COOLDOWN;
            io.emit('demonlordAtkVisual', { dir: demonlord.dir, esFuerte: Math.random()<0.2 });
            let hitbox = { x: demonlord.x - 25, y: demonlord.y + 10, w: 50, h: 30 };
            switch(demonlord.dir) { case 'Derecha': hitbox = { x: demonlord.x + 25, y: demonlord.y - 15, w: 45, h: 30 }; break; case 'Izquierda': hitbox = { x: demonlord.x - 70, y: demonlord.y - 15, w: 45, h: 30 }; break; case 'Arriba': hitbox = { x: demonlord.x - 25, y: demonlord.y - 60, w: 50, h: 30 }; break; case 'Abajo': hitbox = { x: demonlord.x - 25, y: demonlord.y + 10, w: 50, h: 30 }; break; }
            io.emit('demonlordAttack',{targetId:closest.id,damage:0,x:demonlord.x,y:demonlord.y,dir:demonlord.dir,hitbox:hitbox});
            const closestRef = closest, hitboxRef = hitbox;
            setTimeout(() => {
                if (!demonlord.isAlive || !closestRef) return;
                if (players[closestRef.id] && closestRef.hp <= 0) return;
                if (!players[closestRef.id] && !closestRef.isAlive) return;
                let objetivoBody;
                if (players[closestRef.id]) { objetivoBody = { x: closestRef.x - 20, y: closestRef.y - 20, w: 40, h: 40 }; } else { objetivoBody = { x: closestRef.x - 20, y: closestRef.y - 20, w: 40, h: 40 }; }
               if (rectanguloColisiona(hitboxRef, objetivoBody)) {
                   if (players[closestRef.id]) {
                        const jugadorObj = players[closestRef.id];
                        if (jugadorObj && jugadorObj.stats && jugadorObj.stats.destreza > 0) { const esquivaChance = 5 + (jugadorObj.stats.destreza||0); if (Math.random()*100 < esquivaChance) { io.to(closestRef.id).emit('chatMessage', { type:'system', name:'Sistema', msg:'Esquivaste el ataque del Demonlord!' }); io.emit('demonlordAttackMiss', { targetId: closestRef.id }); return; } }
                        let damage = calcularDañoFinal(closestRef.id, CONFIG.DEMONLORD.ATTACK_DAMAGE, 'fisico'); damage = Math.max(0, damage);
                        const j = players[closestRef.id];
                        if (j && tieneHachaLegendaria(j)) { j.contraGolpeContador = (j.contraGolpeContador||0)+1; j.contraGolpeDanioAcumulado = (j.contraGolpeDanioAcumulado||0)+damage; if (j.contraGolpeContador >= 10) { j.contraGolpeBonus = Math.floor(j.contraGolpeDanioAcumulado*0.15); j.contraGolpeCargado = true; io.emit('contraGolpeCargado', { playerId: j.id }); j.contraGolpeContador = 0; j.contraGolpeDanioAcumulado = 0; io.to(j.id).emit('chatMessage', { type:'system', name:'Sistema', msg:`Contra-golpe listo! +${j.contraGolpeBonus} de daño.` }); } }
                        let dañoReflejado = false;
                        if (j && j.className === 'CABALLERO') { const inv = inventariosJugadores[closestRef.id]; const escId = j.equipamiento?.escudo; if (escId && inv && inv.items) { const esc = inv.items.find(i => i.id === escId); if (esc && esc.nombre && esc.nombre.includes('Escudo Espejo')) { const prob = esc.nombre.includes('+++') ? 0.30 : (esc.nombre.includes('++') ? 0.20 : 0.15); if (Math.random() < prob) { demonlord.hp = Math.max(0, demonlord.hp - damage); io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: damage }); dañoReflejado = true; } } } }
                        if (!dañoReflejado) { closestRef.hp = Math.max(0, closestRef.hp - damage); io.emit('playerStatsUpdate', { id: closestRef.id, hp: closestRef.hp }); }
                        io.emit('demonlordAttackHit', { targetId: closestRef.id, damage: dañoReflejado ? 0 : Math.max(0, Math.floor(damage)), golpeX: hitboxRef.x + hitboxRef.w/2, golpeY: hitboxRef.y + hitboxRef.h/2 });
                        if (closestRef.hp <= 0) { closestRef.isAlive = false; io.emit('playerDeath', { id: closestRef.id, name: closestRef.name }); setTimeout(() => revivirJugador(closestRef.id), CONFIG.PLAYER.RESPAWN_TIME); }
                    } else { closestRef.hp = Math.max(0, closestRef.hp - Math.floor(CONFIG.DEMONLORD.ATTACK_DAMAGE)); io.emit('demonlordAttackHit', { targetId: closestRef.id, damage: Math.floor(CONFIG.DEMONLORD.ATTACK_DAMAGE), golpeX: hitboxRef.x + hitboxRef.w/2, golpeY: hitboxRef.y + hitboxRef.h/2 }); if (closestRef.hp <= 0) { closestRef.isAlive = false; io.emit('esqueletoDeath', { id: closestRef.id, x: closestRef.x, y: closestRef.y, exp: CONFIG.SKELETON.EXP, attackers: ['demonlord'], dir: closestRef.dir || 'Abajo' }); } }
                } else { io.emit('demonlordAttackMiss', { targetId: closestRef.id }); }
            }, 400);
        }
    } else { io.emit('demonlordMoved',{x:demonlord.x,y:demonlord.y,dir:demonlord.dir,isMoving:false}); }
    if(demonlord.attackCooldown>0)demonlord.attackCooldown-=100;
}, 100);

// ═══════════════════════════════════════════════════════════════
// ═══ IA DE ESQUELETOS (sin cambios) ═══
// ═══════════════════════════════════════════════════════════════
setInterval(() => {
    esqueletos.forEach(e => {
        if (!e.isAlive) return;
        if (e.reviviendoHasta && Date.now() < e.reviviendoHasta) { io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false }); return; }
        if (e.reviviendoHasta && Date.now() >= e.reviviendoHasta) { e.reviviendoHasta = null; }
        if (e.aturdido) { io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false }); return; }
        if (e.isAlly) {
            const objAliado = buscarObjetivoAliado(e);
            let closest = objAliado.closest;
            let closestDist = objAliado.closestDist;
            if (!closest) {
                const owner = players[e.ownerId];
                if (owner && owner.isAlive) {
                    const d = getDistance(e.x, e.y, owner.x, owner.y);
                    if (d > 80) {
                        const dx = owner.x - e.x, dy = owner.y - e.y;
                        const velE = getVelocidadEsqueleto(e);
                        const moveX = (dx/d)*velE, moveY = (dy/d)*velE;
                        const newX = Math.min(Math.max(e.x+moveX,50),2950), newY = Math.min(Math.max(e.y+moveY,50),2950);
                        if (!colisionaConObjeto(newX,newY,20)) { e.x = newX; e.y = newY; }
                        if (Math.abs(dx)>Math.abs(dy)) e.dir = dx>0?'Derecha':'Izquierda'; else e.dir = dy>0?'Abajo':'Arriba';
                        io.emit('esqueletoMoved',{id:e.id,x:e.x,y:e.y,dir:e.dir,isMoving:true});
                    } else { io.emit('esqueletoMoved',{id:e.id,x:e.x,y:e.y,dir:e.dir,isMoving:false}); }
                } else { io.emit('esqueletoMoved',{id:e.id,x:e.x,y:e.y,dir:e.dir,isMoving:false}); }
                return;
            }
            const dx = closest.x - e.x, dy = closest.y - e.y, dist = Math.hypot(dx, dy);
            if (dist > 35) { moverEsqueletoHaciaObjetivo(e, closest); } else { io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false }); }
            if (e.attackCooldown <= 0 && closestDist < 45) {
                e.attackCooldown = CONFIG.SKELETON.ATTACK_COOLDOWN;
                let hitbox = { x: e.x - 15, y: e.y + 5, w: 30, h: 20 };
                switch(e.dir) { case 'Derecha': hitbox = { x: e.x + 15, y: e.y - 10, w: 25, h: 20 }; break; case 'Izquierda': hitbox = { x: e.x - 40, y: e.y - 10, w: 25, h: 20 }; break; case 'Arriba': hitbox = { x: e.x - 15, y: e.y - 35, w: 30, h: 20 }; break; case 'Abajo': hitbox = { x: e.x - 15, y: e.y + 5, w: 30, h: 20 }; break; }
                io.emit('esqueletoAttackAnim', { id: e.id, targetId: closest.id, damage: 0, x: e.x, y: e.y, dir: e.dir, hitbox: hitbox });
                const esqueletoRef = e, closestRef = closest, hitboxRef = hitbox;
                setTimeout(() => {
                    if (!esqueletoRef.isAlive) return;
                    const esInvocador = closestRef.id && invocadores.find(i => i.id === closestRef.id);
                    let objetivoBody;
                    if (closestRef.id === 'demonlord') { objetivoBody = { x: demonlord.x - 25, y: demonlord.y - 40, w: 50, h: 80 }; }
                    else if (esInvocador) { objetivoBody = { x: closestRef.x - 5, y: closestRef.y + 15, w: 10, h: 10 }; }
                    else if (closestRef.isAlive) { objetivoBody = { x: closestRef.x - 20, y: closestRef.y - 20, w: 40, h: 40 }; }
                    else { io.emit('esqueletoAttackMiss', { id: esqueletoRef.id, targetId: closestRef.id }); return; }
                    if (rectanguloColisiona(hitboxRef, objetivoBody)) {
                        let damage = Math.max(0, CONFIG.SKELETON.ATTACK_DAMAGE + (esqueletoRef.damageBonus || 0));
                        if (closestRef.id === 'demonlord') {
                            demonlord.hp = Math.max(0, demonlord.hp - damage);
                            io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: Math.max(0, Math.floor(damage)) });
                            io.emit('esqueletoAttackHit', { id: esqueletoRef.id, targetId: closestRef.id, damage: Math.max(0, Math.floor(damage)), espadaX: hitboxRef.x + hitboxRef.w/2, espadaY: hitboxRef.y + hitboxRef.h/2 });
                            if (demonlord.hp <= 0) {
                                demonlord.isAlive = false;
                                const ownerId = esqueletoRef.ownerId;
                                if (ownerId && players[ownerId]) { if (!demonlord.attackers) demonlord.attackers = []; if (!demonlord.attackers.includes(ownerId)) demonlord.attackers.push(ownerId); }
                                if (Math.random() < 0.15) dropearItem(demonlord.x, demonlord.y, 'hachadehierroleg');
                                if (demonlord.attackers && demonlord.attackers.length > 0) demonlord.attackers.forEach(a => darExpAJugadorYEquipo(a, CONFIG.DEMONLORD.EXP)); else if (ownerId) darExpAJugadorYEquipo(ownerId, CONFIG.DEMONLORD.EXP);
                                for (let i = 0; i < 20; i++) { const ang = (i/20)*Math.PI*2; const dist2 = 60 + Math.random()*80; io.emit('crearMonedaServidor', { x: demonlord.x + Math.cos(ang)*dist2, y: demonlord.y + Math.sin(ang)*dist2, cantidad: Math.floor(Math.random()*50)+20 }); }
                                if (Math.random() < 0.3) { const rand = Math.random(); if (rand < 0.03) dropearItem(demonlord.x+(Math.random()-0.5)*80, demonlord.y+(Math.random()-0.5)*80, 'hachadehierro_3'); else if (rand < 0.15) dropearItem(demonlord.x+(Math.random()-0.5)*80, demonlord.y+(Math.random()-0.5)*80, 'hachadehierro_2'); else dropearItem(demonlord.x+(Math.random()-0.5)*80, demonlord.y+(Math.random()-0.5)*80, 'hachadehierro_1'); }
                                io.emit('demonlordDeath', { x: demonlord.x, y: demonlord.y, attackers: demonlord.attackers || [] });
                                setTimeout(() => { demonlord.hp = CONFIG.DEMONLORD.MAX_HP; demonlord.isAlive = true; demonlord.x = 1500; demonlord.y = 1500; demonlord.attackers = []; io.emit('demonlordRespawn', { x: demonlord.x, y: demonlord.y }); }, CONFIG.DEMONLORD.RESPAWN_TIME);
                            }
                        } else if (esInvocador) {
                            daniarInvocador(closestRef.id, Math.max(0, Math.floor(damage)), esqueletoRef.ownerId);
                            io.emit('esqueletoAttackHit', { id: esqueletoRef.id, targetId: closestRef.id, damage: Math.max(0, Math.floor(damage)), espadaX: hitboxRef.x + hitboxRef.w/2, espadaY: hitboxRef.y + hitboxRef.h/2 });
                        } else if (closestRef.isAlive && !closestRef.isAlly) {
                            closestRef.hp = Math.max(0, closestRef.hp - damage);
                            io.emit('enemyDamaged', { id: closestRef.id, x: closestRef.x, y: closestRef.y, dmg: Math.max(0, Math.floor(damage)) });
                            io.emit('esqueletoAttackHit', { id: esqueletoRef.id, targetId: closestRef.id, damage: Math.max(0, Math.floor(damage)), espadaX: hitboxRef.x + hitboxRef.w/2, espadaY: hitboxRef.y + hitboxRef.h/2 });
                            if (closestRef.hp <= 0) { closestRef.isAlive = false; io.emit('esqueletoDeath', { id: closestRef.id, x: closestRef.x, y: closestRef.y, exp: CONFIG.SKELETON.EXP, attackers: [esqueletoRef.ownerId].filter(Boolean), dir: closestRef.dir || 'Abajo' }); if (esqueletoRef.ownerId) darExpAJugadorYEquipo(esqueletoRef.ownerId, CONFIG.SKELETON.EXP); }
                        }
                    } else { io.emit('esqueletoAttackMiss', { id: esqueletoRef.id, targetId: closestRef.id }); }
                }, 400);
            }
            if (e.attackCooldown > 0) e.attackCooldown -= 100;
            return;
        }
        const obj = buscarObjetivo(e);
        let closest = obj.closest;
        let closestDist = obj.closestDist;
        if (!closest) { io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false }); return; }
        const dx = closest.x - e.x, dy = closest.y - e.y, dist = Math.hypot(dx, dy);
        if (dist > 35) { moverEsqueletoHaciaObjetivo(e, closest); } else { io.emit('esqueletoMoved', { id: e.id, x: e.x, y: e.y, dir: e.dir, isMoving: false }); }
        if (e.attackCooldown <= 0 && closestDist < 45) {
            e.attackCooldown = CONFIG.SKELETON.ATTACK_COOLDOWN;
            let hitbox = { x: e.x - 15, y: e.y + 5, w: 30, h: 20 };
            switch(e.dir) { case 'Derecha': hitbox = { x: e.x + 15, y: e.y - 10, w: 25, h: 20 }; break; case 'Izquierda': hitbox = { x: e.x - 40, y: e.y - 10, w: 25, h: 20 }; break; case 'Arriba': hitbox = { x: e.x - 15, y: e.y - 35, w: 30, h: 20 }; break; case 'Abajo': hitbox = { x: e.x - 15, y: e.y + 5, w: 30, h: 20 }; break; }
            io.emit('esqueletoAttackAnim', { id: e.id, targetId: closest.id, damage: 0, x: e.x, y: e.y, dir: e.dir, hitbox: hitbox });
            const esqueletoRef = e, closestRef = closest, hitboxRef = hitbox;
            setTimeout(() => {
                if (!esqueletoRef.isAlive) return;
                let objetivoBody;
                if (players[closestRef.id]) { objetivoBody = { x: closestRef.x - 20, y: closestRef.y - 20, w: 40, h: 40 }; }
                else if (closestRef.id === 'demonlord') { objetivoBody = { x: demonlord.x - 25, y: demonlord.y - 40, w: 50, h: 80 }; }
                else if (closestRef.isAlly) { objetivoBody = { x: closestRef.x - 20, y: closestRef.y - 20, w: 40, h: 40 }; }
                else if (invocadores.find(i => i.id === closestRef.id)) { objetivoBody = { x: closestRef.x - 25, y: closestRef.y + 15, w: 10, h: 10 }; }
                else { io.emit('esqueletoAttackMiss', { id: esqueletoRef.id, targetId: closestRef.id }); return; }
                if (rectanguloColisiona(hitboxRef, objetivoBody)) {
                    let danioBase = Math.max(0, CONFIG.SKELETON.ATTACK_DAMAGE), damage;
                    if (players[closestRef.id]) {
                        damage = Math.max(0, Math.floor(calcularDañoFinal(closestRef.id, danioBase, 'fisico')));
                        const j = players[closestRef.id];
                        if (j && tieneHachaLegendaria(j)) { j.contraGolpeContador = (j.contraGolpeContador||0)+1; j.contraGolpeDanioAcumulado = (j.contraGolpeDanioAcumulado||0)+damage; if (j.contraGolpeContador >= 10) { j.contraGolpeBonus = Math.floor(j.contraGolpeDanioAcumulado*0.15); j.contraGolpeCargado = true; io.emit('contraGolpeCargado', { playerId: j.id }); j.contraGolpeContador = 0; j.contraGolpeDanioAcumulado = 0; io.to(j.id).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `Contra-golpe listo! +${j.contraGolpeBonus} de daño.` }); } }
                        closestRef.hp = Math.max(0, closestRef.hp - damage);
                        io.emit('playerStatsUpdate', { id: closestRef.id, hp: closestRef.hp });
                        if (j && j.className === 'CABALLERO') { const inv = inventariosJugadores[closestRef.id]; const escId = j.equipamiento?.escudo; if (escId && inv && inv.items) { const esc = inv.items.find(i => i.id === escId); if (esc && esc.nombre && esc.nombre.includes('Escudo Espejo')) { const prob = esc.nombre.includes('+++') ? 0.30 : (esc.nombre.includes('++') ? 0.20 : 0.15); if (Math.random() < prob) { const ese = esqueletos.find(e => e.id === esqueletoRef.id); if (ese) { ese.hp = Math.max(0, ese.hp - damage); io.emit('enemyDamaged', { id: ese.id, x: ese.x, y: ese.y, dmg: damage }); } } } } }
                    } else if (closestRef.id === 'demonlord') { damage = danioBase; closestRef.hp = Math.max(0, closestRef.hp - damage); }
                    else if (closestRef.isAlly) { damage = danioBase; closestRef.hp = Math.max(0, closestRef.hp - damage); io.emit('enemyDamaged', { id: closestRef.id, x: closestRef.x, y: closestRef.y, dmg: Math.max(0, Math.floor(damage)) }); if (closestRef.hp <= 0) { closestRef.isAlive = false; io.emit('esqueletoDeath', { id: closestRef.id, x: closestRef.x, y: closestRef.y, exp: 0, attackers: [], dir: closestRef.dir || 'Abajo' }); } }
                    else if (invocadores.find(i => i.id === closestRef.id)) { damage = danioBase; daniarInvocador(closestRef.id, damage, esqueletoRef.ownerId); }
                    io.emit('esqueletoAttackHit', { id: esqueletoRef.id, targetId: closestRef.id, damage: Math.max(0, Math.floor(damage)), espadaX: hitboxRef.x + hitboxRef.w/2, espadaY: hitboxRef.y + hitboxRef.h/2 });
                    if (closestRef.hp <= 0) {
                        if (closestRef.id === 'demonlord') { closestRef.isAlive = false; io.emit('demonlordDeath', { x: closestRef.x, y: closestRef.y }); setTimeout(() => { demonlord.hp = CONFIG.DEMONLORD.MAX_HP; demonlord.isAlive = true; demonlord.x = 1500; demonlord.y = 1500; io.emit('demonlordRespawn', { x: demonlord.x, y: demonlord.y }); }, CONFIG.DEMONLORD.RESPAWN_TIME); }
                        else if (players[closestRef.id]) { closestRef.isAlive = false; io.emit('playerDeath', { id: closestRef.id, name: closestRef.name }); setTimeout(() => revivirJugador(closestRef.id), CONFIG.PLAYER.RESPAWN_TIME); }
                    }
                } else { io.emit('esqueletoAttackMiss', { id: esqueletoRef.id, targetId: closestRef.id }); }
            }, 400);
        }
        if (e.attackCooldown > 0) e.attackCooldown -= 100;
    });
}, 150);

setInterval(() => { const vivos = esqueletos.filter(e => e.isAlive).length; console.log(`Esqueletos vivos: ${vivos}/50`); }, 10000);
setInterval(() => { if (demonlord.isAlive && Math.random() < 0.3) io.emit('demonlordAtkVisual', { dir: demonlord.dir, esFuerte: Math.random() < 0.3 }); }, 2000);
setInterval(() => { esqueletos.forEach(e => { e.damageBonus = 0; }); }, 1000);

// ═══════════════════════════════════════════════════════════════
// ═══ DRENAJE PASIVO DEL BASTÓN DE SANGRE (sin cambios) ═══
// ═══════════════════════════════════════════════════════════════
setInterval(() => {
    const ahora = Date.now();
    for (let socketId in players) {
        const j = players[socketId];
        if (!j || !j.isAlive) continue;
        const armaId = j.equipamiento?.arma;
        if (!armaId) continue;
        const inv = inventariosJugadores[socketId];
        if (!inv || !inv.items) continue;
        const arma = inv.items.find(i => i.id === armaId);
        if (!arma || !arma.idBase || !arma.idBase.includes('bastondesangre')) continue;
        const nivelOscuridadJugador = j.stats?.atqOscuridad || 0;
        const nivelRequerido = arma.nivelOscuridadReq || 10;
        if (nivelOscuridadJugador < nivelRequerido) continue;
        if (!j.ultimoDrenajeSangre) j.ultimoDrenajeSangre = 0;
        if (ahora - j.ultimoDrenajeSangre < 10000) continue;
        let objetivoDrenaje = null;
        let menorDistancia = 200;
        for (let e of esqueletos) { if (e.isAlive && !e.isAlly) { const dist = getDistance(j.x, j.y, e.x, e.y); if (dist < menorDistancia) { menorDistancia = dist; objetivoDrenaje = e; } } }
        if (demonlord.isAlive && demonlord.hp > 0) { const dist = getDistance(j.x, j.y, demonlord.x, demonlord.y); if (dist < menorDistancia) { menorDistancia = dist; objetivoDrenaje = demonlord; } }
        if (!objetivoDrenaje) continue;
        const porcentajeDrenaje = arma.dañoSangre || 15;
        const vidaEnemigo = objetivoDrenaje.hp;
        const drenaje = Math.floor(vidaEnemigo * (porcentajeDrenaje / 100));
        objetivoDrenaje.hp = Math.max(0, objetivoDrenaje.hp - drenaje);
        j.hp = Math.min(j.maxHp, j.hp + drenaje);
        j.ultimoDrenajeSangre = ahora;
        const idObjetivo = objetivoDrenaje.id || 'demonlord';
        io.emit('enemyDamaged', { id: idObjetivo, x: objetivoDrenaje.x, y: objetivoDrenaje.y, dmg: drenaje, tipo: 'sangre' });
        io.emit('playerStatsUpdate', { id: socketId, hp: j.hp });
        io.to(socketId).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🩸 Drenaste ${drenaje} HP (${porcentajeDrenaje}%)` });
        if (objetivoDrenaje.hp <= 0 && idObjetivo !== 'demonlord') {
            objetivoDrenaje.isAlive = false;
            io.emit('esqueletoDeath', { id: objetivoDrenaje.id, x: objetivoDrenaje.x, y: objetivoDrenaje.y, exp: CONFIG.SKELETON.EXP, attackers: [socketId], dir: objetivoDrenaje.dir || 'Abajo' });
            setTimeout(() => { if (!objetivoDrenaje.isAlive && !objetivoDrenaje.isAlly) { objetivoDrenaje.isAlive = true; objetivoDrenaje.hp = CONFIG.SKELETON.MAX_HP; objetivoDrenaje.x = Math.random() * 2800 + 100; objetivoDrenaje.y = Math.random() * 2800 + 100; io.emit('esqueletoNew', { id: objetivoDrenaje.id, x: objetivoDrenaje.x, y: objetivoDrenaje.y }); } }, CONFIG.SKELETON.RESPAWN_TIME);
        }
    }
}, 10000);

// ═══════════════════════════════════════════════════════════════
// ═══ IA DE INVOCADORES (sin cambios) ═══
// ═══════════════════════════════════════════════════════════════
setInterval(() => {
    const ahora = Date.now();
    invocadores.forEach(inv => {
        if (!inv.isAlive) return;
        if (inv.estado === 'reaparecer') { if (ahora - inv.escapeInicio > 300) { inv.estado = 'idle'; io.emit('invocadorMoved', { id: inv.id, x: inv.x, y: inv.y, dir: inv.dir, isMoving: false, estado: 'idle' }); } return; }
        if (inv.estado === 'huir') {
            const tiempoHuyendo = ahora - inv.escapeInicio;
            if (tiempoHuyendo > CONFIG.INVOCADOR.ESCAPE_RUN_DURATION) { inv.estado = 'escapar'; io.emit('invocadorTeleportStart', { id: inv.id, dir: inv.dir }); setTimeout(() => { teletransportarInvocador(inv.id); }, 800); return; }
            const atacante = players[inv.ultimoAtacanteId];
            if (atacante && atacante.isAlive) {
                const dx = inv.x - atacante.x, dy = inv.y - atacante.y, dist = Math.hypot(dx, dy) || 1;
                const moveX = (dx / dist) * CONFIG.INVOCADOR.SPEED_RUN, moveY = (dy / dist) * CONFIG.INVOCADOR.SPEED_RUN;
                const newX = Math.min(Math.max(inv.x + moveX, 50), 2950), newY = Math.min(Math.max(inv.y + moveY, 50), 2950);
                if (!colisionaConObjeto(newX, newY, 30)) { inv.x = newX; inv.y = newY; }
                if (Math.abs(dx) > Math.abs(dy)) inv.dir = dx > 0 ? 'right' : 'left'; else inv.dir = dy > 0 ? 'down' : 'up';
                io.emit('invocadorMoved', { id: inv.id, x: inv.x, y: inv.y, dir: inv.dir, isMoving: true, estado: 'huir' });
            } else { inv.estado = 'idle'; }
            return;
        }
        let jugadorCercano = null;
        let menorDist = Infinity;
        for (let id in players) { const p = players[id]; if (p && p.isAlive && (jugadoresEnMapa[id] || 'principal') === 'principal') { const d = getDistance(inv.x, inv.y, p.x, p.y); if (d < menorDist) { menorDist = d; jugadorCercano = p; } } }
        if (!jugadorCercano || menorDist > CONFIG.INVOCADOR.VISION_RANGE) { io.emit('invocadorMoved', { id: inv.id, x: inv.x, y: inv.y, dir: inv.dir, isMoving: false, estado: 'idle' }); return; }
        const dx = jugadorCercano.x - inv.x, dy = jugadorCercano.y - inv.y, dist = Math.hypot(dx, dy);
        if (dist < CONFIG.INVOCADOR.SAFE_DISTANCE) {
            if (dist < CONFIG.INVOCADOR.MELEE_RANGE && !inv.atacandoMelee && ahora - (inv.ultimoAtaqueMelee || 0) > CONFIG.INVOCADOR.ATTACK_COOLDOWN_MELEE) {
                inv.ultimoAtaqueMelee = ahora;
                inv.atacandoMelee = true;
                if (Math.abs(dx) > Math.abs(dy)) inv.dir = dx > 0 ? 'right' : 'left'; else inv.dir = dy > 0 ? 'down' : 'up';
                io.emit('invocadorAttackMelee', { id: inv.id, dir: inv.dir });
                const jugadorRef = jugadorCercano;
                setTimeout(() => {
                    if (!inv.isAlive || !jugadorRef || !jugadorRef.isAlive) { inv.atacandoMelee = false; return; }
                    const distAhora = getDistance(inv.x, inv.y, jugadorRef.x, jugadorRef.y);
                    if (distAhora < CONFIG.INVOCADOR.MELEE_RANGE + 20) {
                        const jObj = players[jugadorRef.id];
                        if (jObj && jObj.stats && jObj.stats.destreza > 0) { const esquiva = 5 + (jObj.stats.destreza || 0); if (Math.random() * 100 < esquiva) { io.to(jugadorRef.id).emit('chatMessage', { type: 'system', name: 'Sistema', msg: '⚡ Esquivaste el ataque del invocador!' }); inv.atacandoMelee = false; return; } }
                        const damage = CONFIG.INVOCADOR.ATTACK_DAMAGE;
                        const dañoFinal = calcularDañoFinal(jugadorRef.id, damage, 'fisico');
                        jugadorRef.hp = Math.max(0, jugadorRef.hp - dañoFinal);
                        io.emit('playerStatsUpdate', { id: jugadorRef.id, hp: jugadorRef.hp });
                        io.emit('invocadorAttackHit', { targetId: jugadorRef.id, damage: dañoFinal, x: jugadorRef.x, y: jugadorRef.y });
                        if (jugadorRef.hp <= 0) { jugadorRef.isAlive = false; io.emit('playerDeath', { id: jugadorRef.id, name: jugadorRef.name }); setTimeout(() => revivirJugador(jugadorRef.id), CONFIG.PLAYER.RESPAWN_TIME); }
                    }
                    inv.atacandoMelee = false;
                }, 400);
            }
            const moveX = -(dx / dist) * CONFIG.INVOCADOR.SPEED, moveY = -(dy / dist) * CONFIG.INVOCADOR.SPEED;
            const newX = Math.min(Math.max(inv.x + moveX, 50), 2950), newY = Math.min(Math.max(inv.y + moveY, 50), 2950);
            if (!colisionaConObjeto(newX, newY, 30)) { inv.x = newX; inv.y = newY; }
            if (Math.abs(dx) > Math.abs(dy)) inv.dir = dx > 0 ? 'left' : 'right'; else inv.dir = dy > 0 ? 'up' : 'down';
            if (!inv.atacandoMelee) io.emit('invocadorMoved', { id: inv.id, x: inv.x, y: inv.y, dir: inv.dir, isMoving: true, estado: 'alejarse' });
        } else if (dist > CONFIG.INVOCADOR.MAX_DISTANCE) {
            const moveX = (dx / dist) * CONFIG.INVOCADOR.SPEED, moveY = (dy / dist) * CONFIG.INVOCADOR.SPEED;
            const newX = Math.min(Math.max(inv.x + moveX, 50), 2950), newY = Math.min(Math.max(inv.y + moveY, 50), 2950);
            if (!colisionaConObjeto(newX, newY, 30)) { inv.x = newX; inv.y = newY; }
            if (Math.abs(dx) > Math.abs(dy)) inv.dir = dx > 0 ? 'right' : 'left'; else inv.dir = dy > 0 ? 'down' : 'up';
            io.emit('invocadorMoved', { id: inv.id, x: inv.x, y: inv.y, dir: inv.dir, isMoving: true, estado: 'acercarse' });
        } else {
            if (Math.abs(dx) > Math.abs(dy)) inv.dir = dx > 0 ? 'right' : 'left'; else inv.dir = dy > 0 ? 'down' : 'up';
            if (!inv.atacandoMelee) io.emit('invocadorMoved', { id: inv.id, x: inv.x, y: inv.y, dir: inv.dir, isMoving: false, estado: 'idle' });
        }
        if (!inv.furiaActiva && ahora - inv.furiaCooldown > CONFIG.INVOCADOR.FURIA_COOLDOWN) { const misEsq = esqueletos.filter(e => e.isAlive && e.ownerId === inv.id); if (misEsq.length >= CONFIG.INVOCADOR.FURIA_MIN_SKELETONS) { activarFuriaInvocador(inv.id); return; } }
        if (ahora - inv.attackCooldown > CONFIG.INVOCADOR.ATTACK_COOLDOWN) { const propios = esqueletos.filter(e => e.isAlive && e.ownerId === inv.id); if (propios.length < CONFIG.INVOCADOR.MAX_SKELETONS) { inv.attackCooldown = ahora; io.emit('invocadorAttack', { id: inv.id, dir: inv.dir }); setTimeout(() => { invocarEsqueletosDelInvocador(inv.id); }, 700); } }
        if (inv.furiaActiva && ahora >= inv.furiaFin) { desactivarFuriaInvocador(inv.id); }
    });
}, 150);

// ═══════════════════════════════════════════════════════════════
// ═══ NUEVO: INTERVALO DE DETECCIÓN DE ATAQUES A PILARES ═══
// ═══════════════════════════════════════════════════════════════
setInterval(() => {
    // Este intervalo sirve para que los pilares se regeneren y las ventanas de 24h expiren
    // (la regeneración real está en regenerarPilares(), llamada cada 60s)
    // Acá solo verificamos si algún pilar está siendo atacado por jugadores cercanos
    // y mandamos la alarma correspondiente.
    pilares.forEach(p => {
        if (!p.dueñoId) return;
        const ahora = Date.now();
        // Verificar si hay jugadores enemigos cerca (dentro del radio de alarma)
        for (let socketId in players) {
            const j = players[socketId];
            if (!j || !j.isAlive) continue;
            if (esAliadoDelDueño(p, socketId)) continue;
            const dist = getDistance(j.x, j.y, p.x, p.y);
            if (dist < CONFIG.PILARES.RADIO_ALARMA) {
                // Hay un enemigo cerca: mandar alarma (con throttle)
                enviarAlertaPilar(p, socketId, 0);
                break;
            }
        }
    });
}, 5000);

// ═══════════════════════════════════════════════════════════════
// ═══ FIN PARTE 2/3 — SERVIDOR ═══
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// ═══ PARTE 3/3 — SERVIDOR: CONEXIONES, EVENTOS, CIERRE ═══
// ═══════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);
    skillCooldowns[socket.id] = { furiaNecrotica: 0 };
    jugadoresEnMapa[socket.id] = 'principal';
socket.on('sincronizarNivel', (data) => {
    const j = players[socket.id];
    if (!j) return;
    const nivelCliente = parseInt(data.level) || 1;
    const nivelServer = parseInt(j.level) || 1;
    // Solo actualizar si el cliente tiene un nivel MÁS ALTO
    if (nivelCliente > nivelServer) {
        j.level = nivelCliente;
        j.exp = parseInt(data.exp) || 0;
    }
    // Forzar refresh del ranking para todos
    Object.keys(players).forEach(id => {
        io.to(id).emit('rankingTop10', { ranking: obtenerTop10() });
    });
});

    // ═══ EMISIONES INICIALES ═══
    socket.emit('arbolesIniciales', arboles);
    socket.emit('rocasIniciales', rocas);
    socket.emit('minasIniciales', minas);
    socket.emit('esqueletosIniciales', esqueletos.filter(e => e.isAlive === true));
    socket.emit('currentPlayers', players);
    socket.emit('demonlordState', { hp: demonlord.hp, isAlive: demonlord.isAlive, x: demonlord.x, y: demonlord.y, dir: demonlord.dir });
    socket.emit('cofreEstado', { x: cofre.x, y: cofre.y, abierto: cofre.abierto });
    socket.emit('invocadoresIniciales', invocadores);
    // ═══ NUEVO: EMISIONES DE PILARES Y LIGAS ═══
    socket.emit('pilaresIniciales', pilares.map(p => ({
        id: p.id, color: p.color, x: p.x, y: p.y,
        hp: p.hp, maxHp: p.maxHp,
        nivelVida: p.nivelVida, nivelDefFisica: p.nivelDefFisica,
        nivelDefMagica: p.nivelDefMagica, nivelBuff: p.nivelBuff,
        dueñoId: p.dueñoId, dueñoLigaId: p.dueñoLigaId,
        dueñoNombre: p.dueñoNombre || (p.dueñoId && players[p.dueñoId] ? players[p.dueñoId].name : null)
    })));
    socket.emit('ligasIniciales', { ligas: obtenerRankingLigas() });

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
            team: 'Sin Team', level: 1, exp: 0, dir: 'Abajo', mapa: 'principal',
            stats: {
                fuerza: bs.fuerza, defensaFisica: bs.defensaFisica, defensaMagica: bs.defensaMagica,
                agilidad: bs.agilidad, vitalidad: bs.vitalidad, puntosDisponibles: 5, puntosEspecialidad: 0,
                defFuego: 0, defAgua: 0, defViento: 0, defRayo: 0, defLuz: 0, defOscuridad: 0,
                corte: 0, regeneracion: 0, destreza: 0, virtuoso: 0, brutalidad: 0, actoFugaz: 0,
                bendito: 0, sacrificio: 0, furia: 0, critico: 0,
                atqFuego: 0, atqAgua: 0, atqViento: 0, atqTierra: 0, atqLuz: 0, atqOscuridad: 0
            },
            minerales: {},
            equipamiento: { cabeza: null, pecho: null, piernas: null, pies: null, arma: null, escudo: null, ring1: null, ring2: null },
            mana: bs.mana || 100, maxMana: bs.mana || 100,
            esqueletosSummon: 0,
            skillsEquipadas: d.className === 'NECROMANCER' ? ['levantar_muerto', 'furia_necrotica', 'ataque_distancia'] : (d.className === 'MAGO' ? ['fireball'] : []),
            attackSpeedModifier: bs.attackSpeed || 1.0,
            baseDamage: bs.baseDamage || 50,
            ataqueFisico: atq,
            contraGolpeContador: 0, contraGolpeDanioAcumulado: 0, contraGolpeCargado: false, contraGolpeBonus: 0
        };
        jugadoresEnMapa[socket.id] = 'principal';
        if (!inventariosJugadores[socket.id]) inventariosJugadores[socket.id] = { items: [], equipamiento: {} };
        inventariosJugadores[socket.id].items.push({ id: 'pocion_1', tipo: 'pocion', nombre: 'Pocion de Vida', icono: 'pocion_img', cantidad: 2, slot: 0 });
        socket.emit('inventarioCompleto', inventariosJugadores[socket.id]);
socket.broadcast.emit('newPlayer', players[socket.id]);
// Enviar pilares actualizados al nuevo jugador
socket.emit('pilaresIniciales', pilares.map(p => ({
    id: p.id, color: p.color, x: p.x, y: p.y,
    hp: p.hp, maxHp: p.maxHp,
    nivelVida: p.nivelVida, nivelDefFisica: p.nivelDefFisica,
    nivelDefMagica: p.nivelDefMagica, nivelBuff: p.nivelBuff,
    dueñoId: p.dueñoId, dueñoLigaId: p.dueñoLigaId,
    dueñoNombre: p.dueñoNombre || (p.dueñoId && players[p.dueñoId] ? players[p.dueñoId].name : null)
})));
        // 🔄 Migrar pilares huérfanos a este nuevo socket (delayed para que el player esté registrado)
        setTimeout(() => {
            const migrados = migrarPilaresAlReconectar(socket.id);
            if (migrados > 0) {
                // Reenviar pilares actualizados a TODOS
                const pilaresSnapshot = pilares.map(p => ({
                    id: p.id, color: p.color, x: p.x, y: p.y,
                    hp: p.hp, maxHp: p.maxHp,
                    nivelVida: p.nivelVida, nivelDefFisica: p.nivelDefFisica,
                    nivelDefMagica: p.nivelDefMagica, nivelBuff: p.nivelBuff,
                    dueñoId: p.dueñoId, dueñoLigaId: p.dueñoLigaId,
                    dueñoNombre: p.dueñoNombre || (p.dueñoId && players[p.dueñoId] ? players[p.dueñoId].name : null)
                }));
                io.emit('pilaresIniciales', pilaresSnapshot);
            }
        }, 1200);
setTimeout(() => {
    migrarLigasAlReconectar(socket.id);
}, 1500);
    });   // ⬅️ AHORA SÍ, el cierre va ACÁ, después del setTimeout

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
            j.maxHp = (j.className === 'BARBARO' ? 800 : (j.className === 'MAGO' || j.className === 'NECROMANCER' ? 300 : 500)) + ((j.stats.vitalidad || 0) * 10);
            let manaBase = bs.mana || 100;
            const inv = inventariosJugadores[socket.id];
            if (inv && j.equipamiento?.arma) { const arma = inv.items.find(i => i.id === j.equipamiento.arma); if (arma && arma.manaBonus) manaBase += arma.manaBonus; }
            j.maxMana = manaBase + ((j.stats.sabiduria || 0) * 10) + ((j.stats.inteligencia || 0) * 10);
        }
    });

    socket.on('asignarPuntoStat', (data) => {
        const j = players[socket.id];
        if (!j || !j.isAlive) return;
        if (!j.stats) j.stats = {};
        if (isNaN(j.stats.puntosDisponibles)) j.stats.puntosDisponibles = 5;
        if (isNaN(j.stats.puntosEspecialidad)) j.stats.puntosEspecialidad = 0;
        const stat = data.stat;
        const tipo = data.tipo;
        if (j.stats[stat] === undefined || isNaN(j.stats[stat])) j.stats[stat] = 0;
        if (tipo === 'basico') {
            if (j.stats.puntosDisponibles <= 0) { socket.emit('mensaje', '❌ No tienes puntos disponibles'); return; }
            if (j.stats[stat] >= 100) { socket.emit('mensaje', '❌ Máximo alcanzado'); return; }
            j.stats.puntosDisponibles--; j.stats[stat]++;
        } else if (tipo === 'especialidad') {
            if (j.stats.puntosEspecialidad <= 0) { socket.emit('mensaje', '❌ No tienes puntos de especialidad'); return; }
            if (j.stats[stat] >= 20) { socket.emit('mensaje', '❌ Máximo alcanzado'); return; }
            j.stats.puntosEspecialidad--; j.stats[stat]++;
        }
        if (stat === 'vitalidad') {
            if (j.className === 'BARBARO') j.maxHp = 800 + (j.stats.vitalidad * 10);
            else if (j.className === 'MAGO' || j.className === 'NECROMANCER') j.maxHp = 300 + (j.stats.vitalidad * 10);
            else j.maxHp = 500 + (j.stats.vitalidad * 10);
            j.hp = Math.min(j.hp, j.maxHp);
        }
        if (stat === 'inteligencia') {
            const bs2 = CONFIG.PLAYER.BASE_STATS[j.class] || CONFIG.PLAYER.BASE_STATS.warrior;
            let manaBase = bs2.mana || 100;
            const inv2 = inventariosJugadores[socket.id];
            if (inv2 && j.equipamiento?.arma) { const arma2 = inv2.items.find(i => i.id === j.equipamiento.arma); if (arma2 && arma2.manaBonus) manaBase += arma2.manaBonus; }
            j.maxMana = manaBase + ((j.stats.sabiduria || 0) * 10) + ((j.stats.inteligencia || 0) * 10);
            j.mana = Math.min(j.mana, j.maxMana);
        }
        io.to(socket.id).emit('statsActualizados', {
            puntosDisponibles: j.stats.puntosDisponibles || 0, puntosEspecialidad: j.stats.puntosEspecialidad || 0,
            fuerza: j.stats.fuerza || 0, vitalidad: j.stats.vitalidad || 0, agilidad: j.stats.agilidad || 0,
            inteligencia: j.stats.inteligencia || 0, sabiduria: j.stats.sabiduria || 0,
            corte: j.stats.corte || 0, regeneracion: j.stats.regeneracion || 0, destreza: j.stats.destreza || 0,
            virtuoso: j.stats.virtuoso || 0, brutalidad: j.stats.brutalidad || 0, actoFugaz: j.stats.actoFugaz || 0,
            bendito: j.stats.bendito || 0, sacrificio: j.stats.sacrificio || 0, furia: j.stats.furia || 0,
            critico: j.stats.critico || 0, atqFuego: j.stats.atqFuego || 0, atqAgua: j.stats.atqAgua || 0,
            atqViento: j.stats.atqViento || 0, atqTierra: j.stats.atqTierra || 0,
            atqLuz: j.stats.atqLuz || 0, atqOscuridad: j.stats.atqOscuridad || 0
        });
        io.emit('playerStatsUpdate', { id: socket.id, hp: j.hp, maxHp: j.maxHp, mana: j.mana, maxMana: j.maxMana });
    });

    socket.on('usarPocion', (data) => {
        const j = players[socket.id];
        if (j) {
            if (data.hpActual !== undefined) j.hp = Math.min(j.maxHp, data.hpActual);
            j.hp = Math.min(j.maxHp, j.hp + (data.curacion || 50));
            io.emit('playerStatsUpdate', { id: socket.id, hp: j.hp });
        }
    });

    socket.on('usarPocionMana', (data) => {
        const j = players[socket.id];
        if (j) {
            if (data.manaActual !== undefined) j.mana = Math.min(j.maxMana, data.manaActual);
            j.mana = Math.min(j.maxMana, j.mana + (data.restauracion || 30));
            io.emit('playerStatsUpdate', { id: socket.id, mana: j.mana });
        }
    });

    socket.on('playerMovement', (data) => {
        let p = players[socket.id];
        if (p && p.isAlive) {
            if (!colisionaConObjeto(data.x, data.y, 20)) {
                p.x = data.x; p.y = data.y; p.dir = data.dir; p.isMoving = data.isMoving;
                socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y, dir: data.dir, isMoving: data.isMoving, hp: p.hp, maxHp: p.maxHp, timestamp: data.timestamp, auraVisible: data.auraVisible || false });
            } else {
                socket.emit('playerMovementBlocked', { x: p.x, y: p.y });
            }
        }
    });

    socket.on('truenoRemoto', (data) => { socket.broadcast.emit('truenoVisual', data); });
    socket.on('cambiarMapa', (data) => { if (players[socket.id] && data.mapa) { cambiarJugadorDeMapa(socket.id, data.mapa); } });

    socket.on('playerAttack', (data) => {
        const j = players[socket.id];
        if (!j || !j.isAlive) return;
        if (j.equipamiento?.ring1 || j.equipamiento?.ring2) {
            const inv = inventariosJugadores[socket.id];
            const anilloId = j.equipamiento?.ring1 || j.equipamiento?.ring2;
            if (anilloId && inv && inv.items) {
                const anillo = inv.items.find(i => i.id === anilloId);
                if (anillo && (anillo.idBase && anillo.idBase.includes('anillo_cura')) && Math.random() < 0.15) {
                    const curacion = Math.floor(j.maxHp * (anillo.idBase === 'anillo_cura_3' ? 0.30 : anillo.idBase === 'anillo_cura_2' ? 0.20 : 0.05));
                    if (curacion > 0) {
                        j.hp = Math.min(j.maxHp, j.hp + curacion);
                        io.emit('playerStatsUpdate', { id: socket.id, hp: j.hp });
                        io.to(socket.id).emit('mostrarTextoCuracion', { x: j.x, y: j.y - 50, texto: `+${curacion}`, color: '#88ff88', size: '20px' });
                    }
                }
            }
        }
        const ahora = Date.now();
        if (ultimoAtaque.get(socket.id) && ahora - ultimoAtaque.get(socket.id) < 100) return;
        ultimoAtaque.set(socket.id, ahora);
        socket.broadcast.emit('playerAttacked', { id: socket.id, dir: j.dir, class: j.class });
        let dañoTotal = data.damageBonus || j.ataqueFisico;
        if (j.contraGolpeCargado && j.contraGolpeBonus > 0) {
            dañoTotal += j.contraGolpeBonus;
            io.emit('contraGolpeActivado', { playerId: socket.id, x: j.x, y: j.y, bonus: j.contraGolpeBonus });
            io.emit('contraGolpeUsado', { playerId: socket.id });
            j.contraGolpeCargado = false; j.contraGolpeBonus = 0;
        }
        let hitbox = data.hitbox || { x: j.x - 5, y: j.y - 10, w: 10, h: 22 };
        let golpeo = false;
        // ═══ NUEVO: ATAQUE A PILARES ═══
        for (let p of pilares) {
            if (p.hp <= 0) continue;
            if (esAliadoDelDueño(p, socket.id)) continue;
            const pBody = { x: p.x - 40, y: p.y - 55, w: 80, h: 110 };
            if (rectanguloColisiona(hitbox, pBody)) {
                atacarPilar(socket.id, p.id, Math.floor(Math.max(1, dañoTotal)));
                golpeo = true;
                break;
            }
        }
        if (demonlord.isAlive && demonlord.hp > 0) {
            const dlBody = { x: demonlord.x - 25, y: demonlord.y - 40, w: 50, h: 80 };
            if (rectanguloColisiona(hitbox, dlBody)) {
                let dmg = Math.floor(Math.max(1, dañoTotal));
                if (data.esCritico) dmg *= 2;
                demonlord.hp = Math.max(0, demonlord.hp - dmg);
                if (!demonlord.attackers) demonlord.attackers = [];
                if (!demonlord.attackers.includes(socket.id)) demonlord.attackers.push(socket.id);
                io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: dmg, hp: demonlord.hp });
                io.emit('playerAttackHit', { playerId: socket.id, targetId: 'demonlord', hitbox: hitbox, damage: dmg });
                golpeo = true;
                if (demonlord.hp <= 0) {
                    demonlord.isAlive = false; demonlord.aturdido = false;
                    if (Math.random() < 0.15) dropearItem(demonlord.x, demonlord.y, 'hachadehierroleg');
                    if (demonlord.attackers && demonlord.attackers.length > 0) demonlord.attackers.forEach(a => darExpAJugadorYEquipo(a, CONFIG.DEMONLORD.EXP));
                    else darExpAJugadorYEquipo(socket.id, CONFIG.DEMONLORD.EXP);
                    for (let i = 0; i < 20; i++) { const ang = (i/20)*Math.PI*2; const dist = 60 + Math.random()*80; io.emit('crearMonedaServidor', { x: demonlord.x + Math.cos(ang)*dist, y: demonlord.y + Math.sin(ang)*dist, cantidad: aplicarOroExtra(socket.id, Math.floor(Math.random()*50)+20) }); }
                    if (Math.random() < 0.3) { const rand = Math.random(); if (rand < 0.03) dropearItem(demonlord.x+(Math.random()-0.5)*80, demonlord.y+(Math.random()-0.5)*80, 'hachadehierro_3'); else if (rand < 0.15) dropearItem(demonlord.x+(Math.random()-0.5)*80, demonlord.y+(Math.random()-0.5)*80, 'hachadehierro_2'); else dropearItem(demonlord.x+(Math.random()-0.5)*80, demonlord.y+(Math.random()-0.5)*80, 'hachadehierro_1'); }
                    io.emit('demonlordDeath', { x: demonlord.x, y: demonlord.y, attackers: demonlord.attackers || [] });
                    setTimeout(() => { demonlord.hp = CONFIG.DEMONLORD.MAX_HP; demonlord.isAlive = true; demonlord.x = 1500; demonlord.y = 1500; demonlord.attackers = []; demonlord.aturdido = false; io.emit('demonlordRespawn', { x: demonlord.x, y: demonlord.y }); }, CONFIG.DEMONLORD.RESPAWN_TIME);
                }
            }
        }
        if (!golpeo) {
            for (let e of esqueletos) {
                if (e.isAlive && !e.isAlly) {
                    const eBody = { x: e.x - 20, y: e.y - 20, w: 40, h: 40 };
                    if (rectanguloColisiona(hitbox, eBody)) {
                        daniarEsqueleto(e, socket.id, Math.floor(Math.max(1, dañoTotal)));
                        io.emit('playerAttackHit', { playerId: socket.id, targetId: e.id, hitbox: hitbox, damage: Math.floor(Math.max(1, dañoTotal)) });
                        golpeo = true;
                        break;
                    }
                }
            }
        }
        if (!golpeo) {
            for (let inv of invocadores) {
                if (inv.isAlive) {
                    const invBody = { x: inv.x - 5, y: inv.y + 15, w: 10, h: 10 };
                    if (rectanguloColisiona(hitbox, invBody)) {
                        let dmgInv = Math.floor(Math.max(1, dañoTotal));
                        if (data.esCritico) dmgInv *= 2;
                        daniarInvocador(inv.id, dmgInv, socket.id);
                        io.emit('playerAttackHit', { playerId: socket.id, targetId: inv.id, hitbox: hitbox, damage: dmgInv });
                        golpeo = true;
                        break;
                    }
                }
            }
        }
        if (!golpeo) { io.emit('playerAttackHit', { playerId: socket.id, targetId: null, hitbox: hitbox, damage: 0 }); }
    });

    socket.on('esqueletoHit', (data) => {
        const j = players[socket.id];
        if (!j || !j.isAlive) return;
        let dañoTotal = data.damageBonus || 0;
        if (j.contraGolpeCargado && j.contraGolpeBonus > 0) {
            dañoTotal += j.contraGolpeBonus;
            io.emit('contraGolpeActivado', { playerId: socket.id, x: j.x, y: j.y, bonus: j.contraGolpeBonus });
            io.emit('contraGolpeUsado', { playerId: socket.id });
            j.contraGolpeCargado = false; j.contraGolpeBonus = 0;
        }
        // ═══ NUEVO: ATAQUE A PILARES ═══
        if (data.id && data.id.startsWith('pilar_')) {
            atacarPilar(socket.id, data.id, Math.floor(Math.max(1, dañoTotal)));
            return;
        }
        let e = esqueletos.find(e => e.id === data.id && e.isAlive);
        if (e) { daniarEsqueleto(e, socket.id, Math.floor(Math.max(1, dañoTotal)), data.elemento || null); return; }
        let inv = invocadores.find(i => i.id === data.id && i.isAlive);
        if (inv) { daniarInvocador(inv.id, Math.floor(Math.max(1, dañoTotal)), socket.id); }
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
        let dmg = Math.floor(data.damageBonus || j.ataqueFisico);
        if (data.esCritico) dmg *= 2;
        demonlord.hp = Math.max(0, demonlord.hp - dmg);
        io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: dmg, hp: demonlord.hp });
        if (j && data.elemento === 'fuego') {
            const armaId = j.equipamiento?.arma;
            if (armaId) { const inv = inventariosJugadores[socket.id]; if (inv) { const arma = inv.items.find(i => i.id === armaId); if (arma && (arma.idBase === 'bastondefuegoleg' || arma.nombre === 'Baston de Fuego Legendario')) { if (Math.random() < 0.15) { const dañoFuegoTotal = (j.stats?.atqFuego || 0) + 500; aplicarQuemadura('demonlord', dañoFuegoTotal, 5); io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${j.name} aplico QUEMADURA al Demonlord!` }); } } } }
        }
        if (j && data.elemento === 'luz') {
            const armaId = j.equipamiento?.arma;
            if (armaId) { const inv = inventariosJugadores[socket.id]; if (inv) { const arma = inv.items.find(i => i.id === armaId); if (arma && (arma.idBase === 'bastonderayoleg' || arma.nombre === 'Baston de Rayo Legendario')) { if (Math.random() < 0.15) { aplicarAturdimiento('demonlord', 5); io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${j.name} aplico ATURDIMIENTO al Demonlord!` }); } } } }
        }
        if (demonlord.hp <= 0) {
            demonlord.isAlive = false; demonlord.aturdido = false;
            if (Math.random() < 0.15) dropearItem(demonlord.x, demonlord.y, 'hachadehierroleg');
            if (demonlord.attackers && demonlord.attackers.length > 0) demonlord.attackers.forEach(a => darExpAJugadorYEquipo(a, CONFIG.DEMONLORD.EXP));
            else darExpAJugadorYEquipo(socket.id, CONFIG.DEMONLORD.EXP);
            for (let i = 0; i < 20; i++) { const ang = (i/20)*Math.PI*2; const dist = 60 + Math.random()*80; io.emit('crearMonedaServidor', { x: demonlord.x + Math.cos(ang)*dist, y: demonlord.y + Math.sin(ang)*dist, cantidad: aplicarOroExtra(socket.id, Math.floor(Math.random()*50)+20) }); }
            if (Math.random() < 0.3) { const rand = Math.random(); if (rand < 0.03) dropearItem(demonlord.x+(Math.random()-0.5)*80, demonlord.y+(Math.random()-0.5)*80, 'hachadehierro_3'); else if (rand < 0.15) dropearItem(demonlord.x+(Math.random()-0.5)*80, demonlord.y+(Math.random()-0.5)*80, 'hachadehierro_2'); else dropearItem(demonlord.x+(Math.random()-0.5)*80, demonlord.y+(Math.random()-0.5)*80, 'hachadehierro_1'); }
            io.emit('demonlordDeath', { x: demonlord.x, y: demonlord.y, attackers: demonlord.attackers || [] });
            setTimeout(() => { demonlord.hp = CONFIG.DEMONLORD.MAX_HP; demonlord.isAlive = true; demonlord.x = 1500; demonlord.y = 1500; demonlord.attackers = []; demonlord.aturdido = false; io.emit('demonlordRespawn', { x: demonlord.x, y: demonlord.y }); }, CONFIG.DEMONLORD.RESPAWN_TIME);
        }
    });

    socket.on('solicitarDemonlordHP', () => {
        const j = players[socket.id];
        if (!j) return;
        const dist = getDistance(demonlord.x, demonlord.y, j.x, j.y);
        if (dist < CONFIG.DEMONLORD.VISION_RANGE + 100) socket.emit('demonlordHPResponse', { hp: demonlord.hp, maxHp: demonlord.maxHp, visible: true });
        else socket.emit('demonlordHPResponse', { visible: false });
    });

    // ═══════════════════════════════════════════════════════════════
    // ═══ NUEVO: EVENTOS DE PILARES ═══
    // ═══════════════════════════════════════════════════════════════
    socket.on('solicitarPilares', () => {
        socket.emit('pilaresIniciales', pilares.map(p => ({
            id: p.id, color: p.color, x: p.x, y: p.y,
            hp: p.hp, maxHp: p.maxHp,
            nivelVida: p.nivelVida, nivelDefFisica: p.nivelDefFisica,
            nivelDefMagica: p.nivelDefMagica, nivelBuff: p.nivelBuff,
            dueñoId: p.dueñoId, dueñoLigaId: p.dueñoLigaId,
            dueñoNombre: p.dueñoNombre || (p.dueñoId && players[p.dueñoId] ? players[p.dueñoId].name : null)
        })));
    });

    socket.on('atacarPilar', (data) => {
        if (!data.pilarId || !data.daño) return;
        atacarPilar(socket.id, data.pilarId, data.daño);
    });

    socket.on('mejorarPilar', (data) => {
        if (!data.pilarId || !data.stat) return;
        mejorarPilar(socket.id, data.pilarId, data.stat);
    });

    socket.on('solicitarInfoPilar', (data) => {
        const pilar = getPilar(data.pilarId);
        if (!pilar) return;
        socket.emit('infoPilar', {
            id: pilar.id, color: pilar.color, x: pilar.x, y: pilar.y,
            hp: pilar.hp, maxHp: pilar.maxHp,
            nivelVida: pilar.nivelVida, nivelDefFisica: pilar.nivelDefFisica,
            nivelDefMagica: pilar.nivelDefMagica, nivelBuff: pilar.nivelBuff,
            dueñoId: pilar.dueñoId, dueñoLigaId: pilar.dueñoLigaId,
            dueñoNombre: pilar.dueñoNombre || (pilar.dueñoId && players[pilar.dueñoId] ? players[pilar.dueñoId].name : null),
            ventanaRecuperacion: pilar.ventanaRecuperacion,
            dueñoOriginalId: pilar.dueñoOriginalId
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // ═══ NUEVO: EVENTOS DE LIGAS ═══
    // ═══════════════════════════════════════════════════════════════
    socket.on('crearLiga', (data) => {
        if (!data.nombre) return;
        crearLiga(socket.id, data.nombre);
    });

    socket.on('invitarLiga', (data) => {
        if (!data.nombre) return;
        invitarLiga(socket.id, data.nombre);
    });

    socket.on('aceptarInvitacionLiga', (data) => {
        if (!data.ligaId) return;
        aceptarInvitacionLiga(socket.id, data.ligaId);
    });

    socket.on('rechazarInvitacionLiga', () => {
        delete invitacionesLiga[socket.id];
        socket.emit('mensaje', '❌ Invitación rechazada');
    });

    socket.on('salirLiga', () => {
        salirLiga(socket.id);
    });
socket.on('donarOroLiga', (data) => {
    const j = players[socket.id];
    if (!j) return;
    
    const liga = getLigaDeJugador(socket.id);
    if (!liga) {
        socket.emit('mensaje', '❌ No estas en una liga');
        return;
    }
    
    const cantidad = Math.floor(parseInt(data.cantidad) || 0);
    if (cantidad <= 0) {
        socket.emit('mensaje', '❌ Cantidad invalida');
        return;
    }
    
    // Verificar que tenga el oro
    const inv = inventariosJugadores[socket.id];
    if (!inv || !inv.items) {
        socket.emit('mensaje', '❌ No tenes inventario');
        return;
    }
    
    const oroItem = inv.items.find(i => i.id === 'oro');
    const oroActual = oroItem ? oroItem.cantidad : 0;
    if (oroActual < cantidad) {
        socket.emit('mensaje', '❌ No tenes suficiente oro (tenes ' + oroActual + ')');
        return;
    }
    
    // Descontar del jugador
    if (oroItem) {
        oroItem.cantidad -= cantidad;
        if (oroItem.cantidad <= 0) {
            const idx = inv.items.findIndex(i => i.id === 'oro');
            if (idx !== -1) inv.items.splice(idx, 1);
        }
    }
    
    // Sumar a la liga
    liga.oro = (liga.oro || 0) + cantidad;
    
    // Avisar a todos los miembros
    liga.miembros.forEach(m => {
        io.to(m).emit('mensaje', `📨 ${j.name} dono ${cantidad} de oro a la liga`);
        io.to(m).emit('ligaActualizada', { 
            liga: { 
                id: liga.id, 
                nombre: liga.nombre, 
                lider: liga.lider, 
                miembros: liga.miembros.map(id => players[id]?.name || '???'), 
                puntos: liga.puntos,
                oro: liga.oro,
                exp: liga.exp || 0,
                nivel: liga.nivel || 1
            } 
        });
    });
});

    socket.on('expulsarMiembro', (data) => {
        if (!data.nombre) return;
        expulsarMiembro(socket.id, data.nombre);
    });

    socket.on('disolverLiga', () => {
        const liga = getLigaDeJugador(socket.id);
        if (liga) disolverLiga(socket.id, liga.id);
    });

socket.on('solicitarInfoLiga', () => {
    const liga = getLigaDeJugador(socket.id);
    if (!liga) { 
        socket.emit('infoLiga', { enLiga: false }); 
        return; 
    }
    socket.emit('infoLiga', {
        enLiga: true,
        id: liga.id, nombre: liga.nombre, lider: liga.lider,
        liderNombre: players[liga.lider]?.name || '???',
        miembros: liga.miembros.map(id => ({ id: id, nombre: players[id]?.name || '???' })),
        puntos: liga.puntos,
        oro: liga.oro || 0,
        pilares: pilares.filter(p => p.dueñoLigaId === liga.id).map(p => ({ id: p.id, color: p.color }))
    });
});

    socket.on('solicitarRankingLigas', () => {
        socket.emit('rankingLigas', { ranking: obtenerRankingLigas() });
    });

    socket.on('chatLigaMensaje', (data) => {
        if (!data.msg) return;
        enviarMensajeChatLiga(socket.id, data.msg);
    });

    socket.on('chatTeamMensaje', (data) => {
        if (!data.msg) return;
        enviarMensajeChatTeam(socket.id, data.msg);
    });

    socket.on('solicitarHistorialLiga', () => {
        const liga = getLigaDeJugador(socket.id);
        if (!liga) return;
        socket.emit('historialLiga', { ligaId: liga.id, mensajes: chatLiga[liga.id] || [] });
    });

    socket.on('solicitarHistorialTeam', () => {
        const teamId = playerTeam[socket.id];
        if (!teamId) return;
        socket.emit('historialTeam', { teamId: teamId, mensajes: chatTeam[teamId] || [] });
    });

    // ═══════════════════════════════════════════════════════════════
    // ═══ EVENTOS DE SKILLS (sin cambios) ═══
    // ═══════════════════════════════════════════════════════════════
    socket.on('levantarEsqueleto', (data) => {
        const j = players[socket.id];
        if (!j || j.className !== 'NECROMANCER') { socket.emit('mensaje', 'Solo Necromancer'); return; }
        let cadaver = esqueletos.find(e => e.id === data.id && !e.isAlive && !e.isAlly);
        if (!cadaver) { socket.emit('mensaje', 'No hay cadaver'); return; }
        if (getDistance(j.x, j.y, cadaver.x, cadaver.y) > 100) { socket.emit('mensaje', 'Muy lejos'); return; }
        if (!data.esLegion) {
            const vidaEnemigo = 200;
            if (j.hp < vidaEnemigo) { socket.emit('mensaje', 'Vida insuficiente'); return; }
            j.hp = j.hp - vidaEnemigo;
            io.emit('playerStatsUpdate', { id: socket.id, hp: j.hp });
        }
        let bonusEsqueletos = 0;
        const armaId = j.equipamiento?.arma;
        if (armaId) {
            const inv = inventariosJugadores[socket.id];
            if (inv && inv.items) {
                const arma = inv.items.find(i => i.id === armaId);
                if (arma && arma.idBase && arma.idBase.includes('bastondehueso')) {
                    const nivelOscuridad = j.stats?.atqOscuridad || 0;
                    const itemData = ITEMS_DATA[arma.idBase];
                    const nivelRequerido = (itemData && itemData.stats && itemData.stats.nivelOscuridadReq) || 0;
                    if (nivelOscuridad >= nivelRequerido) { bonusEsqueletos = (itemData && itemData.stats && itemData.stats.bonusEsqueletos) || 0; }
                    else { socket.emit('mensaje', `⚠️ Pasiva inactiva: necesitás ${nivelRequerido} de Oscuridad (tenés ${nivelOscuridad})`); }
                }
            }
        }
        const todosLosCadaveres = [cadaver];
        if (bonusEsqueletos > 0) {
            const cadaversCercanos = esqueletos.filter(e => e.id !== cadaver.id && !e.isAlive && !e.isAlly && getDistance(cadaver.x, cadaver.y, e.x, e.y) < 200);
            const extra = cadaversCercanos.slice(0, bonusEsqueletos);
            extra.forEach(c => todosLosCadaveres.push(c));
        }
        if (data.esLegion && data.cantidad && data.cantidad > 1) {
            const yaIncluidos = new Set(todosLosCadaveres.map(c => c.id));
            const cadaversLegion = esqueletos.filter(e => !yaIncluidos.has(e.id) && !e.isAlive && !e.isAlly && getDistance(cadaver.x, cadaver.y, e.x, e.y) < 250);
            const extraLegion = cadaversLegion.slice(0, data.cantidad - 1);
            extraLegion.forEach(c => todosLosCadaveres.push(c));
        }
        const esqueletosAliadosActuales = esqueletos.filter(e => e.isAlive && e.isAlly && e.ownerId === socket.id).length;
        let maxAliados = 15;
        if (armaId) {
            const invLegion = inventariosJugadores[socket.id];
            if (invLegion && invLegion.items) {
                const armaLegion = invLegion.items.find(i => i.id === armaId);
                if (armaLegion && armaLegion.idBase && armaLegion.idBase.includes('bastondehueso')) {
                    const itemDataLegion = ITEMS_DATA[armaLegion.idBase];
                    if (itemDataLegion && itemDataLegion.stats && itemDataLegion.stats.bonusAliados) { maxAliados += itemDataLegion.stats.bonusAliados; }
                }
            }
        }
        const espacioDisponible = maxAliados - esqueletosAliadosActuales;
        if (espacioDisponible <= 0) { socket.emit('mensaje', `❌ Ya tenés el máximo de esqueletos aliados (${maxAliados})`); return; }
        const cadaveresFinales = todosLosCadaveres.slice(0, espacioDisponible);
        let levantados = 0;
        cadaveresFinales.forEach(c => {
            if (!c || c.isAlive === true) return;
            c.isAlive = true; c.isAlly = true; c.ownerId = socket.id;
            c.hp = c.maxHp;
            c.x = j.x + (Math.random()*100-50);
            c.y = j.y + (Math.random()*100-50);
            c.attackers = []; c.aturdido = false;
            c.reviviendoHasta = Date.now() + 1000;
            j.esqueletosSummon = (j.esqueletosSummon||0)+1;
            io.emit('esqueletoRevive', { id: c.id, x: c.x, y: c.y, ownerId: socket.id });
            levantados++;
        });
        io.emit('playerStatsUpdate', { id: socket.id, hp: j.hp, mana: j.mana });
        if (levantados > 1) socket.emit('mensaje', `💀 ¡Pasiva activada! Levantaste ${levantados} esqueletos`);
    });

    socket.on('cosechaOsea', (data) => {
        const j = players[socket.id];
        if (!j || !j.isAlive) return;
        if (j.className !== 'NECROMANCER') { socket.emit('mensaje', '❌ Solo Necromancer'); return; }
        const nivelOsc = j.stats?.atqOscuridad || 0;
        if (nivelOsc < 10) { socket.emit('mensaje', '❌ Necesitás nivel 10 de Oscuridad'); return; }
        const costoVida = data.costoVida || 150;
        if (j.hp <= costoVida) { socket.emit('mensaje', '❌ Vida insuficiente'); return; }
        j.hp = Math.max(1, j.hp - costoVida);
        io.emit('playerStatsUpdate', { id: socket.id, hp: j.hp });
        let cosechados = 0;
        if (data.ids && Array.isArray(data.ids)) {
            data.ids.forEach(id => {
                const cadaver = esqueletos.find(e => e.id === id && !e.isAlive);
                if (cadaver && !cadaver.yaCosechado) {
                    cadaver.isAlive = true; cadaver.isAlly = true; cadaver.ownerId = socket.id;
                    cadaver.hp = cadaver.maxHp;
                    cadaver.x = j.x + (Math.random() - 0.5) * 100;
                    cadaver.y = j.y + (Math.random() - 0.5) * 100;
                    cadaver.attackers = []; cadaver.aturdido = false;
                    cadaver.yaCosechado = true; cadaver.esCosechado = true;
                    cadaver.reviviendoHasta = Date.now() + 1000;
                    j.esqueletosSummon = (j.esqueletosSummon || 0) + 1;
                    io.emit('esqueletoRevive', { id: cadaver.id, x: cadaver.x, y: cadaver.y, ownerId: socket.id, esCosechado: true });
                    cosechados++;
                    setTimeout(() => {
                        if (cadaver && cadaver.isAlive && cadaver.esCosechado) {
                            cadaver.isAlive = false; cadaver.esCosechado = false; cadaver.yaCosechado = true;
                            io.emit('esqueletoDeath', { id: cadaver.id, x: cadaver.x, y: cadaver.y, exp: 0, attackers: [], dir: cadaver.dir || 'Abajo' });
                            setTimeout(() => {
                                if (cadaver) {
                                    io.emit('esqueletoDestroy', { id: cadaver.id });
                                    setTimeout(() => {
                                        if (cadaver) {
                                            cadaver.isAlive = true; cadaver.isAlly = false; cadaver.ownerId = null;
                                            cadaver.hp = cadaver.maxHp;
                                            cadaver.x = Math.random() * 2800 + 100;
                                            cadaver.y = Math.random() * 2800 + 100;
                                            cadaver.yaCosechado = false; cadaver.esCosechado = false;
                                            cadaver.attackers = []; cadaver.targetId = null; cadaver.targetType = null;
                                            cadaver.attackCooldown = 0;
                                            io.emit('esqueletoNew', { id: cadaver.id, x: cadaver.x, y: cadaver.y });
                                        }
                                    }, 1000);
                                }
                            }, 10000);
                        }
                    }, 60000);
                }
            });
        }
        io.to(socket.id).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `💀 Cosechaste ${cosechados} esqueletos (-${costoVida} HP, duran 60s)` });
    });

    socket.on('furiaNecrotica', () => {
        const j = players[socket.id];
        if (!j || j.className !== 'NECROMANCER') { socket.emit('mensaje', 'Solo Necromancer'); return; }
        const now = Date.now();
        const last = skillCooldowns[socket.id].furiaNecrotica;
        if (last > 0 && now - last < 120000) { socket.emit('mensaje', 'Cooldown'); return; }
        const aliados = esqueletos.filter(e => e.isAlly === true && e.ownerId === socket.id && e.isAlive === true);
        const cant = aliados.length;
        if (cant === 0) { socket.emit('mensaje', 'Sin esqueletos'); return; }
        const cost = cant * 10;
        if (j.mana < cost) { socket.emit('mensaje', `Necesitas ${cost} mana`); return; }
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
    socket.on('solicitarRanking', () => { const ranking = obtenerTop10(); socket.emit('rankingTop10', { ranking: ranking }); });
    socket.on('solicitarInfoTeam', () => {
        const tid = playerTeam[socket.id];
        if (tid && teams[tid]) {
            const team = teams[tid];
            socket.emit('infoTeamRecibida', { enTeam: true, lider: players[team.lider]?.name || '???', miembros: team.miembros.map(m => players[m]?.name || '???') });
        } else { socket.emit('infoTeamRecibida', { enTeam: false }); }
    });
    socket.on('invitarPorNombre', (data) => {
        const nombre = data.nombre;
        let targetId = null;
        for (let id in players) { if (players[id].name === nombre) { targetId = id; break; } }
        if (!targetId) { socket.emit('mensaje', '❌ Jugador no encontrado'); return; }
        if (targetId === socket.id) { socket.emit('mensaje', '❌ No puedes invitarte a ti mismo'); return; }
        invitacionesPendientes[targetId] = { de: socket.id, nombre: players[socket.id].name, timestamp: Date.now() };
        io.to(targetId).emit('invitacionRecibida', { de: socket.id, nombre: players[socket.id].name });
        socket.emit('mensaje', `📨 Invitación enviada a ${nombre}`);
    });
    socket.on('solicitarPoder', () => { if (players[socket.id]) { const poder = calcularPoderJugador(socket.id); socket.emit('poderJugador', { poder: poder }); } });
    socket.on('actualizarAuraCaballero', (data) => { socket.broadcast.emit('auraCaballeroUpdate', { id: socket.id, visible: data.visible, x: data.x, y: data.y, scale: data.scale, alpha: data.alpha }); });
    socket.on('esqueletosEnAura', (data) => { esqueletosEnAuraSacrificio[socket.id] = data.ids; });
    socket.on('activarSacrificio', () => {
        const tid = playerTeam[socket.id];
        if (tid && teams[tid]) {
            let yaHayAura = false;
            teams[tid].miembros.forEach(m => { if (m !== socket.id && sacrificioActivoServer[m]) { yaHayAura = true; } });
            if (yaHayAura) { socket.emit('mensaje', '❌ Ya hay un aura de sacrificio activa en tu equipo'); return; }
        }
        sacrificioActivoServer[socket.id] = true;
    });
    socket.on('desactivarSacrificio', () => { sacrificioActivoServer[socket.id] = false; });

    socket.on('chatMessage', (msg) => {
        const j = players[socket.id];
        if (!j) return;
        if (msg === '/hacha') { dropearItem(j.x, j.y, 'hachadehierroleg'); io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${j.name} invoco el Hacha Legendaria` }); return; }
        if (msg === '/bastonfuego') { dropearItem(j.x, j.y, 'bastondefuegoleg'); io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${j.name} invoco el Baston de Fuego Legendario` }); return; }
        if (msg === '/bastonrayo') { dropearItem(j.x, j.y, 'bastonderayoleg'); io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${j.name} invoco el Baston de Rayo Legendario` }); return; }
        if (msg === '/bastonsangre') { dropearItem(j.x, j.y, 'bastondesangreleg'); io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${j.name} invoco el Baston de Sangre Legendario` }); return; }
        if (msg === '/escudoespejo') { dropearItem(j.x + 50, j.y, 'escudo_espejo_1'); dropearItem(j.x - 50, j.y, 'escudo_espejo_2'); dropearItem(j.x, j.y + 50, 'escudo_espejo_3'); return; }
        if (msg === '/cofre') { socket.emit('mensaje', `📦 Cofre en X: ${Math.floor(cofre.x)}, Y: ${Math.floor(cofre.y)} | ${cofre.abierto ? 'ABIERTO' : 'DISPONIBLE'}`); socket.emit('cofreEstado', { x: cofre.x, y: cofre.y, abierto: cofre.abierto }); return; }
        if (msg.startsWith('/dropearitem ')) { const parts = msg.split(' '); const itemId = parts[1]; const dx = parseFloat(parts[2]); const dy = parseFloat(parts[3]); dropearItem(dx, dy, itemId); return; }
        if (msg.startsWith('/dropearpocion ')) { const parts = msg.split(' '); const tipo = parts[1]; const dx = parseFloat(parts[2]); const dy = parseFloat(parts[3]); const cant = parseInt(parts[4]) || 1; io.emit('dropPocion', { x: dx, y: dy, tipo: tipo, cantidad: cant }); return; }
        if (msg === '/resetcofre') { cofre.abierto = false; cofre.x = j.x + 100; cofre.y = j.y; socket.emit('cofreEstado', { x: cofre.x, y: cofre.y, abierto: false }); return; }
        if (msg === '/anillo') { dropearItem(j.x, j.y, 'anillo_cura_3'); return; }
        if (msg === '/ranking' || msg === '/top') { const ranking = obtenerTop10(); socket.emit('rankingTop10', { ranking: ranking }); return; }
        if (msg === '/poder' || msg === '/power') { const poder = calcularPoderJugador(socket.id); socket.emit('mensaje', `Tu poder de combate: ${poder}`); return; }
        if (msg.startsWith('/poder ')) { const nombre = msg.split(' ')[1]; for (let id in players) { if (players[id].name.toLowerCase() === nombre.toLowerCase()) { const poder = calcularPoderJugador(id); socket.emit('mensaje', `Poder de ${players[id].name}: ${poder}`); return; } } socket.emit('mensaje', 'Jugador no encontrado'); return; }
        if (msg.startsWith('/invitar ')) { const nombre = msg.split(' ').slice(1).join(' '); for (let id in players) { if (players[id].name.toLowerCase() === nombre.toLowerCase() && id !== socket.id) { invitacionesPendientes[id] = { de: socket.id, nombre: j.name, timestamp: Date.now() }; io.to(id).emit('chatMessage', { type: 'invitacion', name: j.name, msg: `${j.name} te invita a su team. Escribe /aceptar para unirte` }); socket.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `Invitacion enviada a ${players[id].name}` }); return; } } socket.emit('chatMessage', { type: 'system', name: 'Sistema', msg: 'Jugador no encontrado' }); return; }
        if (msg === '/stats') { const j2 = players[socket.id]; if (j2) { if (isNaN(j2.stats?.puntosDisponibles)) { if (!j2.stats) j2.stats = {}; j2.stats.puntosDisponibles = 5; } if (isNaN(j2.stats?.puntosEspecialidad)) { if (!j2.stats) j2.stats = {}; j2.stats.puntosEspecialidad = 0; } socket.emit('mensaje', `📊 Nivel: ${j2.level || 1} | Puntos: ${j2.stats?.puntosDisponibles || 0} | Especialidad: ${j2.stats?.puntosEspecialidad || 0}`); } return; }
        if (msg === '/aceptar') {
            const inv = invitacionesPendientes[socket.id];
            if (inv) {
                const lider = players[inv.de];
                if (lider) {
                    let teamId = playerTeam[inv.de];
                    if (!teamId || !teams[teamId]) { teamId = 'team_' + Date.now(); teams[teamId] = { lider: inv.de, miembros: [inv.de], nombre: `Team de ${lider.name}` }; playerTeam[inv.de] = teamId; }
                    if (!teams[teamId].miembros.includes(socket.id)) teams[teamId].miembros.push(socket.id);
                    playerTeam[socket.id] = teamId;
                    players[socket.id].team = teams[teamId].nombre;
                    players[inv.de].team = teams[teamId].nombre;
                    delete invitacionesPendientes[socket.id];
                    const team = teams[teamId];
                    if (team) {
                        team.miembros.forEach(m => { io.to(m).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${players[socket.id].name} se unio al team` }); });
                        io.to(socket.id).emit('infoTeamRecibida', { enTeam: true, lider: players[team.lider]?.name || '???', miembros: team.miembros.map(m => players[m]?.name || '???') });
                        io.to(inv.de).emit('infoTeamRecibida', { enTeam: true, lider: players[team.lider]?.name || '???', miembros: team.miembros.map(m => players[m]?.name || '???') });
                    }
                }
            } else { socket.emit('chatMessage', { type: 'system', name: 'Sistema', msg: 'No tenes invitaciones pendientes' }); }
            return;
        }
        // ═══ NUEVO: COMANDOS DE LIGA Y PILARES ═══
        if (msg === '/liga') { socket.emit('solicitarInfoLiga'); return; }
        if (msg === '/pilares') { socket.emit('solicitarPilares'); return; }
        if (msg === '/rankingligas') { socket.emit('rankingLigas', { ranking: obtenerRankingLigas() }); return; }
        io.emit('chatMessage', { type: 'user', name: j.name, msg: msg });
    });

    socket.on('invitarJugador', (data) => {
        const j = players[socket.id];
        const objetivo = players[data.playerId];
        if (!j || !objetivo) { socket.emit('mensaje', 'Jugador no encontrado'); return; }
        if (!objetivo.isAlive) { socket.emit('mensaje', 'El jugador esta muerto'); return; }
        invitacionesPendientes[data.playerId] = { de: socket.id, nombre: j.name, timestamp: Date.now() };
        io.to(data.playerId).emit('invitacionRecibida', { de: socket.id, nombre: j.name });
        socket.emit('mensaje', `Invitacion enviada a ${objetivo.name}`);
    });

    socket.on('aceptarInvitacion', (data) => {
        const invitacion = invitacionesPendientes[socket.id];
        if (!invitacion) { socket.emit('mensaje', 'No tenes invitaciones pendientes'); return; }
        const lider = players[invitacion.de];
        if (!lider) { socket.emit('mensaje', 'El jugador que te invito ya no esta'); delete invitacionesPendientes[socket.id]; return; }
        let teamId = playerTeam[invitacion.de];
        if (!teamId || !teams[teamId]) { teamId = 'team_' + Date.now(); teams[teamId] = { lider: invitacion.de, miembros: [invitacion.de], nombre: `Equipo de ${lider.name}` }; playerTeam[invitacion.de] = teamId; }
        if (!teams[teamId].miembros.includes(socket.id)) teams[teamId].miembros.push(socket.id);
        playerTeam[socket.id] = teamId;
        players[socket.id].team = teams[teamId].nombre;
        players[invitacion.de].team = teams[teamId].nombre;
        delete invitacionesPendientes[socket.id];
        const team = teams[teamId];
        if (team) {
            team.miembros.forEach(m => { io.to(m).emit('mensaje', `${players[socket.id].name} se unio al equipo`); });
            io.to(socket.id).emit('infoTeamRecibida', { enTeam: true, lider: players[team.lider]?.name || '???', miembros: team.miembros.map(m => players[m]?.name || '???') });
            io.to(invitacion.de).emit('infoTeamRecibida', { enTeam: true, lider: players[team.lider]?.name || '???', miembros: team.miembros.map(m => players[m]?.name || '???') });
        }
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
        socket.emit('infoTeamRecibida', { enTeam: false });
        if (team && team.miembros) {
            team.miembros.forEach(m => { if (players[m]) { io.to(m).emit('infoTeamRecibida', { enTeam: team.miembros.length > 0, lider: players[team.lider]?.name || '???', miembros: team.miembros.map(mi => players[mi]?.name || '???') }); } });
        }
    });

    socket.on('talarArbol', (data) => {
        const j = players[socket.id];
        if (!j || !j.isAlive) return;
        const arbol = arboles.find(a => a.activo && getDistance(data.x, data.y, a.x, a.y) < 80);
        if (!arbol) return;
        if (getDistance(j.x, j.y, arbol.x, arbol.y) > 100) { socket.emit('mensaje', 'Muy lejos'); return; }
        io.emit('arbolTalado', { id: arbol.id, x: arbol.x, y: arbol.y, taladoPor: j.name });
        arbol.activo = false;
        io.emit('arbolDesaparece', { id: arbol.id, x: arbol.x, y: arbol.y });
        setTimeout(() => { arbol.x = Math.random()*2800+100; arbol.y = Math.random()*2800+100; arbol.activo = true; io.emit('arbolRespawn', { id: arbol.id, x: arbol.x, y: arbol.y }); }, 15000);
    });

    socket.on('recogerRoca', (data) => {
        let j = players[socket.id];
        if (!j || !j.isAlive) return;
        let roca = rocas.find(r => r.activo && getDistance(data.x, data.y, r.x, r.y) < 50);
        if (!roca) return;
        if (getDistance(j.x, j.y, roca.x, roca.y) > 70) { socket.emit('mensaje', 'Muy lejos'); return; }
        roca.activo = false;
        io.emit('rocaDesaparece', { id: roca.id, x: roca.x, y: roca.y });
        socket.emit('rocaObtenida');
        io.emit('rocaRecogida', { id: roca.id, recolectadoPor: j.name });
        setTimeout(() => { const idx = rocas.findIndex(r => r.id === roca.id); if (idx !== -1) { rocas[idx].activo = true; rocas[idx].x = Math.random()*2800+100; rocas[idx].y = Math.random()*2800+100; io.emit('rocaRespawn', { id: rocas[idx].id, x: rocas[idx].x, y: rocas[idx].y }); } }, CONFIG.ROCAS.RESPAWN_TIME);
    });

    socket.on('picarMina', (data) => {
        const j = players[socket.id];
        if (!j || !j.isAlive) return;
        const mina = minas.find(m => m.activo && getDistance(data.x, data.y, m.x, m.y) < 60);
        if (!mina) return;
        if (getDistance(j.x, j.y, mina.x, mina.y) > 80) { socket.emit('mensaje', 'Muy lejos'); return; }
        mina.activo = false;
        io.emit('minaDesaparece', { id: mina.id, x: mina.x, y: mina.y });
        socket.emit('minaPicada');
        io.emit('minaRecogida', { id: mina.id, recolectadoPor: j.name });
        setTimeout(() => { const idx = minas.findIndex(m => m.id === mina.id); if (idx !== -1) { minas[idx].activo = true; minas[idx].x = Math.random()*2800+100; minas[idx].y = Math.random()*2800+100; io.emit('minaRespawn', { id: minas[idx].id, x: minas[idx].x, y: minas[idx].y }); } }, CONFIG.MINAS.RESPAWN_TIME);
    });

    socket.on('abrirCofre', (data) => {
        if (!cofre.abierto && getDistance(data.x, data.y, cofre.x, cofre.y) < 50) {
            cofre.abierto = true;
            const loot = generarLootCofre();
            io.emit('cofreAbierto', { x: cofre.x, y: cofre.y });
            io.emit('cofreLoot', { loot: loot });
            setTimeout(() => { if (cofre.abierto) { cofre = { x: Math.random() * 2800 + 100, y: Math.random() * 2800 + 100, abierto: false }; io.emit('cofreNuevo', { x: cofre.x, y: cofre.y }); } }, 180000);
        }
    });

    socket.on('solicitarDropItem', (data) => { dropearItem(data.x, data.y, data.id); });
    socket.on('solicitarDropPocion', (data) => { io.emit('dropPocion', { x: data.x, y: data.y, tipo: data.tipo, cantidad: data.cantidad }); });

    socket.on('equiparHachaLegendaria', () => {
        const j = players[socket.id];
        if (j) { j.contraGolpeContador = 0; j.contraGolpeDanioAcumulado = 0; j.contraGolpeCargado = false; j.contraGolpeBonus = 0; io.emit('contraGolpeUsado', { playerId: socket.id }); }
    });

    socket.on('desequiparHachaLegendaria', () => {
        const j = players[socket.id];
        if (j) { j.contraGolpeCargado = false; j.contraGolpeBonus = 0; io.emit('contraGolpeUsado', { playerId: socket.id }); }
    });

    // ═══ DESCONEXIÓN ═══
    socket.on('disconnect', () => {
        try { fs.writeFileSync(INVENTARIOS_FILE, JSON.stringify(inventariosJugadores, null, 2)); } catch(e) {}
        try { fs.writeFileSync(PILARES_FILE, JSON.stringify(pilares, null, 2)); } catch(e) {}
        try { fs.writeFileSync(LIGAS_FILE, JSON.stringify(ligas, null, 2)); } catch(e) {}
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
        delete skillCooldowns[socket.id];
        delete jugadoresEnMapa[socket.id];
        delete sacrificioActivoServer[socket.id];
        delete esqueletosEnAuraSacrificio[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// ═══════════════════════════════════════════════════════════════
// ═══ INTERVALOS GLOBALES DE LIGAS Y PILARES ═══
// ═══════════════════════════════════════════════════════════════

// Expiración de invitaciones de team
setInterval(() => {
    const ahora = Date.now();
    for (let id in invitacionesPendientes) {
        if (ahora - invitacionesPendientes[id].timestamp > 30000) {
            io.to(id).emit('mensaje', 'La invitacion expiro');
            delete invitacionesPendientes[id];
        }
    }
    // Expiración de invitaciones de liga
    for (let id in invitacionesLiga) {
        if (ahora - invitacionesLiga[id].timestamp > 120000) {
            io.to(id).emit('mensaje', 'La invitación a la liga expiró');
            delete invitacionesLiga[id];
        }
    }
}, 30000);

// Ranking en consola
setInterval(() => {
    const ranking = obtenerTop10();
    console.log('TOP 10 JUGADORES:');
    ranking.forEach((j, i) => { console.log(`  ${i+1}. ${j.nombre} (${j.clase}) - Nivel ${j.nivel} - Poder: ${j.poder}`); });
}, 60000);
process.on('SIGINT', () => {
    console.log('💾 Guardando antes de salir...');
    try {
        fs.writeFileSync(INVENTARIOS_FILE, JSON.stringify(inventariosJugadores, null, 2));
        fs.writeFileSync(PILARES_FILE, JSON.stringify(pilares, null, 2));
        fs.writeFileSync(LIGAS_FILE, JSON.stringify(ligas, null, 2));
        console.log('✅ Guardado exitoso. Saliendo...');
    } catch(e) {
        console.log('⚠️ Error al guardar:', e.message);
    }
    process.exit(0);
});
// ═══ DEBUG + REFRESH AUTOMÁTICO DEL RANKING ═══
setInterval(() => {
    console.log('--- RANKING DEBUG ---');
    const ids = Object.keys(players);
    if (ids.length === 0) {
        console.log('  (no hay jugadores conectados)');
    } else {
        ids.forEach(id => {
            const j = players[id];
            if (j) {
                const poder = calcularPoderJugador(id);
                console.log(`  ${j.name}: Nv${j.level || 1} | Poder ${poder} | HP ${j.hp || 0}/${j.maxHp || 0}`);
            }
        });
    }
    console.log('---------------------');
    
    // 🔄 Forzar refresh del ranking a TODOS los clientes
    ids.forEach(id => {
        io.to(id).emit('rankingTop10', { ranking: obtenerTop10() });
    });
}, 15000);
const PORT = process.env.PORT || 10000;
http.listen(PORT, '0.0.0.0', () => console.log(`DEVILAND - Puerto ${PORT}`));

// ═══════════════════════════════════════════════════════════════
// ═══ FIN PARTE 3/3 — SERVIDOR ═══
// ═══════════════════════════════════════════════════════════════