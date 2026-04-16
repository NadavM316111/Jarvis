
// ==================== GAME DATA ====================
const CREATURES = {
    ember: { name: 'Ember', type: 'fire', sprite: '\u{1F525}', baseHp: 30, atk: 12, def: 8, moves: ['Flame Burst', 'Tackle', 'Fire Spin', 'Ember Strike'] },
    splash: { name: 'Splash', type: 'water', sprite: '\u{1F4A7}', baseHp: 32, atk: 10, def: 10, moves: ['Water Gun', 'Tackle', 'Bubble Beam', 'Aqua Jet'] },
    sprout: { name: 'Sprout', type: 'grass', sprite: '\u{1F33F}', baseHp: 34, atk: 8, def: 12, moves: ['Vine Whip', 'Tackle', 'Leaf Storm', 'Solar Beam'] },
    // Wild creatures
    ratling: { name: 'Ratling', type: 'normal', sprite: '\u{1F400}', baseHp: 18, atk: 7, def: 5, moves: ['Bite', 'Scratch'] },
    zapper: { name: 'Zapper', type: 'electric', sprite: '\u{26A1}', baseHp: 20, atk: 9, def: 4, moves: ['Spark', 'Quick Attack'] },
    puffling: { name: 'Puffling', type: 'normal', sprite: '\u{1F43E}', baseHp: 22, atk: 6, def: 7, moves: ['Tackle', 'Fluffy Shield'] },
    stoneling: { name: 'Stoneling', type: 'rock', sprite: '\u{1FAA8}', baseHp: 28, atk: 8, def: 12, moves: ['Rock Throw', 'Harden'] },
    flutterwing: { name: 'Flutterwing', type: 'flying', sprite: '\u{1F98B}', baseHp: 20, atk: 8, def: 5, moves: ['Gust', 'Wing Attack'] }
};

const MOVES = {
    'Flame Burst': { power: 15, type: 'fire', accuracy: 95 },
    'Tackle': { power: 10, type: 'normal', accuracy: 100 },
    'Fire Spin': { power: 12, type: 'fire', accuracy: 85 },
    'Ember Strike': { power: 18, type: 'fire', accuracy: 80 },
    'Water Gun': { power: 14, type: 'water', accuracy: 100 },
    'Bubble Beam': { power: 16, type: 'water', accuracy: 90 },
    'Aqua Jet': { power: 12, type: 'water', accuracy: 100 },
    'Vine Whip': { power: 13, type: 'grass', accuracy: 100 },
    'Leaf Storm': { power: 18, type: 'grass', accuracy: 85 },
    'Solar Beam': { power: 22, type: 'grass', accuracy: 75 },
    'Bite': { power: 12, type: 'normal', accuracy: 95 },
    'Scratch': { power: 8, type: 'normal', accuracy: 100 },
    'Spark': { power: 14, type: 'electric', accuracy: 90 },
    'Quick Attack': { power: 10, type: 'normal', accuracy: 100 },
    'Fluffy Shield': { power: 0, type: 'normal', accuracy: 100, effect: 'defense' },
    'Rock Throw': { power: 15, type: 'rock', accuracy: 85 },
    'Harden': { power: 0, type: 'rock', accuracy: 100, effect: 'defense' },
    'Gust': { power: 12, type: 'flying', accuracy: 95 },
    'Wing Attack': { power: 14, type: 'flying', accuracy: 90 }
};

const TYPE_CHART = {
    fire: { grass: 2, water: 0.5, fire: 0.5 },
    water: { fire: 2, grass: 0.5, water: 0.5 },
    grass: { water: 2, fire: 0.5, grass: 0.5 },
    electric: { water: 2, flying: 2, rock: 0.5 },
    rock: { fire: 2, flying: 2, electric: 0.5 },
    flying: { grass: 2, rock: 0.5 },
    normal: {}
};

const WILD_CREATURES = ['ratling', 'zapper', 'puffling', 'stoneling', 'flutterwing'];

// ==================== GAME STATE ====================
let gameState = {
    started: false,
    inBattle: false,
    inDialog: false,
    inShop: false,
    player: null,
    gold: 100,
    inventory: { potion: 2 },
    playerCreature: null,
    enemyCreature: null,
    battleTurn: 'player',
    defending: false
};

