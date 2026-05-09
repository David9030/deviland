const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const CONFIG = {
    PORT: 3000,
    DEMONLORD: { MAX_HP: 5000, RESPAWN_TIME: 10000, SPEED: 15, ATTACK_COOLDOWN: 2000, ATTACK_DAMAGE: 45, VISION_RANGE: 350, EXP: 500 },
    SKELETON: { MAX_HP: 200, RESPAWN_TIME: 60000, SPEED: 12, ATTACK_COOLDOWN: 1000, ATTACK_DAMAGE: 25, VISION_RANGE: 500, EXP: 50, DEFENSE: 0 },
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

let players = {};
let demonlord = { id: 'demonlord', x: 1500, y: 1500, hp: CONFIG.DEMONLORD.MAX_HP, maxHp: CONFIG.DEMONLORD.MAX_HP, isAlive: true, dir: 'Abajo', attackCooldown: 0 };
let esqueletos = [];
let arboles = [], minas = [], rocas = [], recursosJugadores = {}, inventariosJugadores = {};
let items = [];
let nextItemId = 1;
let nextSkeletonId = 16;
const MAX_ENEMIGOS = 15;

let skillCooldowns = {};

let teams = {};
let playerTeam = {};
let invitacionesPendientes = {};

function getDistance(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

function darExpAJugadorYEquipo(socketId, exp) {
    const jugador = players[socketId];
    if (!jugador) return;
    
    jugador.exp = (jugador.exp || 0) + exp;
    io.to(socketId).emit('playerExpGain', { id: socketId, exp: exp });
    
    const teamId = playerTeam[socketId];
    if (teamId && teams[teamId]) {
        const team = teams[teamId];
        team.miembros.forEach(miembroId => {
            if (miembroId !== socketId && players[miembroId]) {
                players[miembroId].exp = (players[miembroId].exp || 0) + exp;
                io.to(miembroId).emit('playerExpGain', { id: miembroId, exp: exp });
                io.to(miembroId).emit('chatMessage', { type: 'system', name: 'Sistema', msg: `✨ ${jugador.name} mató a un enemigo y tu equipo ganó +${exp} EXP!` });
            }
        });
    }
}

function spawnItem(x, y, tipo) {
    const item = { id: 'item_' + nextItemId++, x: x, y: y, tipo: tipo, recogido: false, frame: 7 };
    items.push(item);
    io.emit('itemSpawned', item);
    setTimeout(() => {
        const index = items.findIndex(i => i.id === item.id);
        if (index !== -1) items.splice(index, 1);
    }, 30000);
}

function generarArboles() {
    for(let i=0;i<15;i++) arboles.push({ id:'arbol_'+i, x:Math.random()*2800+100, y:Math.random()*2800+100, madera:10, activo:true });
    io.emit('arbolesIniciales', arboles);
}

function generarMinas() {
    for(let i=0;i<10;i++) minas.push({ id:'mina_'+i, x:Math.random()*2800+100, y:Math.random()*2800+100, minerales:15, activo:true });
    io.emit('minasIniciales', minas);
}

function generarRocas() {
    for(let i=0;i<CONFIG.ROCAS.CANTIDAD_INICIAL;i++) rocas.push({ id:'roca_'+i, x:Math.random()*2800+100, y:Math.random()*2800+100, activo:true });
    io.emit('rocasIniciales', rocas);
}

function generarEsqueletos() {
    for(let i=0;i<MAX_ENEMIGOS;i++) {
        esqueletos.push({ 
            id: 'esqueleto_' + nextSkeletonId++, 
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
            baseDamage: CONFIG.SKELETON.ATTACK_DAMAGE
        });
    }
    io.emit('esqueletosIniciales', esqueletos);
}

function respawnEsqueleto(esqueletoId) {
    setTimeout(() => {
        const idx = esqueletos.findIndex(e => e.id === esqueletoId);
        if (idx !== -1 && !esqueletos[idx].isAlive && !esqueletos[idx].isAlly) {
            esqueletos.splice(idx, 1);
            const newEnemy = {
                id: 'esqueleto_' + nextSkeletonId++,
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
                baseDamage: CONFIG.SKELETON.ATTACK_DAMAGE
            };
            esqueletos.push(newEnemy);
            io.emit('esqueletoNew', { id: newEnemy.id, x: newEnemy.x, y: newEnemy.y });
            console.log("🔄 Esqueleto respawneado después de 2 minutos:", newEnemy.id);
        }
    }, 120000);
}

setTimeout(() => { 
    generarArboles(); 
    generarMinas(); 
    generarRocas(); 
    generarEsqueletos(); 
}, 2000);

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);
    
    skillCooldowns[socket.id] = {
        furiaNecrotica: 0
    };
    
    socket.emit('arbolesIniciales', arboles);
    socket.emit('minasIniciales', minas);
    socket.emit('rocasIniciales', rocas);
    socket.emit('esqueletosIniciales', esqueletos);
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
            oro: 100, madera: 0, rocas: 0,
            minerales: { hierro: 0, bronce: 0, plata: 0, oro: 0 },
            equipamiento: { cabeza: null, pecho: null, piernas: null, pies: null, arma: null, escudo: null, ring1: null, ring2: null },
            inventario: { madera: 10, tela: 10, grasa: 10 },
            tieneAntorcha: false, antorchaActiva: false, antorchaTiempo: 0, attackCooldown: 0,
            mana: baseStats.mana || 100, maxMana: baseStats.mana || 100,
            esqueletosSummon: 0,
            skillsEquipadas: d.className === 'NECROMANCER' ? ['levantar_muerto', 'furia_necrotica', 'ataque_distancia'] : (d.className === 'MAGO' ? ['ataque_distancia'] : []),
            attackSpeedModifier: baseStats.attackSpeed || 1.0,
            baseDamage: baseStats.baseDamage || 50,
            ataqueFisico: ataqueFisico
        };
        inventariosJugadores[socket.id] = { items: [], equipamiento: {} };
        inventariosJugadores[socket.id].items.push({ id: 'pocion_1', tipo: 'pocion', nombre: 'Poción de Vida', icono: '❤️', cantidad: 2, slot: 0 });
        inventariosJugadores[socket.id].items.push({ id: 'espada_1', tipo: 'espada', nombre: 'Espada Básica', icono: '⚔️', cantidad: 1, slot: 1 });
        socket.emit('inventarioActualizado', { madera: 10, tela: 10, grasa: 10 });
        socket.broadcast.emit('newPlayer', players[socket.id]);
        io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${d.name} (${d.className || d.class}) se ha unido` });
    });
    
    // Actualizar estadísticas cuando el cliente sube de nivel
    socket.on('actualizarStats', (data) => {
        const jugador = players[socket.id];
        if (!jugador) return;
        
        if (data.fuerza !== undefined) jugador.stats.fuerza = data.fuerza;
        if (data.inteligencia !== undefined) jugador.stats.inteligencia = data.inteligencia;
        if (data.agilidad !== undefined) jugador.stats.agilidad = data.agilidad;
        if (data.vitalidad !== undefined) jugador.stats.vitalidad = data.vitalidad;
        if (data.sabiduria !== undefined) jugador.stats.sabiduria = data.sabiduria;
        
        console.log(`📊 Stats actualizados para ${jugador.name}: fuerza=${jugador.stats.fuerza}`);
    });
    
    socket.on('esqueletoHit', (data) => {
        const jugador = players[socket.id];
        if (!jugador || !jugador.isAlive) return;
        
        let esqueleto = esqueletos.find(e => e.id === data.id && e.isAlive);
        if (!esqueleto) return;
        
        let damage = data.damageBonus || 0;
        const finalDamage = Math.max(1, damage);
        esqueleto.hp = Math.max(0, esqueleto.hp - finalDamage);
        
        io.emit('enemyDamaged', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dmg: finalDamage });
        
        if (esqueleto.hp <= 0) {
            esqueleto.isAlive = false;
            io.emit('esqueletoDeath', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, exp: CONFIG.SKELETON.EXP });
            darExpAJugadorYEquipo(socket.id, CONFIG.SKELETON.EXP);
            respawnEsqueleto(esqueleto.id);
        }
    });
    
    socket.on('invitarJugador', (data) => {
        const invitador = players[socket.id];
        const invitado = players[data.playerId];
        
        if (!invitador || !invitado) return;
        if (!playerTeam[socket.id]) {
            socket.emit('mensaje', '❌ Primero crea un equipo con /crear [nombre]');
            return;
        }
        const team = teams[playerTeam[socket.id]];
        if (team.lider !== socket.id) {
            socket.emit('mensaje', '❌ Solo el líder puede invitar');
            return;
        }
        if (playerTeam[data.playerId]) {
            socket.emit('mensaje', `❌ ${invitado.name} ya está en un equipo`);
            return;
        }
        
        invitacionesPendientes[data.playerId] = { from: socket.id, teamId: team.id, fromName: invitador.name, teamName: team.nombre };
        io.to(data.playerId).emit('invitacionRecibida', { from: invitador.name, teamName: team.nombre });
        socket.emit('mensaje', `📨 Invitación enviada a ${invitado.name}`);
    });
    
    socket.on('aceptarInvitacion', () => {
        const invitacion = invitacionesPendientes[socket.id];
        if (!invitacion) {
            socket.emit('mensaje', '❌ No tienes invitaciones pendientes');
            return;
        }
        const team = teams[invitacion.teamId];
        if (!team) {
            socket.emit('mensaje', '❌ El equipo ya no existe');
            delete invitacionesPendientes[socket.id];
            return;
        }
        if (playerTeam[socket.id]) {
            socket.emit('mensaje', '❌ Ya estás en un equipo');
            return;
        }
        team.miembros.push(socket.id);
        playerTeam[socket.id] = team.id;
        players[socket.id].team = team.nombre;
        delete invitacionesPendientes[socket.id];
        io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🎉 ${players[socket.id].name} se unió al equipo "${team.nombre}"` });
        socket.emit('mensaje', `✅ Te uniste al equipo "${team.nombre}"`);
    });
    
    socket.on('rechazarInvitacion', () => {
        delete invitacionesPendientes[socket.id];
        socket.emit('mensaje', '❌ Invitación rechazada');
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
        
        socket.broadcast.emit('playerAttacked', { id: socket.id, dir: jugador.dir, class: jugador.class });
        
        let esqueletoCercano = null;
        let distanciaMinima = 80;
        
        esqueletos.forEach(esqueleto => {
            if (esqueleto.isAlive && !esqueleto.isAlly) {
                const dist = getDistance(jugador.x, jugador.y, esqueleto.x, esqueleto.y);
                if (dist < distanciaMinima) {
                    distanciaMinima = dist;
                    esqueletoCercano = esqueleto;
                }
            }
        });
        
        if (esqueletoCercano) {
            let damage = jugador.ataqueFisico + Math.floor(jugador.stats.fuerza * 1);
            if (data.damageBonus) damage += data.damageBonus;
            if (data.esCritico) damage *= 2;
            
            const finalDamage = Math.max(1, damage);
            esqueletoCercano.hp = Math.max(0, esqueletoCercano.hp - finalDamage);
            
            io.emit('enemyDamaged', { id: esqueletoCercano.id, x: esqueletoCercano.x, y: esqueletoCercano.y, dmg: finalDamage });
            
            if (esqueletoCercano.hp <= 0) {
                esqueletoCercano.isAlive = false;
                io.emit('esqueletoDeath', { id: esqueletoCercano.id, x: esqueletoCercano.x, y: esqueletoCercano.y, exp: CONFIG.SKELETON.EXP });
                darExpAJugadorYEquipo(socket.id, CONFIG.SKELETON.EXP);
                respawnEsqueleto(esqueletoCercano.id);
            }
        }
    });
    
    socket.on('chatMessage', (msg) => {
        if (!msg.startsWith('/')) {
            const jugador = players[socket.id];
            if (jugador) {
                io.emit('chatMessage', { type: 'user', name: jugador.name, msg: msg });
            }
            return;
        }
        
        const parts = msg.slice(1).split(' ');
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);
        const jugador = players[socket.id];
        
        if (!jugador) return;
        
        switch(cmd) {
            case 'crear':
                const nombreTeam = args.join(' ');
                if (!nombreTeam) {
                    socket.emit('mensaje', '❌ Usa: /crear [nombre del equipo]');
                    return;
                }
                if (playerTeam[socket.id]) {
                    socket.emit('mensaje', '❌ Ya estás en un equipo. Usa /salir primero');
                    return;
                }
                const teamId = 'team_' + Date.now() + '_' + socket.id;
                teams[teamId] = {
                    id: teamId,
                    nombre: nombreTeam,
                    lider: socket.id,
                    miembros: [socket.id],
                    fechaCreacion: Date.now()
                };
                playerTeam[socket.id] = teamId;
                jugador.team = nombreTeam;
                io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `✨ ${jugador.name} creó el equipo "${nombreTeam}"` });
                socket.emit('mensaje', `✅ Equipo "${nombreTeam}" creado. Eres el líder!`);
                break;
                
            case 'equipo':
                const miTeamId = playerTeam[socket.id];
                if (!miTeamId || !teams[miTeamId]) {
                    socket.emit('mensaje', '❌ No estás en ningún equipo');
                    return;
                }
                const miTeam = teams[miTeamId];
                let miembrosLista = '';
                miTeam.miembros.forEach(mId => {
                    const p = players[mId];
                    if (p) {
                        const esLider = miTeam.lider === mId ? '👑 ' : '';
                        miembrosLista += `\n   ${esLider}${p.name}`;
                    }
                });
                socket.emit('mensaje', `📋 EQUIPO "${miTeam.nombre}"\n👑 Líder: ${players[miTeam.lider]?.name}\n👥 Miembros (${miTeam.miembros.length}):${miembrosLista}`);
                break;
                
            case 'salir':
                const salirTeamId = playerTeam[socket.id];
                if (!salirTeamId || !teams[salirTeamId]) {
                    socket.emit('mensaje', '❌ No estás en ningún equipo');
                    return;
                }
                const teamSalir = teams[salirTeamId];
                const indexMiembro = teamSalir.miembros.indexOf(socket.id);
                if (indexMiembro !== -1) teamSalir.miembros.splice(indexMiembro, 1);
                delete playerTeam[socket.id];
                jugador.team = 'Sin Team';
                
                if (teamSalir.miembros.length === 0) {
                    delete teams[salirTeamId];
                    io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `💔 El equipo "${teamSalir.nombre}" se ha disuelto` });
                } else if (teamSalir.lider === socket.id) {
                    teamSalir.lider = teamSalir.miembros[0];
                    io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `👑 ${players[teamSalir.lider]?.name} es el nuevo líder del equipo "${teamSalir.nombre}"` });
                }
                socket.emit('mensaje', `👋 Has salido del equipo "${teamSalir.nombre}"`);
                io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `${jugador.name} ha salido del equipo` });
                break;
                
            case 'aceptar':
                socket.emit('aceptarInvitacion');
                break;
                
            case 'rechazar':
                socket.emit('rechazarInvitacion');
                break;
                
            case 'ayuda':
                socket.emit('mensaje', '📖 COMANDOS:\n/crear [nombre] - Crear equipo\n/equipo - Ver mi equipo\n/salir - Salir del equipo\n/aceptar - Aceptar invitación\n/rechazar - Rechazar invitación\nClick derecho en un jugador para invitar\n/ayuda - Este mensaje');
                break;
                
            default:
                socket.emit('mensaje', `❌ Comando desconocido: /${cmd}. Usa /ayuda`);
        }
    });
    
    socket.on('demonlordHit', (data) => {
        if (!demonlord.isAlive) return;
        const jugador = players[socket.id];
        if (!jugador || !jugador.isAlive) return;
        
        let damage = jugador.ataqueFisico + Math.floor(jugador.stats.fuerza * 1);
        if (data.damageBonus) damage += data.damageBonus;
        if (data.esCritico) damage *= 2;
        
        demonlord.hp = Math.max(0, demonlord.hp - damage);
        io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: damage, hp: demonlord.hp });
        
        if (demonlord.hp <= 0) {
            demonlord.isAlive = false;
            io.emit('demonlordDeath', { x: demonlord.x, y: demonlord.y });
            if (jugador && jugador.inventario) {
                jugador.inventario.tela = (jugador.inventario.tela || 0) + 5;
                jugador.inventario.grasa = (jugador.inventario.grasa || 0) + 5;
                socket.emit('materialObtenido', { tipo: 'tela', cantidad: 5, total: jugador.inventario.tela });
                socket.emit('materialObtenido', { tipo: 'grasa', cantidad: 5, total: jugador.inventario.grasa });
                socket.emit('inventarioActualizado', jugador.inventario);
                io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `👹 ${jugador.name} derrotó al Demonlord y obtuvo 5 tela y 5 grasa!` });
            }
            setTimeout(() => {
                for (let i = 0; i < 8; i++) {
                    const angle = (i / 8) * Math.PI * 2;
                    const distancia = 60 + (Math.random() * 40);
                    const offsetX = Math.cos(angle) * distancia;
                    const offsetY = Math.sin(angle) * distancia;
                    spawnItem(demonlord.x + offsetX, demonlord.y + offsetY, 'moneda');
                }
            }, 1000);
            setTimeout(() => {
                demonlord.hp = CONFIG.DEMONLORD.MAX_HP;
                demonlord.isAlive = true;
                demonlord.x = 1500;
                demonlord.y = 1500;
                io.emit('demonlordRespawn', { x: demonlord.x, y: demonlord.y });
                io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `👹 El Demonlord ha renacido!` });
            }, CONFIG.DEMONLORD.RESPAWN_TIME);
            
            darExpAJugadorYEquipo(socket.id, CONFIG.DEMONLORD.EXP);
            io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `🏆 ${jugador.name} y su equipo ganaron ${CONFIG.DEMONLORD.EXP} EXP!` });
        }
    });
    
    socket.on('levantarEsqueleto', (data) => {
        const jugador = players[socket.id];
        if (!jugador || jugador.className !== 'NECROMANCER') {
            socket.emit('mensaje', '❌ Solo los Necromancer pueden levantar muertos');
            return;
        }
        
        let cadaver = esqueletos.find(e => e.id === data.id && !e.isAlive && !e.isAlly);
        if (!cadaver) {
            socket.emit('mensaje', '❌ No hay cadáver cerca');
            return;
        }
        
        const distToCorpse = getDistance(jugador.x, jugador.y, cadaver.x, cadaver.y);
        if (distToCorpse > 100) {
            socket.emit('mensaje', '❌ El cadáver está muy lejos');
            return;
        }
        
        const index = esqueletos.findIndex(e => e.id === data.id);
        if (index !== -1) esqueletos.splice(index, 1);
        io.emit('esqueletoDestroy', { id: data.id });
        
        const newSkeleton = {
            id: 'esqueleto_' + nextSkeletonId++,
            x: jugador.x + (Math.random() * 100 - 50),
            y: jugador.y + (Math.random() * 100 - 50),
            hp: cadaver.maxHp,
            maxHp: cadaver.maxHp,
            isAlive: true,
            isAlly: true,
            ownerId: socket.id,
            targetId: null,
            targetType: null,
            dir: 'Abajo',
            attackCooldown: 0,
            damageBonus: 0,
            baseDamage: CONFIG.SKELETON.ATTACK_DAMAGE
        };
        esqueletos.push(newSkeleton);
        jugador.esqueletosSummon = (jugador.esqueletosSummon || 0) + 1;
        
        io.emit('esqueletoRevive', { id: newSkeleton.id, x: newSkeleton.x, y: newSkeleton.y, ownerId: socket.id });
        socket.emit('mensaje', `💀 ¡Has levantado un esqueleto aliado! (${jugador.esqueletosSummon} activos)`);
        io.emit('playerStatsUpdate', { id: socket.id, hp: jugador.hp, mana: jugador.mana });
    });
    
    socket.on('crearProyectil', (data) => {
        socket.broadcast.emit('proyectilCreado', data);
    });
    
    socket.on('furiaNecrotica', () => {
        const jugador = players[socket.id];
        if (!jugador || jugador.className !== 'NECROMANCER') {
            socket.emit('mensaje', '❌ Solo los Necromancer pueden usar Furia Necrótica');
            return;
        }
        
        const now = Date.now();
        const lastUse = skillCooldowns[socket.id].furiaNecrotica;
        const cooldownTime = 120000;
        
        if (lastUse > 0 && (now - lastUse) < cooldownTime) {
            const remainingSeconds = Math.ceil((cooldownTime - (now - lastUse)) / 1000);
            socket.emit('mensaje', `⏳ Furia Necrótica en cooldown por ${remainingSeconds}s`);
            return;
        }
        
        const esqueletosAliados = esqueletos.filter(e => e.isAlly === true && e.ownerId === socket.id && e.isAlive === true);
        const cantidad = esqueletosAliados.length;
        
        if (cantidad === 0) {
            socket.emit('mensaje', '❌ No tienes esqueletos aliados');
            return;
        }
        
        const manaCost = cantidad * 10;
        if (jugador.mana < manaCost) {
            socket.emit('mensaje', `❌ Necesitas ${manaCost} de maná (${cantidad} esqueleto(s) x 10)`);
            return;
        }
        
        jugador.mana -= manaCost;
        io.emit('playerStatsUpdate', { id: socket.id, mana: jugador.mana });
        
        const bonusPorcentaje = cantidad * 0.07;
        const nuevoDamage = Math.floor(CONFIG.SKELETON.ATTACK_DAMAGE * (1 + bonusPorcentaje));
        const bonusDamage = nuevoDamage - CONFIG.SKELETON.ATTACK_DAMAGE;
        
        const esqueletosIds = [];
        esqueletosAliados.forEach(esqueleto => {
            esqueleto.damageBonus = bonusDamage;
            esqueletosIds.push(esqueleto.id);
        });
        
        skillCooldowns[socket.id].furiaNecrotica = now;
        
        io.emit('furiaNecroticaEffect', { 
            playerId: socket.id, 
            duracion: 10,
            esqueletosIds: esqueletosIds,
            bonusPorcentaje: bonusPorcentaje
        });
        
        socket.emit('mensaje', `🔥 Furia Necrótica! ${cantidad} esqueleto(s) potenciados por 10 segundos (+${Math.floor(bonusPorcentaje * 100)}% daño). Maná gastado: ${manaCost}`);
        
        setTimeout(() => {
            const esqueletosAunActivos = esqueletos.filter(e => e.isAlly === true && e.ownerId === socket.id && e.isAlive === true);
            esqueletosAunActivos.forEach(esqueleto => {
                esqueleto.damageBonus = 0;
            });
            socket.emit('mensaje', `⏰ Furia Necrótica terminó. El daño de tus esqueletos volvió a la normalidad`);
            io.emit('furiaNecroticaEnd', { playerId: socket.id });
        }, 10000);
    });
    
    socket.on('talarArbol', (data) => {
        let jugador = players[socket.id];
        if(!jugador || !jugador.isAlive) return;
        let arbol = arboles.find(a => a.activo && getDistance(data.x,data.y,a.x,a.y)<80);
        if(!arbol || arbol.madera<=0) return;
        arbol.madera--;
        if(!jugador.inventario) jugador.inventario = { madera: 0, tela: 10, grasa: 10 };
        jugador.inventario.madera = (jugador.inventario.madera || 0) + 1;
        socket.emit('inventarioActualizado', { madera: jugador.inventario.madera, tela: jugador.inventario.tela, grasa: jugador.inventario.grasa });
        socket.emit('maderaObtenida', { total: jugador.inventario.madera });
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
    });
    
    socket.on('minarMina', (data) => {
        const jugador = players[socket.id];
        if (!jugador || !jugador.isAlive) return;
        let minaCercana = null;
        for (let mina of minas) {
            if (!mina.activo) continue;
            if (getDistance(data.x, data.y, mina.x, mina.y) < 80) {
                minaCercana = mina;
                break;
            }
        }
        if (!minaCercana || minaCercana.minerales <= 0) return;
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
        let roca = rocas.find(r => r.activo && getDistance(data.x,data.y,r.x,r.y)<50);
        if(!roca || jugador.rocas>=CONFIG.ROCAS.MAX_POR_JUGADOR) return;
        jugador.rocas++;
        roca.activo=false;
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
    
    socket.on('obtenerInventario', () => {
        const jugador = players[socket.id];
        if (jugador && jugador.inventario) {
            socket.emit('inventarioActualizado', { madera: jugador.inventario.madera, tela: jugador.inventario.tela, grasa: jugador.inventario.grasa });
        }
    });
    
    socket.on('craftearAntorcha', () => {
        const jugador = players[socket.id];
        if (!jugador || !jugador.inventario) return;
        if (jugador.inventario.madera >= 1 && jugador.inventario.tela >= 1 && jugador.inventario.grasa >= 1) {
            jugador.inventario.madera -= 1;
            jugador.inventario.tela -= 1;
            jugador.inventario.grasa -= 1;
            jugador.tieneAntorcha = true;
            socket.emit('inventarioActualizado', { madera: jugador.inventario.madera, tela: jugador.inventario.tela, grasa: jugador.inventario.grasa });
            socket.emit('crafteoExitoso', { mensaje: 'Antorcha craftada! Presiona T para encender', inventario: jugador.inventario });
        } else {
            socket.emit('crafteoFallido', { mensaje: 'Necesitas: 1 madera + 1 tela + 1 grasa' });
        }
    });
    
    socket.on('encenderAntorcha', () => {
        const jugador = players[socket.id];
        if (!jugador) return;
        if (!jugador.tieneAntorcha) { socket.emit('mensaje', 'No tienes antorcha'); return; }
        if (jugador.antorchaActiva) { socket.emit('mensaje', 'Ya tienes una antorcha encendida'); return; }
        jugador.antorchaActiva = true;
        jugador.tieneAntorcha = false;
        jugador.antorchaTiempo = 300;
        socket.emit('antorchaEncendida', { duracion: 300 });
        setTimeout(() => {
            if (players[socket.id] && players[socket.id].antorchaActiva) {
                players[socket.id].antorchaActiva = false;
                io.to(socket.id).emit('antorchaApagada', { mensaje: 'Tu antorcha se apagó' });
            }
        }, 300000);
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
    
    socket.on('disconnect', () => { 
        const teamId = playerTeam[socket.id];
        if (teamId && teams[teamId]) {
            const team = teams[teamId];
            const indexMiembro = team.miembros.indexOf(socket.id);
            if (indexMiembro !== -1) team.miembros.splice(indexMiembro, 1);
            if (team.miembros.length === 0) {
                delete teams[teamId];
            } else if (team.lider === socket.id) {
                team.lider = team.miembros[0];
                io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `👑 ${players[team.lider]?.name} es el nuevo líder` });
            }
        }
        delete playerTeam[socket.id];
        delete invitacionesPendientes[socket.id];
        delete players[socket.id]; 
        delete inventariosJugadores[socket.id];
        delete recursosJugadores[socket.id];
        delete skillCooldowns[socket.id];
        io.emit('playerDisconnected', socket.id); 
        console.log('Cliente desconectado:', socket.id);
    });
});

