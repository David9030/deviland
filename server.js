const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

const CONFIG = {
    PORT: 3000,
    DEMONLORD: { MAX_HP: 5000, RESPAWN_TIME: 10000, SPEED: 7, ATTACK_COOLDOWN: 2000, ATTACK_DAMAGE: 200, VISION_RANGE: 400, EXP: 500 },
    SKELETON: { MAX_HP: 200, RESPAWN_TIME: 10000, SPEED: 12, ATTACK_COOLDOWN: 1000, ATTACK_DAMAGE: 25, VISION_RANGE: 400, EXP: 50, DEFENSE: 0 },
    PLAYER: { MAX_HP: 500, RESPAWN_TIME: 10000,
        BASE_STATS: {
            barbaro: { fuerza: 18, defensa: 8, agilidad: 8, vitalidad: 12, attackSpeed: 0.7, baseDamage: 60, mana: 50 },
            caballero: { fuerza: 12, defensa: 15, agilidad: 8, vitalidad: 14, attackSpeed: 0.9, baseDamage: 45, mana: 60 },
            warrior: { fuerza: 10, defensa: 10, agilidad: 15, vitalidad: 10, attackSpeed: 1.0, baseDamage: 50, mana: 60 },
            mago: { fuerza: 5, defensa: 5, agilidad: 12, vitalidad: 8, attackSpeed: 1.0, baseDamage: 35, mana: 150 },
            necromancer: { fuerza: 5, defensa: 5, agilidad: 10, vitalidad: 8, attackSpeed: 1.0, baseDamage: 35, mana: 150 }
        }
    },
    ROCAS: { CANTIDAD_INICIAL: 20, MAX_POR_JUGADOR: 50, RESPAWN_TIME: 30000 }
};

app.use(express.static(__dirname));
app.use('/ui', express.static(path.join(__dirname, 'ui')));
app.use('/skills', express.static(path.join(__dirname, 'skills')));
app.use('/fireball', express.static(path.join(__dirname, 'fireball')));