// ==================== THREE.JS SETUP ====================
let scene, camera, renderer, clock;
let playerMesh, playerPosition = { x: 0, z: 0 };
let moveDirection = { x: 0, z: 0 };
const MOVE_SPEED = 0.08;
let keys = {};

// World objects
let grassPatches = [];
let buildings = [];
let npcs = [];
let encounterCooldown = 0;

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 12, 12);
    camera.lookAt(0, 0, 0);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('game-container').insertBefore(renderer.domElement, document.getElementById('ui-overlay'));
    
    clock = new THREE.Clock();
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    createWorld();
    createPlayer();
    
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
}

function createWorld() {
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x7cba5f });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Grass patches (encounter zones)
    const grassMaterial = new THREE.MeshLambertMaterial({ color: 0x4a8f3c });
    const grassPositions = [
        { x: -15, z: -10, w: 12, h: 10 },
        { x: 15, z: 5, w: 10, h: 12 },
        { x: -8, z: 15, w: 14, h: 8 },
        { x: 20, z: -15, w: 10, h: 10 }
    ];
    
    grassPositions.forEach(pos => {
        const grassGeom = new THREE.BoxGeometry(pos.w, 0.3, pos.h);
        const grass = new THREE.Mesh(grassGeom, grassMaterial);
        grass.position.set(pos.x, 0.15, pos.z);
        grass.receiveShadow = true;
        scene.add(grass);
        
        // Add tall grass indicators
        for (let i = 0; i < 20; i++) {
            const bladeGeom = new THREE.ConeGeometry(0.15, 0.8, 4);
            const blade = new THREE.Mesh(bladeGeom, new THREE.MeshLambertMaterial({ color: 0x3d7a32 }));
            blade.position.set(
                pos.x + (Math.random() - 0.5) * pos.w,
                0.4,
                pos.z + (Math.random() - 0.5) * pos.h
            );
            scene.add(blade);
        }
        
        grassPatches.push({ ...pos, mesh: grass });
    });
    
    // Town buildings
    createBuilding(-5, -20, 6, 4, 5, 0x8b4513, 'house');  // House
    createBuilding(5, -22, 5, 5, 4, 0x4169e1, 'shop');    // Shop
    createBuilding(0, -28, 8, 6, 6, 0x708090, 'center');  // Pokemon Center style
    
    // Paths
    const pathMaterial = new THREE.MeshLambertMaterial({ color: 0xc4a35a });
    const path1 = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 30), pathMaterial);
    path1.position.set(0, 0.05, -10);
    scene.add(path1);
    
    const path2 = new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 4), pathMaterial);
    path2.position.set(0, 0.05, -22);
    scene.add(path2);
    
    // Trees for decoration
    for (let i = 0; i < 15; i++) {
        createTree(
            (Math.random() - 0.5) * 60,
            (Math.random() - 0.5) * 60
        );
    }
    
    // NPCs
    createNPC(3, -18, 0x9932cc, 'Professor Oak', [
        "Welcome to the world of Creatures!",
        "Walk through the tall grass to find wild creatures.",
        "Battle them to gain experience and level up!",
        "Good luck on your adventure!"
    ]);
    
    createNPC(5, -20, 0xffd700, 'Shopkeeper', [
        "Welcome to my shop!",
        "I have potions and boosts for sale."
    ], true);
}

function createBuilding(x, z, width, depth, height, color, type) {
    const buildingGeom = new THREE.BoxGeometry(width, height, depth);
    const buildingMat = new THREE.MeshLambertMaterial({ color: color });
    const building = new THREE.Mesh(buildingGeom, buildingMat);
    building.position.set(x, height / 2, z);
    building.castShadow = true;
    scene.add(building);
    
    // Roof
    const roofGeom = new THREE.ConeGeometry(Math.max(width, depth) * 0.7, 2, 4);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x8b0000 });
    const roof = new THREE.Mesh(roofGeom, roofMat);
    roof.position.set(x, height + 1, z);
    roof.rotation.y = Math.PI / 4;
    scene.add(roof);
    
    // Door
    const doorGeom = new THREE.BoxGeometry(1.2, 2, 0.1);
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x4a2c0a });
    const door = new THREE.Mesh(doorGeom, doorMat);
    door.position.set(x, 1, z + depth / 2 + 0.05);
    scene.add(door);
    
    buildings.push({ x, z, width, depth, height, type, mesh: building });
}