// ========== MOVIMIENTO DE DEMONLORD ==========
setInterval(() => {
    if (!demonlord.isAlive) return;
    
    let closestTarget = null;
    let closestDistance = Infinity;
    
    Object.values(players).forEach(player => {
        if (player.isAlive) {
            const dist = getDistance(demonlord.x, demonlord.y, player.x, player.y);
            if (dist < closestDistance) {
                closestDistance = dist;
                closestTarget = player;
            }
        }
    });
    
    esqueletos.forEach(esqueleto => {
        if (esqueleto.isAlive && esqueleto.isAlly === true) {
            const dist = getDistance(demonlord.x, demonlord.y, esqueleto.x, esqueleto.y);
            if (dist < closestDistance) {
                closestDistance = dist;
                closestTarget = esqueleto;
            }
        }
    });
    
    esqueletos.forEach(esqueleto => {
        if (esqueleto.isAlive && esqueleto.isAlly === false) {
            const dist = getDistance(demonlord.x, demonlord.y, esqueleto.x, esqueleto.y);
            if (dist < closestDistance) {
                closestDistance = dist;
                closestTarget = esqueleto;
            }
        }
    });
    
    if (!closestTarget) return;
    
    const dx = closestTarget.x - demonlord.x;
    const dy = closestTarget.y - demonlord.y;
    const distance = Math.hypot(dx, dy);
    
    if (distance < CONFIG.DEMONLORD.VISION_RANGE) {
        if (distance > 70) {
            const moveX = (dx / distance) * CONFIG.DEMONLORD.SPEED;
            const moveY = (dy / distance) * CONFIG.DEMONLORD.SPEED;
            demonlord.x += moveX;
            demonlord.y += moveY;
            
            if (Math.abs(dx) > Math.abs(dy)) {
                demonlord.dir = dx > 0 ? 'Derecha' : 'Izquierda';
            } else {
                demonlord.dir = dy > 0 ? 'Abajo' : 'Arriba';
            }
            io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: true });
        } else {
            io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: false });
        }
        
        if (demonlord.attackCooldown <= 0 && distance < 70) {
            demonlord.attackCooldown = CONFIG.DEMONLORD.ATTACK_COOLDOWN;
            let damage = CONFIG.DEMONLORD.ATTACK_DAMAGE;
            
            closestTarget.hp = Math.max(0, closestTarget.hp - damage);
            io.emit('demonlordAttack', { targetId: closestTarget.id, damage: damage, x: demonlord.x, y: demonlord.y, dir: demonlord.dir });
            io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: damage, hp: demonlord.hp });
            
            if (closestTarget.hp <= 0) {
                if (closestTarget.hasOwnProperty('ownerId') || closestTarget.hasOwnProperty('isAlly')) {
                    closestTarget.isAlive = false;
                    io.emit('esqueletoDeath', { id: closestTarget.id, x: closestTarget.x, y: closestTarget.y, exp: CONFIG.SKELETON.EXP });
                    if (closestTarget.isAlly === true && closestTarget.ownerId) {
                        const owner = players[closestTarget.ownerId];
                        if (owner) {
                            owner.esqueletosSummon = Math.max(0, (owner.esqueletosSummon || 0) - 1);
                        }
                    }
                    setTimeout(() => {
                        const idx = esqueletos.findIndex(e => e.id === closestTarget.id);
                        if (idx !== -1) esqueletos.splice(idx, 1);
                        io.emit('esqueletoDestroy', { id: closestTarget.id });
                    }, 100);
                } else {
                    closestTarget.isAlive = false;
                    io.emit('playerDeath', { id: closestTarget.id, name: closestTarget.name });
                    setTimeout(() => {
                        if (players[closestTarget.id]) {
                            players[closestTarget.id].hp = CONFIG.PLAYER.MAX_HP;
                            players[closestTarget.id].isAlive = true;
                            players[closestTarget.id].x = 512;
                            players[closestTarget.id].y = 512;
                            io.emit('playerRespawn', { id: closestTarget.id, x: 512, y: 512 });
                        }
                    }, CONFIG.PLAYER.RESPAWN_TIME);
                }
            }
        }
    }
    
    if (demonlord.attackCooldown > 0) demonlord.attackCooldown -= 100;
}, 100);