app.get('/espada_img.png', (req, res) => res.sendFile(path.join(__dirname, 'espada.png')));
app.get('/escudo_madera_img.png', (req, res) => res.sendFile(path.join(__dirname, 'escudo_madera.png')));
app.get('/armadura_de_cuero_img.png', (req, res) => res.sendFile(path.join(__dirname, 'armadura_de_cuero.png')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let players = {};
let ultimoAtaque = new Map();
let demonlord = { id: 'demonlord', x: 1500, y: 1500, hp: CONFIG.DEMONLORD.MAX_HP, maxHp: CONFIG.DEMONLORD.MAX_HP, isAlive: true, dir: 'Abajo', attackCooldown: 0, attackers: [], isAttacking: false, currentTarget: null };
let esqueletos = [];
let arboles = [], minas = [], rocas = [], recursosJugadores = {}, inventariosJugadores = {};
let nextSkeletonId = 100;
let skillCooldowns = {};
let teams = {};
let playerTeam = {};
let invitacionesPendientes = {};

function getDistance(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

function getPlayerDefense(playerId) {
    const jugador = players[playerId];
    if (!jugador) return 0;
    const inventario = inventariosJugadores[playerId];
    if (!inventario) return 0;
    let defensaTotal = 0;
    const escudoId = jugador.equipamiento?.escudo;
    if (escudoId) {
        const item = inventario.items.find(i => i.id === escudoId);
        if (item && item.defensaFisica) defensaTotal += item.defensaFisica;
    }
    const armaduraId = jugador.equipamiento?.armadura;
    if (armaduraId) {
        const item = inventario.items.find(i => i.id === armaduraId);
        if (item && item.defensaFisica) defensaTotal += item.defensaFisica;
    }
    const statsBase = CONFIG.PLAYER.BASE_STATS[jugador.class] || CONFIG.PLAYER.BASE_STATS.warrior;
    defensaTotal += statsBase.defensa || 0;
    return defensaTotal;
}

function calcularDañoFinal(objetivoId, dañoBase, tipo = 'fisico') {
    const defensa = getPlayerDefense(objetivoId);
    const dañoFinal = Math.max(1, dañoBase - defensa);
    return dañoFinal;
}

function dañarEsqueleto(esqueleto, atacanteId, daño, esDistancia = false) {
    if (!esqueleto || !esqueleto.isAlive) return;
    if (!esqueleto.attackers) esqueleto.attackers = [];
    if (!esqueleto.attackers.includes(atacanteId)) esqueleto.attackers.push(atacanteId);
    esqueleto.hp = Math.max(0, esqueleto.hp - daño);
   if (esqueleto.hp <= 0) {
    esqueleto.isAlive = false;

    if (players[atacanteId] && players[atacanteId].className === 'BARBARO') {
        io.emit('barbaroAsesinato', { playerId: atacanteId });
    }
    
    // Dentro de dañarEsqueleto, cuando el esqueleto muere (hp <= 0)

// Verificar si el atacante tiene equipo
const teamId = playerTeam[atacanteId];
let destinatarios = [];

if (teamId && teams[teamId]) {
    destinatarios = teams[teamId].miembros; // Todo el equipo
} else {
    destinatarios = [atacanteId]; // Solo el atacante
}

function enviarDrop(evento, datos) {
    destinatarios.forEach(destinatario => {
        io.to(destinatario).emit(evento, datos);
    });
}

// Drops (mantener las mismas probabilidades)
if (Math.random() < 0.1) {
    const tipoPocion = Math.random() < 0.5 ? 'hp' : 'mana';
    enviarDrop('dropPocion', {
        x: esqueleto.x, y: esqueleto.y, tipo: tipoPocion, cantidad: 1
    });
}
if (Math.random() < 0.05) {
    enviarDrop('dropItem', {
        x: esqueleto.x, y: esqueleto.y, itemId: 'espada_1', nombre: 'Espada',
        tipo: 'espada', icono: 'espada_img', stats: { ataqueFisico: 15, velocidad: -15 }
    });
}
if (Math.random() < 0.05) {
    enviarDrop('dropItem', {
        x: esqueleto.x, y: esqueleto.y, itemId: 'escudo_1', nombre: 'Escudo',
        tipo: 'escudo', icono: 'escudo_madera_img', stats: { defensaFisica: 20, velocidad: -15 }
    });
}
if (Math.random() < 0.03) {
    enviarDrop('dropItem', {
        x: esqueleto.x, y: esqueleto.y, itemId: 'armadura_1', nombre: 'Armadura',
        tipo: 'armadura', icono: 'armadura_de_cuero_img', stats: { defensaFisica: 15, velocidad: -20 }
    });
}
    
    // REPARTIR EXP
    if (esqueleto.attackers && esqueleto.attackers.length > 0) {
        esqueleto.attackers.forEach(attackerId => darExpAJugadorYEquipo(attackerId, CONFIG.SKELETON.EXP));
    } else {
        darExpAJugadorYEquipo(atacanteId, CONFIG.SKELETON.EXP);
    }
    
    io.emit('esqueletoDeath', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, exp: CONFIG.SKELETON.EXP, attackers: esqueleto.attackers || [] });
    
    // RESPAWN DEL ESQUELETO PARA MANTENER 50 SIEMPRE
    setTimeout(() => {
        if (!esqueleto.isAlive && !esqueleto.isAlly) {
            esqueleto.isAlive = true;
            esqueleto.hp = CONFIG.SKELETON.MAX_HP;
            esqueleto.x = Math.random() * 2800 + 100;
            esqueleto.y = Math.random() * 2800 + 100;
            esqueleto.attackers = [];
            io.emit('esqueletoNew', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y });
        }
    }, CONFIG.SKELETON.RESPAWN_TIME);
}
}

function darExpAJugadorYEquipo(socketId, exp) {
    const jugador = players[socketId];
    if (!jugador) return;
    jugador.exp = (jugador.exp || 0) + exp;
    io.to(socketId).emit('playerExpGain', { id: socketId, exp: exp });
    const teamId = playerTeam[socketId];
    if (teamId && teams[teamId]) {
        teams[teamId].miembros.forEach(miembroId => {
            if (miembroId !== socketId && players[miembroId]) {
                players[miembroId].exp = (players[miembroId].exp || 0) + exp;
                io.to(miembroId).emit('playerExpGain', { id: miembroId, exp: exp });
            }
        });
    }
}

function revivirJugador(socketId) {
    const jugador = players[socketId];
    if (!jugador) return;
    jugador.isAlive = true;
    jugador.hp = CONFIG.PLAYER.MAX_HP;
    jugador.mana = (CONFIG.PLAYER.BASE_STATS[jugador.class]?.mana || 100);
    jugador.x = 512;
    jugador.y = 512;
    io.emit('playerRespawn', { id: socketId, x: 512, y: 512 });
}

// ==========================================
// FUNCIÓN PARA GENERAR EXACTAMENTE 50 ESQUELETOS
// ==========================================
function generarEsqueletosIniciales() {
    esqueletos = [];
    for(let i = 0; i < 50; i++) {
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
    console.log(`✅ ${esqueletos.length} esqueletos generados en el servidor`);
    return esqueletos;
}

function generarArboles() {
    for(let i = 0; i < 15; i++) arboles.push({ id: 'arbol_' + i, x: Math.random() * 2800 + 100, y: Math.random() * 2800 + 100, madera: 10, activo: true });
    io.emit('arbolesIniciales', arboles);
}

function generarMinas() {
    for(let i = 0; i < 10; i++) minas.push({ id: 'mina_' + i, x: Math.random() * 2800 + 100, y: Math.random() * 2800 + 100, minerales: 15, activo: true });
    io.emit('minasIniciales', minas);
}

function generarRocas() {
    for(let i = 0; i < CONFIG.ROCAS.CANTIDAD_INICIAL; i++) rocas.push({ id: 'roca_' + i, x: Math.random() * 2800 + 100, y: Math.random() * 2800 + 100, activo: true });
    io.emit('rocasIniciales', rocas);
}

// ==========================================
// GENERACIÓN INICIAL (SOLO UNA VEZ)
// ==========================================
console.log("🚀 INICIANDO SERVIDOR DEVILAND...");
generarArboles();
generarMinas();
generarRocas();
generarEsqueletosIniciales();

io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);
    skillCooldowns[socket.id] = { furiaNecrotica: 0 };
    
    socket.emit('arbolesIniciales', arboles);
    socket.emit('minasIniciales', minas);
    socket.emit('rocasIniciales', rocas);
    socket.emit('esqueletosIniciales', esqueletos.filter(e => e.isAlive === true));
    socket.emit('currentPlayers', players);
    socket.emit('demonlordState', { hp: demonlord.hp, isAlive: demonlord.isAlive, x: demonlord.x, y: demonlord.y, dir: demonlord.dir });
    
    socket.on('newPlayer', (d) => {
        const baseStats = CONFIG.PLAYER.BASE_STATS[d.class] || CONFIG.PLAYER.BASE_STATS.warrior;
        let ataqueFisico = 15;
        if (d.className === 'BÁRBARO') ataqueFisico = 80;
        else if (d.className === 'CABALLERO') ataqueFisico = 50;
        else if (d.className === 'WARRIOR') ataqueFisico = 50;
        else if (d.className === 'MAGO' || d.className === 'NECROMANCER') ataqueFisico = 15;
        
        players[socket.id] = { 
            id: socket.id, x: 512, y: 512, class: d.class, name: d.name, className: d.className,
            hp: CONFIG.PLAYER.MAX_HP, maxHp: CONFIG.PLAYER.MAX_HP, isAlive: true,
            deathCount: 0, deathPosition: null, team: 'Sin Team', level: 1, exp: 0, dir: 'Abajo',
            stats: { fuerza: baseStats.fuerza, defensa: baseStats.defensa, agilidad: baseStats.agilidad, vitalidad: baseStats.vitalidad, puntosDisponibles: 5 },
            minerales: { hierro: 0, bronce: 0, plata: 0, oro: 0 },
            equipamiento: { cabeza: null, pecho: null, piernas: null, pies: null, arma: null, escudo: null, ring1: null, ring2: null },
            mana: baseStats.mana || 100, maxMana: baseStats.mana || 100,
            esqueletosSummon: 0,
            skillsEquipadas: d.className === 'NECROMANCER' ? ['levantar_muerto', 'furia_necrotica', 'ataque_distancia'] : (d.className === 'MAGO' ? ['ataque_distancia'] : []),
            attackSpeedModifier: baseStats.attackSpeed || 1.0,
            baseDamage: baseStats.baseDamage || 50,
            ataqueFisico: ataqueFisico
        };
        
        if (!inventariosJugadores[socket.id]) {
            inventariosJugadores[socket.id] = { items: [], equipamiento: {} };
        }
        inventariosJugadores[socket.id].items.push({ id: 'pocion_1', tipo: 'pocion', nombre: 'Poción de Vida', icono: '❤️', cantidad: 2, slot: 0 });
        
        socket.emit('inventarioCompleto', inventariosJugadores[socket.id]);
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });
    
    socket.on('solicitarInventarioCompleto', () => {
        if (inventariosJugadores[socket.id]) {
            socket.emit('inventarioCompleto', inventariosJugadores[socket.id]);
        } else {
            inventariosJugadores[socket.id] = { 
                items: [
                    { id: 'pocion_1', tipo: 'pocion', nombre: 'Poción de Vida', icono: '❤️', cantidad: 2, slot: 0 },
                ], 
                equipamiento: {} 
            };
            socket.emit('inventarioCompleto', inventariosJugadores[socket.id]);
        }
    });
    
    socket.on('actualizarInventario', (data) => {
        const jugador = players[socket.id];
        if (!jugador) return;
        if (data.inventarioSlots) {
            inventariosJugadores[socket.id].items = [];
            for (let i = 0; i < data.inventarioSlots.length; i++) {
                if (data.inventarioSlots[i]) {
                    inventariosJugadores[socket.id].items.push({ ...data.inventarioSlots[i], slot: i });
                }
            }
        }
        if (data.equipamiento) inventariosJugadores[socket.id].equipamiento = data.equipamiento;
    });
    
    socket.on('usarPocion', (data) => {
        const jugador = players[socket.id];
        if (!jugador) return;
        const curacion = data.curacion || 20;
        jugador.hp = Math.min(jugador.maxHp, jugador.hp + curacion);
        io.emit('playerStatsUpdate', { id: socket.id, hp: jugador.hp });
    });
    
    socket.on('usarPocionMana', (data) => {
        const jugador = players[socket.id];
        if (jugador) {
            jugador.mana = Math.min(jugador.maxMana, jugador.mana + data.restauracion);
            io.emit('playerStatsUpdate', { id: socket.id, mana: jugador.mana });
        }
    });
    
    socket.on('playerMovement', (data) => {
        let p = players[socket.id];
        if (p && p.isAlive) {
            p.x = data.x; p.y = data.y; p.dir = data.dir; p.isMoving = data.isMoving;
            socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y, dir: data.dir, isMoving: data.isMoving, hp: p.hp, maxHp: p.maxHp, timestamp: data.timestamp });
        }
    });
    
    socket.on('playerAttack', (data) => { 
        const jugador = players[socket.id]; 
        if (!jugador || !jugador.isAlive) return; 
        const ahora = Date.now(); 
        if (ultimoAtaque.get(socket.id) && (ahora - ultimoAtaque.get(socket.id) < 100)) return; 
        ultimoAtaque.set(socket.id, ahora); 
        socket.broadcast.emit('playerAttacked', { id: socket.id, dir: jugador.dir, class: jugador.class }); 
        
        let esqueletoCercano = null; 
        let distanciaMinima = 80; 
        for (let esqueleto of esqueletos) { 
            if (esqueleto.isAlive && !esqueleto.isAlly) { 
                const dist = getDistance(jugador.x, jugador.y, esqueleto.x, esqueleto.y); 
                if (dist < distanciaMinima) { 
                    distanciaMinima = dist; 
                    esqueletoCercano = esqueleto; 
                } 
            } 
        } 
        
        if (esqueletoCercano) { 
            let damage = data.damageBonus || jugador.ataqueFisico; 
            const finalDamage = Math.max(1, Math.floor(damage)); 
            dañarEsqueleto(esqueletoCercano, socket.id, finalDamage, false);
        } 
    });
    
    socket.on('esqueletoHit', (data) => { 
        const jugador = players[socket.id]; 
        if (!jugador || !jugador.isAlive) return; 
        let esqueleto = esqueletos.find(e => e.id === data.id && e.isAlive); 
        if (!esqueleto) return; 
        let damage = data.damageBonus || 0; 
        const finalDamage = Math.max(1, damage); 
        dañarEsqueleto(esqueleto, socket.id, finalDamage, true);
    });
    
    socket.on('playerMurio', (data) => {
        const jugador = players[data.id];
        if (jugador && jugador.isAlive) {
            jugador.isAlive = false;
            jugador.hp = 0;
            io.emit('playerDeath', { id: data.id, name: jugador.name });
            esqueletos.forEach(esq => { if (esq.targetId === data.id) { esq.targetId = null; esq.targetType = null; } });
        }
    });
    
    socket.on('playerRespawn', (data) => { if (data.id === socket.id) revivirJugador(socket.id); });
    
    socket.on('demonlordHit', (data) => {
        if (!demonlord.isAlive) return;
        const jugador = players[socket.id];
        if (!jugador || !jugador.isAlive) return;
        
        if (!demonlord.attackers) demonlord.attackers = [];
        if (!demonlord.attackers.includes(socket.id)) demonlord.attackers.push(socket.id);
        
        let damage = jugador.ataqueFisico;
        if (data.damageBonus) damage += data.damageBonus;
        if (data.esCritico) damage *= 2;
        
        demonlord.hp = Math.max(0, demonlord.hp - damage);
        
        io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: damage, hp: demonlord.hp });
        
        if (demonlord.hp <= 0) {
    demonlord.isAlive = false;
    
    if (demonlord.attackers && demonlord.attackers.length > 0) {
        demonlord.attackers.forEach(attackerId => darExpAJugadorYEquipo(attackerId, CONFIG.DEMONLORD.EXP));
    } else {
        darExpAJugadorYEquipo(socket.id, CONFIG.DEMONLORD.EXP);
    }
    
    // ==========================================
    // DROPS DE DEMONLORD (INDIVIDUALES PARA CADA PARTICIPANTE)
    // ==========================================
    
    // Oro: CADA participante recibe su propio oro (8 monedas por participante)
    demonlord.attackers.forEach(attackerId => {
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const distancia = 60 + (Math.random() * 40);
            const offsetX = Math.cos(angle) * distancia;
            const offsetY = Math.sin(angle) * distancia;
            const cantidadOro = Math.floor(Math.random() * 20) + 10;
            io.to(attackerId).emit('crearMonedaServidor', { 
                x: demonlord.x + offsetX, 
                y: demonlord.y + offsetY, 
                cantidad: cantidadOro 
            });
        }
    });
    
    // Hacha de Hierro: 20% de probabilidad para CADA participante (individual)
    demonlord.attackers.forEach(attackerId => {
        if (Math.random() < 0.2) {
            io.to(attackerId).emit('dropItem', { 
                x: demonlord.x + (Math.random() - 0.5) * 80, 
                y: demonlord.y + (Math.random() - 0.5) * 80, 
                itemId: 'hachadehierro_1',
                nombre: 'Hacha de Hierro',
                tipo: 'espada',
                icono: 'hachadehierro_img',
                stats: { ataqueFisico: 25, velocidad: -10 }
            });
        }
    });
    
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
        const jugador = players[socket.id];
        if (!jugador) return;
        const dist = getDistance(demonlord.x, demonlord.y, jugador.x, jugador.y);
        if (dist < CONFIG.DEMONLORD.VISION_RANGE + 100) {
            socket.emit('demonlordHPResponse', { hp: demonlord.hp, maxHp: demonlord.maxHp, visible: true });
        } else {
            socket.emit('demonlordHPResponse', { visible: false });
        }
    });
    
    socket.on('levantarEsqueleto', (data) => {
        const jugador = players[socket.id];
        if (!jugador || jugador.className !== 'NECROMANCER') {
            socket.emit('mensaje', '❌ Solo los Necromancer pueden levantar muertos');
            return;
        }
        let cadaver = esqueletos.find(e => e.id === data.id && !e.isAlive && !e.isAlly);
        if (!cadaver) { socket.emit('mensaje', '❌ No hay cadáver cerca'); return; }
        const distToCorpse = getDistance(jugador.x, jugador.y, cadaver.x, cadaver.y);
        if (distToCorpse > 100) { socket.emit('mensaje', '❌ El cadáver está muy lejos'); return; }
        
        // En lugar de eliminar el esqueleto, lo convertimos en aliado
        cadaver.isAlive = true;
        cadaver.isAlly = true;
        cadaver.ownerId = socket.id;
        cadaver.hp = cadaver.maxHp;
        cadaver.x = jugador.x + (Math.random() * 100 - 50);
        cadaver.y = jugador.y + (Math.random() * 100 - 50);
        cadaver.attackers = [];
        
        jugador.esqueletosSummon = (jugador.esqueletosSummon || 0) + 1;
        io.emit('esqueletoRevive', { id: cadaver.id, x: cadaver.x, y: cadaver.y, ownerId: socket.id });
        io.emit('playerStatsUpdate', { id: socket.id, hp: jugador.hp, mana: jugador.mana });
    });
    
    socket.on('furiaNecrotica', () => {
        const jugador = players[socket.id];
        if (!jugador || jugador.className !== 'NECROMANCER') { socket.emit('mensaje', '❌ Solo los Necromancer pueden usar Furia Necrótica'); return; }
        const now = Date.now();
        const lastUse = skillCooldowns[socket.id].furiaNecrotica;
        const cooldownTime = 120000;
        if (lastUse > 0 && (now - lastUse) < cooldownTime) { socket.emit('mensaje', `⏳ Furia Necrótica en cooldown`); return; }
        const esqueletosAliados = esqueletos.filter(e => e.isAlly === true && e.ownerId === socket.id && e.isAlive === true);
        const cantidad = esqueletosAliados.length;
        if (cantidad === 0) { socket.emit('mensaje', '❌ No tienes esqueletos aliados'); return; }
        const manaCost = cantidad * 10;
        if (jugador.mana < manaCost) { socket.emit('mensaje', `❌ Necesitas ${manaCost} de maná`); return; }
        jugador.mana -= manaCost;
        io.emit('playerStatsUpdate', { id: socket.id, mana: jugador.mana });
        const bonusPorcentaje = cantidad * 0.07;
        const bonusDamage = Math.floor(CONFIG.SKELETON.ATTACK_DAMAGE * bonusPorcentaje);
        const esqueletosIds = [];
        esqueletosAliados.forEach(esqueleto => { esqueleto.damageBonus = bonusDamage; esqueletosIds.push(esqueleto.id); });
        skillCooldowns[socket.id].furiaNecrotica = now;
        io.emit('furiaNecroticaEffect', { playerId: socket.id, duracion: 10, esqueletosIds: esqueletosIds, bonusPorcentaje: bonusPorcentaje });
        setTimeout(() => {
            esqueletos.filter(e => e.isAlly === true && e.ownerId === socket.id && e.isAlive === true).forEach(esqueleto => esqueleto.damageBonus = 0);
            io.emit('furiaNecroticaEnd', { playerId: socket.id });
        }, 10000);
    });
    
    socket.on('crearProyectil', (data) => socket.broadcast.emit('proyectilCreado', data));
    socket.on('solicitarEsqueletos', () => { 
        const jugador = players[socket.id]; 
        if(jugador) {
            socket.emit('esqueletosIniciales', esqueletos.filter(e => e.isAlive === true));
        } 
    });
    
   socket.on('chatMessage', (msg) => {
    // Solo chat normal, sin comandos
    const jugador = players[socket.id];
    if (jugador) {
        io.emit('chatMessage', { type: 'user', name: jugador.name, msg: msg });
    }
});