function createTree(x, z) {
    // Check not overlapping with buildings or paths
    const tooClose = buildings.some(b => 
        Math.abs(x - b.x) < b.width + 2 && Math.abs(z - b.z) < b.depth + 2
    );
    if (tooClose || (Math.abs(x) < 3 && z < 0 && z > -30)) return;
    
    const trunkGeom = new THREE.CylinderGeometry(0.3, 0.4, 2, 8);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a2c0a });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.set(x, 1, z);
    scene.add(trunk);
    
    const leavesGeom = new THREE.SphereGeometry(1.5, 8, 8);
    const leavesMat = new THREE.MeshLambertMaterial({ color: 0x228b22 });
    const leaves = new THREE.Mesh(leavesGeom, leavesMat);
    leaves.position.set(x, 3, z);
    scene.add(leaves);
}

function createNPC(x, z, color, name, dialog, isShopkeeper = false) {
    const bodyGeom = new THREE.CylinderGeometry(0.4, 0.5, 1.5, 8);
    const bodyMat = new THREE.MeshLambertMaterial({ color: color });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.set(x, 0.75, z);
    scene.add(body);
    
    const headGeom = new THREE.SphereGeometry(0.4, 8, 8);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.set(x, 1.8, z);
    scene.add(head);
    
    npcs.push({ x, z, name, dialog, isShopkeeper, body, head });
}

function createPlayer() {
    // Player body
    const bodyGeom = new THREE.CylinderGeometry(0.35, 0.45, 1.2, 8);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2196f3 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.6;
    
    // Player head
    const headGeom = new THREE.SphereGeometry(0.35, 8, 8);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 1.5;
    
    // Cap
    const capGeom = new THREE.CylinderGeometry(0.38, 0.38, 0.15, 8);
    const capMat = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    const cap = new THREE.Mesh(capGeom, capMat);
    cap.position.y = 1.75;
    
    playerMesh = new THREE.Group();
    playerMesh.add(body);
    playerMesh.add(head);
    playerMesh.add(cap);
    playerMesh.castShadow = true;
    scene.add(playerMesh);
}

// ==================== CONTROLS ====================
function onKeyDown(e) {
    keys[e.key.toLowerCase()] = true;
    
    if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (gameState.inDialog) {
            advanceDialog();
        } else if (!gameState.inBattle && !gameState.inShop) {
            checkNPCInteraction();
        }
    }
    
    if (e.key.toLowerCase() === 'i' && gameState.started && !gameState.inBattle) {
        toggleInventory();
    }
}

function onKeyUp(e) {
    keys[e.key.toLowerCase()] = false;
}

function updatePlayerMovement() {
    if (gameState.inBattle || gameState.inDialog || gameState.inShop || !gameState.started) return;
    
    moveDirection.x = 0;
    moveDirection.z = 0;
    
    if (keys['w'] || keys['arrowup']) moveDirection.z = -1;
    if (keys['s'] || keys['arrowdown']) moveDirection.z = 1;
    if (keys['a'] || keys['arrowleft']) moveDirection.x = -1;
    if (keys['d'] || keys['arrowright']) moveDirection.x = 1;
    
    if (moveDirection.x !== 0 || moveDirection.z !== 0) {
        const newX = playerPosition.x + moveDirection.x * MOVE_SPEED;
        const newZ = playerPosition.z + moveDirection.z * MOVE_SPEED;
        
        // Collision check with buildings
        let canMove = true;
        buildings.forEach(b => {
            if (newX > b.x - b.width/2 - 0.5 && newX < b.x + b.width/2 + 0.5 &&
                newZ > b.z - b.depth/2 - 0.5 && newZ < b.z + b.depth/2 + 0.5) {
                canMove = false;
            }
        });
        
        // Boundary check
        if (Math.abs(newX) > 45 || Math.abs(newZ) > 45) canMove = false;
        
        if (canMove) {
            playerPosition.x = newX;
            playerPosition.z = newZ;
            playerMesh.position.x = playerPosition.x;
            playerMesh.position.z = playerPosition.z;
            
            // Rotate player to face movement direction
            if (moveDirection.x !== 0 || moveDirection.z !== 0) {
                playerMesh.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);
            }
            
            // Check for grass encounter
            checkGrassEncounter();
        }
    }
    
    // Update camera to follow player
    camera.position.x = playerPosition.x;
    camera.position.z = playerPosition.z + 12;
    camera.lookAt(playerPosition.x, 0, playerPosition.z);
}