setInterval(() => {
    esqueletos.forEach(esqueleto => {
        if (!esqueleto.isAlive) return;
        
        let closestTarget = null;
        let closestDistance = Infinity;
        
        let nearestDistance = Infinity;
        let nearestTarget = null;
        
        if (esqueleto.isAlly === true) {
            if (demonlord.isAlive) {
                const dist = getDistance(esqueleto.x, esqueleto.y, demonlord.x, demonlord.y);
                if (dist < nearestDistance) {
                    nearestDistance = dist;
                    nearestTarget = demonlord;
                }
            }
            esqueletos.forEach(otherSkeleton => {
                if (!otherSkeleton.isAlive) return;
                if (otherSkeleton.id === esqueleto.id) return;
                if (otherSkeleton.isAlly === false) {
                    const dist = getDistance(esqueleto.x, esqueleto.y, otherSkeleton.x, otherSkeleton.y);
                    if (dist < nearestDistance) {
                        nearestDistance = dist;
                        nearestTarget = otherSkeleton;
                    }
                }
            });
        } else {
            Object.values(players).forEach(player => {
                if (!player.isAlive) return;
                const dist = getDistance(esqueleto.x, esqueleto.y, player.x, player.y);
                if (dist < nearestDistance) {
                    nearestDistance = dist;
                    nearestTarget = player;
                }
            });
            
            if (demonlord.isAlive) {
                const dist = getDistance(esqueleto.x, esqueleto.y, demonlord.x, demonlord.y);
                if (dist < nearestDistance) {
                    nearestDistance = dist;
                    nearestTarget = demonlord;
                }
            }
            
            esqueletos.forEach(otherSkeleton => {
                if (!otherSkeleton.isAlive) return;
                if (otherSkeleton.id === esqueleto.id) return;
                if (otherSkeleton.isAlly === true) {
                    const dist = getDistance(esqueleto.x, esqueleto.y, otherSkeleton.x, otherSkeleton.y);
                    if (dist < nearestDistance) {
                        nearestDistance = dist;
                        nearestTarget = otherSkeleton;
                    }
                }
            });
        }
        
        if (nearestTarget && nearestDistance < CONFIG.SKELETON.VISION_RANGE) {
            closestTarget = nearestTarget;
            closestDistance = nearestDistance;
        }
        
        if (!closestTarget && esqueleto.isAlly === true && esqueleto.ownerId) {
            const owner = players[esqueleto.ownerId];
            if (owner && owner.isAlive) {
                const distToOwner = getDistance(esqueleto.x, esqueleto.y, owner.x, owner.y);
                if (distToOwner > 70) {
                    closestTarget = owner;
                    closestDistance = distToOwner;
                }
            }
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
                
                if (Math.abs(dx) > Math.abs(dy)) {
                    esqueleto.dir = dx > 0 ? 'Derecha' : 'Izquierda';
                } else {
                    esqueleto.dir = dy > 0 ? 'Abajo' : 'Arriba';
                }
                io.emit('esqueletoMoved', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dir: esqueleto.dir, isMoving: true });
            } else {
                io.emit('esqueletoMoved', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dir: esqueleto.dir, isMoving: false });
            }
            
            const isOwner = (esqueleto.isAlly === true && closestTarget === players[esqueleto.ownerId]);
            if (esqueleto.attackCooldown <= 0 && closestDistance < 50 && !isOwner) {
                esqueleto.attackCooldown = CONFIG.SKELETON.ATTACK_COOLDOWN;
                const damage = CONFIG.SKELETON.ATTACK_DAMAGE + (esqueleto.damageBonus || 0);
                
                closestTarget.hp = Math.max(0, closestTarget.hp - damage);
                io.emit('esqueletoAttack', { 
                    id: esqueleto.id,
                    targetId: closestTarget.id, 
                    damage: damage, 
                    x: esqueleto.x, 
                    y: esqueleto.y, 
                    dir: esqueleto.dir 
                });
                
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
                            io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `👹 El Demonlord ha renacido!` });
                        }, CONFIG.DEMONLORD.RESPAWN_TIME);
                    } else if (closestTarget.hasOwnProperty('ownerId')) {
                        const esqueletoAliadoMuerto = closestTarget;
                        esqueletoAliadoMuerto.isAlive = false;
                        io.emit('esqueletoDeath', { id: esqueletoAliadoMuerto.id, x: esqueletoAliadoMuerto.x, y: esqueletoAliadoMuerto.y, exp: 0 });
                        const owner = players[esqueletoAliadoMuerto.ownerId];
                        if (owner) {
                            owner.esqueletosSummon = Math.max(0, (owner.esqueletosSummon || 0) - 1);
                            io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `💀 Tu esqueleto aliado ha muerto. Te quedan ${owner.esqueletosSummon}` });
                        }
                        setTimeout(() => {
                            const idx = esqueletos.findIndex(e => e.id === esqueletoAliadoMuerto.id);
                            if (idx !== -1 && !esqueletos[idx].isAlive && esqueletos[idx].isAlly === true) {
                                esqueletos.splice(idx, 1);
                                io.emit('esqueletoDestroy', { id: esqueletoAliadoMuerto.id });
                            }
                        }, 60000);
                    } else {
                        closestTarget.isAlive = false;
                        io.emit('esqueletoDeath', { id: closestTarget.id, x: closestTarget.x, y: closestTarget.y, exp: CONFIG.SKELETON.EXP });
                        respawnEsqueleto(closestTarget.id);
                    }
                }
                io.emit('enemyDamaged', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dmg: damage, hp: esqueleto.hp });
            }
        } else {
            io.emit('esqueletoMoved', { id: esqueleto.id, x: esqueleto.x, y: esqueleto.y, dir: esqueleto.dir, isMoving: false });
        }
        
        if (esqueleto.attackCooldown > 0) esqueleto.attackCooldown -= 100;
    });
}, 150);

setInterval(() => {
    if (demonlord.isAlive && Math.random() < 0.3) {
        io.emit('demonlordAtkVisual', { dir: demonlord.dir, esFuerte: Math.random() < 0.3 });
    }
}, 2000);

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 DEVILAND - Servidor en puerto ${PORT}`);
});