// ==========================================
// AGREGAR SALIR EQUIPO AQUI
// ==========================================
socket.on('salirEquipo', () => {
    const teamId = playerTeam[socket.id];
    if (!teamId || !teams[teamId]) {
        socket.emit('mensaje', 'No estas en ningun equipo');
        return;
    }
    const team = teams[teamId];
    const index = team.miembros.indexOf(socket.id);
    if (index !== -1) team.miembros.splice(index, 1);
    delete playerTeam[socket.id];
    players[socket.id].team = 'Sin Team';
    
    if (team.miembros.length === 0) {
        delete teams[teamId];
    } else if (team.lider === socket.id) {
        team.lider = team.miembros[0];
    }
    
    socket.emit('mensaje', 'Has salido del equipo');
    io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${players[socket.id].name} salio del equipo` });
});

// ==========================================
// ACEPTAR INVITACION
// ==========================================
socket.on('aceptarInvitacion', (data) => {
    const invitacion = invitacionesPendientes[socket.id];
    if (!invitacion) {
        socket.emit('mensaje', 'No tienes invitaciones pendientes');
        return;
    }
    
    const team = teams[invitacion.teamId];
    if (!team) {
        socket.emit('mensaje', 'El equipo ya no existe');
        delete invitacionesPendientes[socket.id];
        return;
    }
    
    if (playerTeam[socket.id]) {
        socket.emit('mensaje', 'Ya estas en un equipo');
        return;
    }
    
    team.miembros.push(socket.id);
    playerTeam[socket.id] = team.id;
    players[socket.id].team = team.nombre;
    
    delete invitacionesPendientes[socket.id];
    
    io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${players[socket.id].name} se unio al equipo "${team.nombre}"` });
});