function checkGrassEncounter() {
    if (encounterCooldown > 0) {
        encounterCooldown--;
        return;
    }
    
    const inGrass = grassPatches.some(g => 
        playerPosition.x > g.x - g.w/2 && playerPosition.x < g.x + g.w/2 &&
        playerPosition.z > g.z - g.h/2 && playerPosition.z < g.z + g.h/2
    );
    
    if (inGrass && Math.random() < 0.02) {
        startWildEncounter();
        encounterCooldown = 60; // Cooldown after battle
    }
}

function checkNPCInteraction() {
    npcs.forEach(npc => {
        const dist = Math.sqrt(
            Math.pow(playerPosition.x - npc.x, 2) + 
            Math.pow(playerPosition.z - npc.z, 2)
        );
        if (dist < 2) {
            if (npc.isShopkeeper) {
                openShop();
            } else {
                startDialog(npc.name, npc.dialog);
            }
        }
    });
}

// ==================== DIALOG SYSTEM ====================
let currentDialog = { speaker: '', lines: [], index: 0 };

function startDialog(speaker, lines) {
    gameState.inDialog = true;
    currentDialog = { speaker, lines, index: 0 };
    showDialogLine();
}

function showDialogLine() {
    const box = document.getElementById('dialog-box');
    box.style.display = 'block';
    box.querySelector('.speaker').textContent = currentDialog.speaker;
    box.querySelector('.text').textContent = currentDialog.lines[currentDialog.index];
}

function advanceDialog() {
    currentDialog.index++;
    if (currentDialog.index >= currentDialog.lines.length) {
        document.getElementById('dialog-box').style.display = 'none';
        gameState.inDialog = false;
    } else {
        showDialogLine();
    }
}

// ==================== SHOP SYSTEM ====================
function openShop() {
    gameState.inShop = true;
    document.getElementById('shop-screen').style.display = 'block';
    updateShopButtons();
}

function closeShop() {
    gameState.inShop = false;
    document.getElementById('shop-screen').style.display = 'none';
}

function buyItem(item, cost) {
    if (gameState.gold >= cost) {
        gameState.gold -= cost;
        gameState.inventory[item] = (gameState.inventory[item] || 0) + 1;
        updateGoldDisplay();
        updateShopButtons();
    }
}

function updateShopButtons() {
    document.querySelectorAll('.shop-item .buy-btn').forEach(btn => {
        const cost = parseInt(btn.textContent);
        btn.disabled = gameState.gold < cost;
    });
}

