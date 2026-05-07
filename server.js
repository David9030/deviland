// ========== MOVIMIENTO DE DEMONLORD ==========
setInterval(() => {
    if (!demonlord.isAlive) return;
    
    let closestTarget = null;
    let closestDistance = Infinity;
    
    // Buscar jugadores vivos
    Object.values(players).forEach(player => {
        if (player.isAlive) {
            const dist = getDistance(demonlord.x, demonlord.y, player.x, player.y);
            if (dist < closestDistance) {
                closestDistance = dist;
                closestTarget = player;
            }
        }
    });
    
    // Buscar ESQUELETOS ALIADOS
    esqueletos.forEach(esqueleto => {
        if (esqueleto.isAlive && esqueleto.isAlly === true) {
            const dist = getDistance(demonlord.x, demonlord.y, esqueleto.x, esqueleto.y);
            if (dist < closestDistance) {
                closestDistance = dist;
                closestTarget = esqueleto;
            }
        }
    });
    
    // Buscar ESQUELETOS ENEMIGOS
    esqueletos.forEach(esqueleto => {
        if (esqueleto.isAlive && esqueleto.isAlly === false) {
            const dist = getDistance(demonlord.x, demonlord.y, esqueleto.x, esqueleto.y);
            if (dist < closestDistance) {
                closestDistance = dist;
                closestTarget = esqueleto;
            }
        }
    });
    
    // Si no hay objetivo, no hacer nada
    if (!closestTarget) return;
    
    // Calcular movimiento hacia el objetivo
    const dx = closestTarget.x - demonlord.x;
    const dy = closestTarget.y - demonlord.y;
    const distance = Math.hypot(dx, dy);
    
    // Si está dentro del rango de visión
    if (distance < CONFIG.DEMONLORD.VISION_RANGE) {
        
        // Movimiento hacia el objetivo
        if (distance > 70) {
            const moveX = (dx / distance) * CONFIG.DEMONLORD.SPEED;
            const moveY = (dy / distance) * CONFIG.DEMONLORD.SPEED;
            demonlord.x += moveX;
            demonlord.y += moveY;
            
            // Dirección de la animación
            if (Math.abs(dx) > Math.abs(dy)) {
                demonlord.dir = dx > 0 ? 'Derecha' : 'Izquierda';
            } else {
                demonlord.dir = dy > 0 ? 'Abajo' : 'Arriba';
            }
            io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: true });
        } else {
            io.emit('demonlordMoved', { x: demonlord.x, y: demonlord.y, dir: demonlord.dir, isMoving: false });
        }
        
        // Ataque
        if (demonlord.attackCooldown <= 0 && distance < 70) {
            demonlord.attackCooldown = CONFIG.DEMONLORD.ATTACK_COOLDOWN;
            let damage = CONFIG.DEMONLORD.ATTACK_DAMAGE;
            
            // Aplicar daño
            closestTarget.hp = Math.max(0, closestTarget.hp - damage);
            io.emit('demonlordAttack', { targetId: closestTarget.id, damage: damage, x: demonlord.x, y: demonlord.y, dir: demonlord.dir });
            io.emit('enemyDamaged', { id: 'demonlord', x: demonlord.x, y: demonlord.y, dmg: damage, hp: demonlord.hp });
            
            // Si el objetivo murió
            if (closestTarget.hp <= 0) {
                // Si es un esqueleto (aliado o enemigo)
                if (closestTarget.hasOwnProperty('ownerId') || closestTarget.hasOwnProperty('isAlly')) {
                    closestTarget.isAlive = false;
                    io.emit('esqueletoDeath', { id: closestTarget.id, x: closestTarget.x, y: closestTarget.y, exp: CONFIG.SKELETON.EXP });
                    
                    // Si era aliado, notificar al dueño
                    if (closestTarget.isAlly === true && closestTarget.ownerId) {
                        const owner = players[closestTarget.ownerId];
                        if (owner) {
                            owner.esqueletosSummon = Math.max(0, (owner.esqueletosSummon || 0) - 1);
                            io.emit('chatMessage', { type: 'system', name: 'Sistema', msg: `💀 Tu esqueleto aliado ha muerto por el Demonlord` });
                        }
                    }
                    
                    setTimeout(() => {
                        const idx = esqueletos.findIndex(e => e.id === closestTarget.id);
                        if (idx !== -1) esqueletos.splice(idx, 1);
                        io.emit('esqueletoDestroy', { id: closestTarget.id });
                    }, 100);
                } 
                // Si es un jugador
                else {
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