// ==========================================
// RECHAZAR INVITACION
// ==========================================
socket.on('rechazarInvitacion', (data) => {
    delete invitacionesPendientes[socket.id];
    socket.emit('mensaje', 'Invitacion rechazada');
});


    
     socket.on('talarArbol', (data) => {
        let jugador = players[socket.id];
        if(!jugador || !jugador.isAlive) return;
        let arbol = arboles.find(a => a.activo && getDistance(data.x, data.y, a.x, a.y) < 80);
        if(!arbol || arbol.madera <= 0) return;
        const distJugadorArbol = getDistance(jugador.x, jugador.y, arbol.x, arbol.y);
        if (distJugadorArbol > 100) { socket.emit('mensaje', '❌ Estás demasiado lejos del árbol'); return; }
        arbol.madera--;
        io.emit('arbolTalado', { id: arbol.id, x: arbol.x, y: arbol.y, taladoPor: jugador.name });
        if(arbol.madera <= 0) { 
            arbol.activo = false;
            io.emit('arbolDesaparece', { id: arbol.id, x: arbol.x, y: arbol.y });
            setTimeout(() => {
                arbol.x = Math.random() * 2800 + 100;
                arbol.y = Math.random() * 2800 + 100;
                arbol.madera = 10;
                arbol.activo = true;
                io.emit('arbolRespawn', { id: arbol.id, x: arbol.x, y: arbol.y });
            }, 15000);
        }
        socket.emit('maderaObtenida');
    });
    
    socket.on('minarMina', (data) => {
        const jugador = players[socket.id];
        if (!jugador || !jugador.isAlive) return;
        let minaCercana = null;
        for (let mina of minas) {
            if (!mina.activo) continue;
            if (getDistance(data.x, data.y, mina.x, mina.y) < 80) { minaCercana = mina; break; }
        }
        if (!minaCercana || minaCercana.minerales <= 0) return;
        const distJugadorMina = getDistance(jugador.x, jugador.y, minaCercana.x, minaCercana.y);
        if (distJugadorMina > 100) { socket.emit('mensaje', '❌ Estás demasiado lejos de la mina'); return; }
        minaCercana.minerales--;
        const random = Math.random() * 100;
        let mineral = 'hierro';
        if (random < 2) mineral = 'oro';
        else if (random < 7) mineral = 'plata';
        else if (random < 37) mineral = 'bronce';
        jugador.minerales[mineral]++;
        socket.emit('mineralObtenido', { mineral: mineral, cantidad: 1, ...jugador.minerales });
        io.emit('minaMinada', { id: minaCercana.id, x: minaCercana.x, y: minaCercana.y, mineralObtenido: mineral, minadoPor: jugador.name });
        if (minaCercana.minerales <= 0) {
            minaCercana.activo = false;
            io.emit('minaDesaparece', { id: minaCercana.id, x: minaCercana.x, y: minaCercana.y });
            setTimeout(() => {
                const index = minas.findIndex(m => m.id === minaCercana.id);
                if (index !== -1) {
                    minas[index].activo = true;
                    minas[index].x = Math.random() * 2800 + 100;
                    minas[index].y = Math.random() * 2800 + 100;
                    minas[index].minerales = 15;
                    io.emit('minaRespawn', { id: minas[index].id, x: minas[index].x, y: minas[index].y });
                }
            }, 15000);
        }
    });
    
    socket.on('recogerRoca', (data) => {
        let jugador = players[socket.id];
        if(!jugador || !jugador.isAlive) return;
        let roca = rocas.find(r => r.activo && getDistance(data.x, data.y, r.x, r.y) < 50);
        if(!roca) return;
        const distJugadorRoca = getDistance(jugador.x, jugador.y, roca.x, roca.y);
        if (distJugadorRoca > 70) { socket.emit('mensaje', '❌ Estás demasiado lejos de la roca'); return; }
        jugador.rocas = (jugador.rocas || 0) + 1;
        roca.activo = false;
        io.emit('rocaDesaparece', { id: roca.id, x: roca.x, y: roca.y });
        socket.emit('rocaObtenida', { total: jugador.rocas });
        io.emit('rocaRecogida', { id: roca.id, recolectadoPor: jugador.name });
        setTimeout(() => { 
            const index = rocas.findIndex(r => r.id === roca.id);
            if(index !== -1) {
                rocas[index].activo = true;
                rocas[index].x = Math.random() * 2800 + 100;
                rocas[index].y = Math.random() * 2800 + 100;
                io.emit('rocaRespawn', { id: rocas[index].id, x: rocas[index].x, y: rocas[index].y });
            }
        }, CONFIG.ROCAS.RESPAWN_TIME);
    });
    
    socket.on('disconnect', () => { 
        const teamId = playerTeam[socket.id];
        if (teamId && teams[teamId]) {
            const team = teams[teamId];
            const indexMiembro = team.miembros.indexOf(socket.id);
            if (indexMiembro !== -1) team.miembros.splice(indexMiembro, 1);
            if (team.miembros.length === 0) delete teams[teamId];
            else if (team.lider === socket.id) team.lider = team.miembros[0];
        }
        delete playerTeam[socket.id];
        delete invitacionesPendientes[socket.id];
        delete players[socket.id]; 
        delete inventariosJugadores[socket.id];
        delete recursosJugadores[socket.id];
        delete skillCooldowns[socket.id];
        io.emit('playerDisconnected', socket.id); 
    });
});