function toggleInventory() {
    const screen = document.getElementById('inventory-screen');
    const isVisible = screen.style.display === 'block';
    screen.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
        const list = document.getElementById('inventory-list');
        const items = Object.entries(gameState.inventory).filter(([k, v]) => v > 0);
        
        if (items.length === 0) {
            list.innerHTML = '<div class="inventory-empty">Your bag is empty!</div>';
        } else {
            list.innerHTML = items.map(([item, count]) => {
                const names = {
                    potion: 'Potion',
                    superPotion: 'Super Potion',
                    atkBoost: 'Attack Boost'
                };
                return '<div class="inventory-item"><span>' + (names[item] || item) + '</span><span>x' + count + '</span></div>';
            }).join('');
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Continue in next part...


// ==================== BATTLE SYSTEM ====================
function startWildEncounter() {
    // Pick random wild creature
    const wildType = WILD_CREATURES[Math.floor(Math.random() * WILD_CREATURES.length)];
    const wildBase = CREATURES[wildType];
    
    // Level scales with player level
    const playerLevel = gameState.playerCreature.level;
    const wildLevel = Math.max(1, playerLevel + Math.floor(Math.random() * 5) - 2);
    
    gameState.enemyCreature = {
        ...wildBase,
        level: wildLevel,
        maxHp: Math.floor(wildBase.baseHp * (1 + wildLevel * 0.1)),
        currentHp: Math.floor(wildBase.baseHp * (1 + wildLevel * 0.1)),
        atk: Math.floor(wildBase.atk * (1 + wildLevel * 0.08)),
        def: Math.floor(wildBase.def * (1 + wildLevel * 0.08))
    };
    
    gameState.inBattle = true;
    gameState.battleTurn = 'player';
    gameState.defending = false;
    
    // Update battle UI
    document.getElementById('battle-screen').style.display = 'block';
    document.getElementById('player-battle-sprite').textContent = gameState.playerCreature.sprite;
    document.getElementById('player-battle-name').textContent = gameState.playerCreature.name;
    document.getElementById('player-battle-level').textContent = 'Lv.' + gameState.playerCreature.level;
    updateBattleHP('player');
    
    document.getElementById('enemy-battle-sprite').textContent = gameState.enemyCreature.sprite;
    document.getElementById('enemy-battle-name').textContent = gameState.enemyCreature.name;
    document.getElementById('enemy-battle-level').textContent = 'Lv.' + gameState.enemyCreature.level;
    updateBattleHP('enemy');
    
    setBattleMessage('A wild ' + gameState.enemyCreature.name + ' appeared!');
    showBattleActions();
}

function updateBattleHP(who) {
    const creature = who === 'player' ? gameState.playerCreature : gameState.enemyCreature;
    const percent = Math.max(0, (creature.currentHp / creature.maxHp) * 100);
    document.getElementById(who + '-battle-hp').style.width = percent + '%';
    
    // Color based on HP
    const hpBar = document.getElementById(who + '-battle-hp');
    if (percent > 50) hpBar.style.background = '#4caf50';
    else if (percent > 25) hpBar.style.background = '#ff9800';
    else hpBar.style.background = '#f44336';
}

function setBattleMessage(msg) {
    document.getElementById('battle-message').textContent = msg;
}

function showBattleActions() {
    document.getElementById('battle-actions').style.display = 'grid';
    document.getElementById('moves-menu').classList.remove('active');
}

function showMoves() {
    document.getElementById('battle-actions').style.display = 'none';
    const movesMenu = document.getElementById('moves-menu');
    movesMenu.classList.add('active');
    
    const moves = gameState.playerCreature.moves;
    movesMenu.innerHTML = moves.map(move => {
        const moveData = MOVES[move];
        return '<button class="move-btn" onclick="useMove(\'' + move + '\')">' +
            '<div class="move-name">' + move + '</div>' +
            '<div class="move-info">' + (moveData.power > 0 ? 'Power: ' + moveData.power : 'Status') + ' | ' + moveData.type + '</div>' +
        '</button>';
    }).join('') + '<button class="move-btn" onclick="showBattleActions()"><div class="move-name">Back</div></button>';
}

function useMove(moveName) {
    if (gameState.battleTurn !== 'player') return;
    
    const move = MOVES[moveName];
    const attacker = gameState.playerCreature;
    const defender = gameState.enemyCreature;
    
    // Accuracy check
    if (Math.random() * 100 > move.accuracy) {
        setBattleMessage(attacker.name + ' used ' + moveName + ' but missed!');
    } else if (move.effect === 'defense') {
        gameState.defending = true;
        setBattleMessage(attacker.name + ' is preparing to defend!');
    } else {
        // Calculate damage
        const typeBonus = TYPE_CHART[move.type]?.[defender.type] || 1;
        let damage = Math.floor((move.power * (attacker.atk / defender.def) * typeBonus * (0.85 + Math.random() * 0.15)));
        damage = Math.max(1, damage);
        
        defender.currentHp -= damage;
        updateBattleHP('enemy');
        
        let msg = attacker.name + ' used ' + moveName + '! ';
        if (typeBonus > 1) msg += "It's super effective! ";
        else if (typeBonus < 1) msg += "It's not very effective... ";
        msg += '(-' + damage + ' HP)';
        setBattleMessage(msg);
    }
    
    document.getElementById('moves-menu').classList.remove('active');
    document.getElementById('battle-actions').style.display = 'none';
    
    // Check if enemy fainted
    setTimeout(() => {
        if (gameState.enemyCreature.currentHp <= 0) {
            endBattle(true);
        } else {
            gameState.battleTurn = 'enemy';
            setTimeout(enemyTurn, 1000);
        }
    }, 1500);
}

function enemyTurn() {
    const attacker = gameState.enemyCreature;
    const defender = gameState.playerCreature;
    
    // Pick random move
    const moveName = attacker.moves[Math.floor(Math.random() * attacker.moves.length)];
    const move = MOVES[moveName];
    
    if (Math.random() * 100 > move.accuracy) {
        setBattleMessage(attacker.name + ' used ' + moveName + ' but missed!');
    } else if (move.effect === 'defense') {
        setBattleMessage(attacker.name + ' is defending!');
    } else {
        const typeBonus = TYPE_CHART[move.type]?.[defender.type] || 1;
        let damage = Math.floor((move.power * (attacker.atk / defender.def) * typeBonus * (0.85 + Math.random() * 0.15)));
        
        // Apply defense bonus
        if (gameState.defending) {
            damage = Math.floor(damage * 0.5);
            gameState.defending = false;
        }
        
        damage = Math.max(1, damage);
        defender.currentHp -= damage;
        updateBattleHP('player');
        updateHUD();
        
        let msg = attacker.name + ' used ' + moveName + '! (-' + damage + ' HP)';
        setBattleMessage(msg);
    }
    
    setTimeout(() => {
        if (gameState.playerCreature.currentHp <= 0) {
            endBattle(false);
        } else {
            gameState.battleTurn = 'player';
            showBattleActions();
        }
    }, 1500);
}

function useItem() {
    if (gameState.inventory.potion > 0) {
        gameState.inventory.potion--;
        const heal = 20;
        gameState.playerCreature.currentHp = Math.min(
            gameState.playerCreature.maxHp,
            gameState.playerCreature.currentHp + heal
        );
        updateBattleHP('player');
        updateHUD();
        setBattleMessage('Used Potion! Restored ' + heal + ' HP.');
        
        document.getElementById('battle-actions').style.display = 'none';
        setTimeout(() => {
            gameState.battleTurn = 'enemy';
            setTimeout(enemyTurn, 1000);
        }, 1500);
    } else if (gameState.inventory.superPotion > 0) {
        gameState.inventory.superPotion--;
        const heal = 50;
        gameState.playerCreature.currentHp = Math.min(
            gameState.playerCreature.maxHp,
            gameState.playerCreature.currentHp + heal
        );
        updateBattleHP('player');
        updateHUD();
        setBattleMessage('Used Super Potion! Restored ' + heal + ' HP.');
        
        document.getElementById('battle-actions').style.display = 'none';
        setTimeout(() => {
            gameState.battleTurn = 'enemy';
            setTimeout(enemyTurn, 1000);
        }, 1500);
    } else {
        setBattleMessage('No healing items in your bag!');
    }
}

function attemptRun() {
    const escapeChance = 0.5 + (gameState.playerCreature.level - gameState.enemyCreature.level) * 0.1;
    
    if (Math.random() < escapeChance) {
        setBattleMessage('Got away safely!');
        setTimeout(() => {
            document.getElementById('battle-screen').style.display = 'none';
            gameState.inBattle = false;
            encounterCooldown = 120;
        }, 1500);
    } else {
        setBattleMessage("Couldn't escape!");
        document.getElementById('battle-actions').style.display = 'none';
        setTimeout(() => {
            gameState.battleTurn = 'enemy';
            setTimeout(enemyTurn, 1000);
        }, 1500);
    }
}

function defendAction() {
    gameState.defending = true;
    setBattleMessage(gameState.playerCreature.name + ' braces for impact!');
    document.getElementById('battle-actions').style.display = 'none';
    
    setTimeout(() => {
        gameState.battleTurn = 'enemy';
        setTimeout(enemyTurn, 1000);
    }, 1000);
}

function endBattle(victory) {
    if (victory) {
        // Calculate EXP
        const expGain = Math.floor(gameState.enemyCreature.level * 15 + Math.random() * 10);
        const goldGain = Math.floor(gameState.enemyCreature.level * 8 + Math.random() * 5);
        
        gameState.playerCreature.exp += expGain;
        gameState.gold += goldGain;
        
        setBattleMessage('Victory! Gained ' + expGain + ' EXP and ' + goldGain + ' gold!');
        
        // Check level up
        const expNeeded = gameState.playerCreature.level * 25;
        if (gameState.playerCreature.exp >= expNeeded) {
            setTimeout(() => levelUp(), 2000);
        } else {
            setTimeout(closeBattle, 3000);
        }
    } else {
        setBattleMessage(gameState.playerCreature.name + ' fainted! You blacked out...');
        setTimeout(() => {
            // Restore HP and teleport to town
            gameState.playerCreature.currentHp = Math.floor(gameState.playerCreature.maxHp * 0.5);
            playerPosition.x = 0;
            playerPosition.z = -15;
            playerMesh.position.x = 0;
            playerMesh.position.z = -15;
            closeBattle();
            updateHUD();
        }, 3000);
    }
}

function levelUp() {
    gameState.playerCreature.level++;
    gameState.playerCreature.exp = 0;
    
    // Increase stats
    const hpIncrease = Math.floor(5 + Math.random() * 3);
    const atkIncrease = Math.floor(2 + Math.random() * 2);
    const defIncrease = Math.floor(2 + Math.random() * 2);
    
    gameState.playerCreature.maxHp += hpIncrease;
    gameState.playerCreature.currentHp = gameState.playerCreature.maxHp;
    gameState.playerCreature.atk += atkIncrease;
    gameState.playerCreature.def += defIncrease;
    
    setBattleMessage('LEVEL UP! ' + gameState.playerCreature.name + ' is now level ' + gameState.playerCreature.level + '!');
    
    setTimeout(closeBattle, 3000);
}

function closeBattle() {
    document.getElementById('battle-screen').style.display = 'none';
    gameState.inBattle = false;
    encounterCooldown = 60;
    updateHUD();
    updateGoldDisplay();
}

// ==================== UI UPDATES ====================
function updateHUD() {
    const c = gameState.playerCreature;
    document.getElementById('hud-name').textContent = c.name;
    document.getElementById('hud-level').textContent = 'Lv. ' + c.level;
    
    const hpPercent = (c.currentHp / c.maxHp) * 100;
    const hpBar = document.getElementById('hud-hp');
    hpBar.style.width = hpPercent + '%';
    hpBar.className = 'hp-bar';
    if (hpPercent < 25) hpBar.classList.add('low');
    else if (hpPercent < 50) hpBar.classList.add('medium');
    
    document.getElementById('hud-hp-text').textContent = c.currentHp + '/' + c.maxHp;
    
    const expPercent = (c.exp / (c.level * 25)) * 100;
    document.getElementById('hud-exp').style.width = expPercent + '%';
}

function updateGoldDisplay() {
    document.getElementById('gold-display').textContent = gameState.gold + ' Gold';
}

// ==================== STARTER SELECTION ====================
function selectStarter(choice) {
    const base = CREATURES[choice];
    
    gameState.playerCreature = {
        ...base,
        level: 5,
        exp: 0,
        maxHp: Math.floor(base.baseHp * 1.5),
        currentHp: Math.floor(base.baseHp * 1.5),
        atk: Math.floor(base.atk * 1.4),
        def: Math.floor(base.def * 1.4)
    };
    
    gameState.started = true;
    
    // Hide starter screen, show HUD
    document.getElementById('starter-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('gold-display').style.display = 'block';
    document.getElementById('inventory-btn').style.display = 'block';
    document.getElementById('controls-hint').style.display = 'block';
    
    updateHUD();
    updateGoldDisplay();
    
    // Welcome dialog
    setTimeout(() => {
        startDialog('Professor Oak', [
            'Excellent choice! ' + base.name + ' will be a great partner.',
            'Walk into the tall grass patches to find wild creatures.',
            'Press SPACE near NPCs to talk to them.',
            'Good luck, trainer!'
        ]);
    }, 500);
}

// ==================== GAME LOOP ====================
function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    
    updatePlayerMovement();
    
    // Animate NPCs (subtle bobbing)
    npcs.forEach((npc, i) => {
        npc.head.position.y = 1.8 + Math.sin(Date.now() / 500 + i) * 0.05;
    });
    
    renderer.render(scene, camera);
}

// ==================== INIT ====================
initThreeJS();
animate();