// MOVIMIENTO DE DEMONLORD
setInterval(() => {
    if (!demonlord.isAlive) return;
    
    let closestTarget = null;
    let closestDistance = Infinity;
    
    for (let id in players) {
        let player = players[id];
        if (player && player.isAlive) {
            let dist = getDistance(demonlord.x, demonlord.y, player.x, player.y);
            if (dist < closestDistance) {
                closestDistance = dist;
                closestTarget = player;
            }
        }
    }
    
    if (!closestTarget) {
        for (let esq of esqueletos) {
            if (esq.isAlive && esq.isAlly === false) {
                let dist = getDistance(demonlord.x, demonlord.y, esq.x, esq.y);
                if (dist < closestDistance) {
                    closestDistance = dist;
                    closestTarget = esq;
                }
            }
        }
    }
    
    if (!closestTarget) return;
    
    const dx = closestTarget.x - demonlord.x;
    const dy = closestTarget.y - demonlord.y;
    const distance = Math.hypot(dx, dy);
    
    if (Math.abs(dx) > Math.abs(dy)) {
        demonlord.dir = dx > 0 ? 'Derecha' : 'Izquierda';
    } else {
        demonlord.dir = dy > 0 ? 'Abajo' : 'Arriba';
    }
    
    if (distance < 400) {
        if (distance > 70) {
            const moveX = (dx / distance) * CONFIG.DEMONLORD.SPEED;
            const moveY = (dy / distance) * CONFIG.DEMONLORD.SPEED;
            demonlord.x += moveX;
            demonlord.y += moveY;
            demonlord.x = Math.min(Math.max(demonlord.x, 50), 2950);
            demonlord.y = Math.min(Math.max(demonlord.y, 50), 2950);
            io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: true });
        } else {
            io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: false });
        }
        
        if (demonlord.attackCooldown <= 0 && distance < 70) {
            demonlord.attackCooldown = CONFIG.DEMONLORD.ATTACK_COOLDOWN;
            const isPlayer = players[closestTarget.id] ? true : false;
            let damage = CONFIG.DEMONLORD.ATTACK_DAMAGE;
            io.emit('demonlordAtkVisual', { dir: demonlord.dir, esFuerte: false });
            
            setTimeout(() => {
                if (!demonlord.isAlive) return;
                if (!closestTarget) return;
                if (isPlayer && closestTarget.hp <= 0) return;
                if (!isPlayer && !closestTarget.isAlive) return;
                
                if (isPlayer) {
                    let offsetX = 0, offsetY = 0;
                    switch(demonlord.dir) {
                        case 'Derecha': offsetX = 30; break;
                        case 'Izquierda': offsetX = -30; break;
                        case 'Arriba': offsetY = -30; break;
                        case 'Abajo': offsetY = 30; break;
                    }
                    const rectCenterX = demonlord.x + offsetX;
                    const rectCenterY = demonlord.y + offsetY;
                    
                    let golpeado = false;
                    const mediaAncho = 25;
                    const mediaAlto = 25;
                    const dxRect = Math.abs(closestTarget.x - rectCenterX);
                    const dyRect = Math.abs(closestTarget.y - rectCenterY);
                    if (dxRect < mediaAncho && dyRect < mediaAlto) {
                        golpeado = true;
                    }
                    
                    io.emit('demonlordAttack', { targetId: closestTarget.id, damage: damage, x: demonlord.x, y: demonlord.y, dir: demonlord.dir });
                    
                    if (golpeado) {
                        damage = calcularDañoFinal(closestTarget.id, CONFIG.DEMONLORD.ATTACK_DAMAGE);
                        closestTarget.hp = Math.max(0, closestTarget.hp - damage);
                        io.emit('playerStatsUpdate', { id: closestTarget.id, hp: closestTarget.hp });
                        io.emit('enemyDamaged', { id: closestTarget.id, x: closestTarget.x, y: closestTarget.y, dmg: damage });
                    } else {
                        io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `✨ ${closestTarget.name} esquivó el golpe!` });
                    }
                    
                    if (closestTarget.hp <= 0) {
                        closestTarget.isAlive = false;
                        io.emit('playerDeath', { id: closestTarget.id, name: closestTarget.name });
                        setTimeout(() => revivirJugador(closestTarget.id), CONFIG.PLAYER.RESPAWN_TIME);
                    }
                } else {
                    closestTarget.hp = Math.max(0, closestTarget.hp - damage);
                    io.emit('enemyDamaged', { id: closestTarget.id, x: closestTarget.x, y: closestTarget.y, dmg: damage });
                    if (closestTarget.hp <= 0) {
                        closestTarget.isAlive = false;
                        io.emit('esqueletoDeath', { id: closestTarget.id, x: closestTarget.x, y: closestTarget.y, exp: CONFIG.SKELETON.EXP, attackers: ['demonlord'] });
                    }
                }
            }, 300);
        }
    } else {
        io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: false });
    }
    
    if (demonlord.attackCooldown > 0) demonlord.attackCooldown -= 100;
}, 100);

// MOVIMIENTO DE ESQUELETOS
setInterval(() => {
    esqueletos.forEach(esqueleto => {
        if (!esqueleto.isAlive) return;
        let closestTarget = null;
        let closestDistance = Infinity;
        let nearestDistance = Infinity;
        let nearestTarget = null;
        if (esqueleto.isAlly === false) {
            Object.values(players).forEach(player => { if (player.isAlive) { const dist = getDistance(esqueleto.x, esqueleto.y, player.x, player.y); if (dist < nearestDistance) { nearestDistance = dist; nearestTarget = player; } } });
            if (demonlord.isAlive) { const dist = getDistance(esqueleto.x, esqueleto.y, demonlord.x, demonlord.y); if (dist < nearestDistance) { nearestDistance = dist; nearestTarget = demonlord; } }
            esqueletos.forEach(otherSkeleton => { if (otherSkeleton.isAlive && otherSkeleton.id !== esqueleto.id && otherSkeleton.isAlly === true) { const dist = getDistance(esqueleto.x, esqueleto.y, otherSkeleton.x, otherSkeleton.y); if (dist < nearestDistance) { nearestDistance = dist; nearestTarget = otherSkeleton; } } });
        } else {
            if (demonlord.isAlive) { const dist = getDistance(esqueleto.x, esqueleto.y, demonlord.x, demonlord.y); if (dist < nearestDistance) { nearestDistance = dist; nearestTarget = demonlord; } }
            esqueletos.forEach(otherSkeleton => { if (otherSkeleton.isAlive && otherSkeleton.id !== esqueleto.id && otherSkeleton.isAlly === false) { const dist = getDistance(esqueleto.x, esqueleto.y, otherSkeleton.x, otherSkeleton.y); if (dist < nearestDistance) { nearestDistance = dist; nearestTarget = otherSkeleton; } } });
        }
        if (nearestTarget && nearestDistance < CONFIG.SKELETON.VISION_RANGE) { closestTarget = nearestTarget; closestDistance = nearestDistance; }
        if (!closestTarget && esqueleto.isAlly === true && esqueleto.ownerId) {
            const owner = players[esqueleto.ownerId];
            if (owner && owner.isAlive) { const distToOwner = getDistance(esqueleto.x, esqueleto.y, owner.x, owner.y); if (distToOwner > 70) { closestTarget = owner; closestDistance = distToOwner; } }
        }
        if (closestTarget) {
            const dx = closestTarget.x - esqueleto.x;
            const dy = closestTarget.y - esqueleto.y;
            const distance = Math.hypot(dx, dy);
            if (distance > 50) {
                const moveX = (dx / distance) * CONFIG.SKELETON.SPEED;
                const moveY = (dy / distance) * CONFIG.SKELETON.SPEED;
                esqueleto.x += moveX;
                esqueleto.y += moveY;
                if (Math.abs(dx) > Math.abs(dy)) esqueleto.dir = dx > 0 ? 'Derecha' : 'Izquierda';
                else esqueleto.dir = dy > 0 ? 'Abajo' : 'Arriba';
                io.emit('esqueletoMoved', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dir: esqueleto.dir, isMoving: true });
            } else {
                io.emit('esqueletoMoved', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dir: esqueleto.dir, isMoving: false });
            }
            const isOwner = (esqueleto.isAlly === true && closestTarget === players[esqueleto.ownerId]);
            if (esqueleto.attackCooldown <= 0 && closestDistance < 50 && !isOwner) {
                esqueleto.attackCooldown = CONFIG.SKELETON.ATTACK_COOLDOWN;
                let dañoBase = CONFIG.SKELETON.ATTACK_DAMAGE + (esqueleto.damageBonus || 0);
                let damage;
                if (players[closestTarget.id]) {
                    damage = calcularDañoFinal(closestTarget.id, dañoBase);
                } else {
                    damage = dañoBase;
                }
                closestTarget.hp = Math.max(0, closestTarget.hp - damage);
                io.emit('esqueletoAttack', { id: esqueleto.id, targetId: closestTarget.id, damage: damage, x: esqueleto.x, y: esqueleto.y, dir: esqueleto.dir });
                if (closestTarget.hp <= 0) {
                    if (closestTarget.id === 'demonlord') {
                        closestTarget.isAlive = false;
                        io.emit('demonlordDeath', { x: closestTarget.x, y: closestTarget.y });
                        setTimeout(() => {
                            demonlord.hp = CONFIG.DEMONLORD.MAX_HP;
                            demonlord.isAlive = true;
                            demonlord.x = 1500;
                            demonlord.y = 1500;
                            io.emit('demonlordRespawn', { x: demonlord.x, y: demonlord.y });
                        }, CONFIG.DEMONLORD.RESPAWN_TIME);
                    } else if (closestTarget.hasOwnProperty('ownerId')) {
                        const esqueletoAliadoMuerto = closestTarget;
                        esqueletoAliadoMuerto.isAlive = false;
                        io.emit('esqueletoDeath', { id: esqueletoAliadoMuerto.id, x: esqueletoAliadoMuerto.x, y: esqueletoAliadoMuerto.y, exp: 0 });
                        const owner = players[esqueletoAliadoMuerto.ownerId];
                        if (owner) owner.esqueletosSummon = Math.max(0, (owner.esqueletosSummon || 0) - 1);
                        setTimeout(() => {
                            if (esqueletoAliadoMuerto && esqueletoAliadoMuerto.isAlive === false && esqueletoAliadoMuerto.isAlly === true) {
                                esqueletoAliadoMuerto.isAlive = true;
                                esqueletoAliadoMuerto.isAlly = false;
                                esqueletoAliadoMuerto.ownerId = null;
                                esqueletoAliadoMuerto.hp = CONFIG.SKELETON.MAX_HP;
                                esqueletoAliadoMuerto.x = Math.random() * 2800 + 100;
                                esqueletoAliadoMuerto.y = Math.random() * 2800 + 100;
                                io.emit('esqueletoNew', { id: esqueletoAliadoMuerto.id, x: esqueletoAliadoMuerto.x, y: esqueletoAliadoMuerto.y });
                            }
                        }, 60000);
                    } else {
                        closestTarget.isAlive = false;
                        io.emit('esqueletoDeath', { id: closestTarget.id, x: closestTarget.x, y: closestTarget.y, exp: CONFIG.SKELETON.EXP });
                    }
                }
                io.emit('enemyDamaged', { id: closestTarget.id, x: closestTarget.x, y: closestTarget.y, dmg: damage });
            }
        } else {
            io.emit('esqueletoMoved', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dir: esqueleto.dir, isMoving: false });
        }
        if (esqueleto.attackCooldown > 0) esqueleto.attackCooldown -= 100;
    });
}, 150);

setInterval(() => { if (demonlord.isAlive && Math.random() < 0.3) io.emit('demonlordAtkVisual', { dir: demonlord.dir, esFuerte: Math.random() < 0.3 }); }, 2000);

const PORT = process.env.PORT || 10000;
http.listen(PORT, '0.0.0.0', () => console.log(`🔥 DEVILAND - Servidor en puerto ${PORT}`));