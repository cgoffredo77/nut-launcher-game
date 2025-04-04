import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

class SoundManager {
    constructor() {
        this.sounds = {};
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.loadSounds();
    }

    async loadSounds() {
        // Launch sound
        this.sounds.launch = this.createOscillatorSound(400, 0.1);
        
        // Hit sound
        this.sounds.hit = this.createOscillatorSound(200, 0.1);
        
        // Death sound
        this.sounds.death = this.createOscillatorSound(100, 0.2);
        
        // Movement sound
        this.sounds.movement = this.createOscillatorSound(800, 0.05);
    }

    createOscillatorSound(frequency, duration) {
        return () => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            
            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + duration);
        };
    }

    playSound(soundName) {
        if (this.sounds[soundName]) {
            this.sounds[soundName]();
        }
    }
}

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        // Initialize renderer with proper settings
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Create crosshair
        this.createCrosshair();

        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize(), false);

        // Controls
        this.controls = new PointerLockControls(this.camera, document.body);
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canJump = false;
        this.isSprinting = false;

        // Stamina system
        this.maxStamina = 100;
        this.stamina = this.maxStamina;
        this.staminaRegenRate = 10; // points per second
        this.staminaDrainRate = 20; // points per second
        this.sprintMultiplier = 1.8; // how much faster sprinting is
        this.canSprint = true;
        this.staminaLockoutThreshold = 10; // stamina must recover above this to sprint again

        // Game state
        this.level = 1;
        this.maxLevel = 5;
        this.levelData = {
            1: { squirrels: 15, speed: 0.022, spawnInterval: 2, scoreToNext: 100, attackRange: 10, attackDamage: 5, attackSpeed: 2 },
            2: { squirrels: 30, speed: 0.028, spawnInterval: 1.5, scoreToNext: 200, attackRange: 12, attackDamage: 8, attackSpeed: 1.8 },
            3: { 
                isBossLevel: true,
                bossHealth: 1000,
                bossSpeed: 0.015,
                bossAttackDamage: 20,
                bossAttackSpeed: 3,
                minionCount: 5,
                minionSpawnInterval: 5,
                speed: 0.035,
                attackRange: 15,
                attackDamage: 10,
                attackSpeed: 1.5
            },
            4: { squirrels: 80, speed: 0.04, spawnInterval: 1, scoreToNext: 400, attackRange: 18, attackDamage: 12, attackSpeed: 1.2 },
            5: { squirrels: 120, speed: 0.045, spawnInterval: 0.8, scoreToNext: 500, attackRange: 20, attackDamage: 15, attackSpeed: 1 }
        };
        this.score = 0;
        this.levelScore = 0;
        this.isLevelComplete = false;
        this.currentNutType = 'normal';
        this.nutTypes = {
            normal: { damage: 1, speed: 3, color: 0x8B4513 },
            explosive: { damage: 2, speed: 2, color: 0xFF0000, radius: 5 },
            rapid: { damage: 0.5, speed: 5, color: 0xFFFF00, cooldown: 0.1 }
        };
        this.powerUps = [];
        this.healthPowerUps = [];
        this.shieldPowerUps = [];
        this.lastPowerUpTime = 0;
        this.lastHealthPowerUpTime = 0;
        this.lastShieldPowerUpTime = 0;
        this.powerUpInterval = 15;
        this.healthPowerUpInterval = 25; // Health powerups spawn less frequently
        this.shieldPowerUpInterval = 40; // Shield powerups are rare
        this.healthPowerUpAmount = 10; // Each health powerup gives 10 health (reduced from 25)
        this.shieldDuration = 8000; // 8 seconds in milliseconds
        this.isShielded = false; // Track if player has active shield
        this.shieldEndTime = 0; // When the shield effect ends
        this.shieldMesh = null; // Reference to the shield mesh
        this.lastNutTime = 0;
        this.nutCooldown = 0.5;
        this.isRapidFiring = false;
        this.rapidFireInterval = null;
        this.powerUpDuration = 15000; // 15 seconds in milliseconds
        this.powerUpEndTime = 0;
        this.nuts = [];
        this.squirrels = [];
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.prevTime = performance.now();
        this.lastSpawnTime = 0;
        this.spawnInterval = 5;
        this.maxSquirrels = 10;
        this.moveSpeed = 0.1;

        // Add health system
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.isGameOver = false;

        this.soundManager = new SoundManager();

        this.boss = null;
        this.bossHealth = 0;
        this.lastMinionSpawnTime = 0;

        this.setupScene();
        this.setupControls();
        this.createGround();
        this.createSquirrels();
        this.createUI();
        this.animate();
    }

    createCrosshair() {
        const crosshair = document.createElement('div');
        crosshair.style.position = 'absolute';
        crosshair.style.top = '50%';
        crosshair.style.left = '50%';
        crosshair.style.transform = 'translate(-50%, -50%)';
        crosshair.style.width = '20px';
        crosshair.style.height = '20px';
        crosshair.style.border = '2px solid white';
        crosshair.style.borderRadius = '50%';
        crosshair.style.pointerEvents = 'none';
        crosshair.style.zIndex = '1000';
        document.getElementById('game-container').appendChild(crosshair);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    setupScene() {
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Add directional light (sun)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -50;
        directionalLight.shadow.camera.right = 50;
        directionalLight.shadow.camera.top = 50;
        directionalLight.shadow.camera.bottom = -50;
        this.scene.add(directionalLight);

        // Add sky gradient
        const skyGeometry = new THREE.SphereGeometry(100, 32, 32);
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) },
                bottomColor: { value: new THREE.Color(0xffffff) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide
        });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);

        // Add clouds
        const cloudGeometry = new THREE.PlaneGeometry(100, 100);
        const cloudMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.4
        });
        for (let i = 0; i < 10; i++) {
            const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
            cloud.position.set(
                Math.random() * 200 - 100,
                30 + Math.random() * 10,
                Math.random() * 200 - 100
            );
            cloud.rotation.x = Math.PI / 2;
            cloud.scale.set(2 + Math.random() * 3, 1, 1 + Math.random() * 2);
            this.scene.add(cloud);
        }

        // Set camera position
        this.camera.position.y = 1.6;
        this.camera.position.z = 5;
    }

    setupControls() {
        document.addEventListener('click', () => {
            if (!this.controls.isLocked) {
                this.controls.lock();
            } else {
                // Shoot when clicking while controls are locked
                this.launchNut();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (this.isGameOver && event.code === 'KeyR') {
                window.location.reload();
                return;
            }

            switch (event.code) {
                case 'ArrowUp':
                case 'KeyW':
                    this.moveForward = true;
                    break;
                case 'ArrowLeft':
                case 'KeyA':
                    this.moveLeft = true;
                    break;
                case 'ArrowDown':
                case 'KeyS':
                    this.moveBackward = true;
                    break;
                case 'ArrowRight':
                case 'KeyD':
                    this.moveRight = true;
                    break;
                case 'ShiftLeft':
                    if (this.canSprint && this.stamina > 0) {
                        this.isSprinting = true;
                    }
                    break;
                case 'Space':
                    if (this.isLevelComplete) {
                        this.startNextLevel();
                    }
                    break;
            }
        });

        document.addEventListener('keyup', (event) => {
            switch (event.code) {
                case 'ArrowUp':
                case 'KeyW':
                    this.moveForward = false;
                    break;
                case 'ArrowLeft':
                case 'KeyA':
                    this.moveLeft = false;
                    break;
                case 'ArrowDown':
                case 'KeyS':
                    this.moveBackward = false;
                    break;
                case 'ArrowRight':
                case 'KeyD':
                    this.moveRight = false;
                    break;
                case 'ShiftLeft':
                    this.isSprinting = false;
                    break;
            }
        });
    }

    createGround() {
        // Create simple flat ground
        const groundGeometry = new THREE.PlaneGeometry(60, 60); // Reduced size to match walls
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x3a5f0b,
            side: THREE.DoubleSide,
            roughness: 0.8,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Add walls
        const wallHeight = 8;
        const wallThickness = 1;
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.8,
            metalness: 0.2
        });

        // North wall
        const northWall = new THREE.Mesh(
            new THREE.BoxGeometry(60, wallHeight, wallThickness),
            wallMaterial
        );
        northWall.position.set(0, wallHeight/2, -30);
        northWall.castShadow = true;
        northWall.receiveShadow = true;
        this.scene.add(northWall);

        // South wall
        const southWall = new THREE.Mesh(
            new THREE.BoxGeometry(60, wallHeight, wallThickness),
            wallMaterial
        );
        southWall.position.set(0, wallHeight/2, 30);
        southWall.castShadow = true;
        southWall.receiveShadow = true;
        this.scene.add(southWall);

        // East wall
        const eastWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, 60),
            wallMaterial
        );
        eastWall.position.set(30, wallHeight/2, 0);
        eastWall.castShadow = true;
        eastWall.receiveShadow = true;
        this.scene.add(eastWall);

        // West wall
        const westWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, 60),
            wallMaterial
        );
        westWall.position.set(-30, wallHeight/2, 0);
        westWall.castShadow = true;
        westWall.receiveShadow = true;
        this.scene.add(westWall);

        // Add grass patches within walls
        const grassGeometry = new THREE.PlaneGeometry(1, 1);
        const grassMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x4a7c20,
            side: THREE.DoubleSide,
            roughness: 0.8,
            metalness: 0.1
        });
        
        for (let i = 0; i < 100; i++) {
            const grass = new THREE.Mesh(grassGeometry, grassMaterial);
            grass.position.set(
                Math.random() * 50 - 25, // Keep grass within walls
                0.01,
                Math.random() * 50 - 25
            );
            grass.rotation.x = -Math.PI / 2;
            grass.scale.set(0.5 + Math.random() * 0.5, 1, 0.5 + Math.random() * 0.5);
            this.scene.add(grass);
        }

        // Add trees within walls
        for (let i = 0; i < 15; i++) { // Reduced number of trees
            const tree = this.createTree();
            tree.position.set(
                Math.random() * 50 - 25, // Keep trees within walls
                0,
                Math.random() * 50 - 25
            );
            this.scene.add(tree);
        }
    }

    createTree() {
        const tree = new THREE.Group();

        // Tree trunk
        const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, 2, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513,
            roughness: 0.9,
            metalness: 0.1
        });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 1;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        tree.add(trunk);

        // Tree top (leaves)
        const topGeometry = new THREE.ConeGeometry(1, 2, 8);
        const topMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x228B22,
            roughness: 0.8,
            metalness: 0.1
        });
        const top = new THREE.Mesh(topGeometry, topMaterial);
        top.position.y = 2.5;
        top.castShadow = true;
        tree.add(top);

        // Add some branches
        const branchGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
        const branchMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513,
            roughness: 0.9,
            metalness: 0.1
        });

        for (let i = 0; i < 4; i++) {
            const branch = new THREE.Mesh(branchGeometry, branchMaterial);
            branch.position.y = 1.5;
            branch.position.x = (Math.random() - 0.5) * 0.5;
            branch.position.z = (Math.random() - 0.5) * 0.5;
            branch.rotation.z = (Math.random() - 0.5) * 0.5;
            branch.rotation.x = (Math.random() - 0.5) * 0.5;
            branch.castShadow = true;
            tree.add(branch);
        }

        return tree;
    }

    createSquirrel() {
        const squirrel = new THREE.Group();

        // Squirrel body (larger)
        const bodyGeometry = new THREE.BoxGeometry(0.6, 0.45, 0.9);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.8,
            metalness: 0.1
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.225;
        squirrel.add(body);

        // Squirrel head (larger)
        const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513,
            roughness: 0.8,
            metalness: 0.1
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.set(0, 0.45, 0.45);
        squirrel.add(head);

        // Squirrel ears (larger and more detailed)
        const earGeometry = new THREE.ConeGeometry(0.12, 0.2, 8);
        const earMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513,
            roughness: 0.8,
            metalness: 0.1
        });
        
        const leftEar = new THREE.Mesh(earGeometry, earMaterial);
        leftEar.position.set(-0.2, 0.6, 0.3);
        leftEar.rotation.z = -Math.PI / 6;
        squirrel.add(leftEar);

        const rightEar = new THREE.Mesh(earGeometry, earMaterial);
        rightEar.position.set(0.2, 0.6, 0.3);
        rightEar.rotation.z = Math.PI / 6;
        squirrel.add(rightEar);

        // Inner ears
        const innerEarGeometry = new THREE.ConeGeometry(0.08, 0.15, 8);
        const innerEarMaterial = new THREE.MeshStandardMaterial({ color: 0xFFE4B5 });
        
        const leftInnerEar = new THREE.Mesh(innerEarGeometry, innerEarMaterial);
        leftInnerEar.position.set(-0.2, 0.6, 0.3);
        leftInnerEar.rotation.z = -Math.PI / 6;
        squirrel.add(leftInnerEar);
        
        const rightInnerEar = new THREE.Mesh(innerEarGeometry, innerEarMaterial);
        rightInnerEar.position.set(0.2, 0.6, 0.3);
        rightInnerEar.rotation.z = Math.PI / 6;
        squirrel.add(rightInnerEar);

        // Squirrel eyes (larger and more detailed)
        const eyeGeometry = new THREE.SphereGeometry(0.045, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.15, 0.525, 0.675);
        squirrel.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.15, 0.525, 0.675);
        squirrel.add(rightEye);

        // Eye highlights
        const highlightGeometry = new THREE.SphereGeometry(0.015, 8, 8);
        const highlightMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
        
        const leftHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
        leftHighlight.position.set(-0.12, 0.55, 0.7);
        squirrel.add(leftHighlight);
        
        const rightHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
        rightHighlight.position.set(0.18, 0.55, 0.7);
        squirrel.add(rightHighlight);

        // Squirrel nose (larger)
        const noseGeometry = new THREE.SphereGeometry(0.03, 8, 8);
        const noseMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
        const nose = new THREE.Mesh(noseGeometry, noseMaterial);
        nose.position.set(0, 0.45, 0.75);
        squirrel.add(nose);

        // Squirrel tail - fluffy and curved
        const tailCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0.3, -0.3),
            new THREE.Vector3(0.1, 0.4, -0.5),
            new THREE.Vector3(0, 0.5, -0.6),
            new THREE.Vector3(-0.1, 0.6, -0.5)
        ]);

        const tailSegments = 8;
        const tailRadius = 0.15;
        
        // Create main tail structure
        const tailGeometry = new THREE.TubeGeometry(tailCurve, tailSegments, tailRadius, 8, false);
        const tailMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513,
            roughness: 0.9,
            metalness: 0.1
        });
        const mainTail = new THREE.Mesh(tailGeometry, tailMaterial);
        squirrel.add(mainTail);

        // Add fur tufts around the tail
        const furGeometry = new THREE.ConeGeometry(0.08, 0.2, 8);
        const furMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.9,
            metalness: 0.1
        });

        // Add fur along the tail curve
        for (let i = 0; i <= tailSegments; i++) {
            const t = i / tailSegments;
            const point = tailCurve.getPoint(t);
            const tangent = tailCurve.getTangent(t);

            // Create multiple fur tufts around each point
            for (let j = 0; j < 6; j++) {
                const angle = (j / 6) * Math.PI * 2;
                const fur = new THREE.Mesh(furGeometry, furMaterial);
                
                // Position fur tuft
                fur.position.copy(point);
                
                // Calculate fur orientation
                const radialOffset = new THREE.Vector3(
                    Math.cos(angle) * tailRadius * 1.2,
                    Math.sin(angle) * tailRadius * 1.2,
                    0
                );
                
                // Rotate radial offset based on tail tangent
                const upVector = new THREE.Vector3(0, 1, 0);
                const rotationMatrix = new THREE.Matrix4();
                rotationMatrix.lookAt(
                    new THREE.Vector3(),
                    tangent,
                    upVector
                );
                radialOffset.applyMatrix4(rotationMatrix);
                
                fur.position.add(radialOffset);
                
                // Orient fur tuft
                fur.lookAt(point.clone().add(tangent));
                fur.rotateX(Math.PI / 2);
                
                // Add some randomness to fur rotation and scale
                fur.rotation.z = Math.random() * Math.PI * 2;
                fur.scale.multiplyScalar(0.8 + Math.random() * 0.4);
                
                squirrel.add(fur);
            }
        }

        // Add extra volume at the base of the tail
        const baseFurGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const baseFur = new THREE.Mesh(baseFurGeometry, furMaterial);
        baseFur.position.set(0, 0.3, -0.3);
        baseFur.scale.set(1, 0.8, 1);
        squirrel.add(baseFur);

        // Squirrel legs (larger)
        const legGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.225, 8);
        const legMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.8,
            metalness: 0.1
        });

        // Front legs
        const frontLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
        frontLeftLeg.position.set(-0.2, 0.075, 0.3);
        squirrel.add(frontLeftLeg);

        const frontRightLeg = new THREE.Mesh(legGeometry, legMaterial);
        frontRightLeg.position.set(0.2, 0.075, 0.3);
        squirrel.add(frontRightLeg);

        // Back legs
        const backLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
        backLeftLeg.position.set(-0.2, 0.075, -0.3);
        squirrel.add(backLeftLeg);

        const backRightLeg = new THREE.Mesh(legGeometry, legMaterial);
        backRightLeg.position.set(0.2, 0.075, -0.3);
        squirrel.add(backRightLeg);

        return squirrel;
    }

    createBossSquirrel() {
        const boss = this.createSquirrel(); // Start with base squirrel
        
        // Make the boss bigger
        boss.scale.set(3, 3, 3);
        
        // Give boss a distinct color
        boss.children.forEach(child => {
            if (child.material) {
                if (child.material.color) {
                    child.material = child.material.clone();
                    child.material.color.setHex(0x8B0000); // Dark red
                }
            }
        });

        // Set boss position
        boss.position.set(0, 0.7, -25); // Start at the far end
        
        // Add boss properties
        const levelData = this.levelData[this.level];
        boss.userData = {
            isBoss: true,
            health: levelData.bossHealth,
            maxHealth: levelData.bossHealth,
            direction: new THREE.Vector3(),
            speed: levelData.bossSpeed,
            lastAttackTime: 0,
            lastDirectionChange: performance.now(),
            directionChangeInterval: 2000
        };

        boss.castShadow = true;
        boss.receiveShadow = true;

        this.boss = boss;
        this.bossHealth = levelData.bossHealth;
        this.scene.add(boss);

        // Create boss health bar
        this.createBossHealthBar();
    }

    createBossHealthBar() {
        // Remove existing boss health bar if it exists
        const existingBar = document.getElementById('boss-health-container');
        if (existingBar) existingBar.remove();

        const healthContainer = document.createElement('div');
        healthContainer.id = 'boss-health-container';
        healthContainer.style.position = 'absolute';
        healthContainer.style.top = '20px';
        healthContainer.style.left = '50%';
        healthContainer.style.transform = 'translateX(-50%)';
        healthContainer.style.width = '600px';
        healthContainer.style.height = '30px';
        healthContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        healthContainer.style.borderRadius = '15px';
        healthContainer.style.padding = '5px';
        healthContainer.style.display = this.level === 3 ? 'block' : 'none';

        const healthBar = document.createElement('div');
        healthBar.id = 'boss-health-bar';
        healthBar.style.width = '100%';
        healthBar.style.height = '100%';
        healthBar.style.backgroundColor = '#ff0000';
        healthBar.style.borderRadius = '10px';
        healthBar.style.transition = 'width 0.3s ease';

        const healthText = document.createElement('div');
        healthText.id = 'boss-health-text';
        healthText.style.position = 'absolute';
        healthText.style.width = '100%';
        healthText.style.textAlign = 'center';
        healthText.style.color = 'white';
        healthText.style.fontFamily = 'Arial, sans-serif';
        healthText.style.fontSize = '16px';
        healthText.style.fontWeight = 'bold';
        healthText.style.lineHeight = '30px';
        healthText.textContent = 'BOSS';

        healthContainer.appendChild(healthBar);
        healthContainer.appendChild(healthText);
        document.getElementById('game-ui').appendChild(healthContainer);
    }

    updateBossHealthBar() {
        if (this.boss) {
            const healthPercent = (this.boss.userData.health / this.boss.userData.maxHealth) * 100;
            const healthBar = document.getElementById('boss-health-bar');
            if (healthBar) {
                healthBar.style.width = `${healthPercent}%`;
            }
        }
    }

    createSquirrels() {
        if (this.level === 3) {
            // Boss level setup
            this.createBossSquirrel();
            // Spawn initial minions
            const minionCount = this.levelData[this.level].minionCount;
            for (let i = 0; i < minionCount; i++) {
                this.spawnMinion();
            }
        } else {
            // Normal level setup
            const initialCount = Math.min(10, this.levelData[this.level].squirrels);
            for (let i = 0; i < initialCount; i++) {
                const squirrel = this.createSquirrel();
                
                // Position squirrels in a circle within the walls
                const angle = (Math.PI * 2 * i) / initialCount;
                const distance = Math.min(20, 25 + Math.random() * 5);
                squirrel.position.x = Math.cos(angle) * distance;
                squirrel.position.z = Math.sin(angle) * distance;
                squirrel.position.y = 0.225;
                
                const levelData = this.levelData[this.level];
                squirrel.userData = {
                    direction: new THREE.Vector3(),
                    speed: levelData.speed * 2,
                    lastAttackTime: 0
                };
                
                squirrel.castShadow = true;
                squirrel.receiveShadow = true;
                
                this.squirrels.push(squirrel);
                this.scene.add(squirrel);
            }
        }
    }

    spawnMinion() {
        const squirrel = this.createSquirrel();
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 5;
        
        squirrel.position.x = this.boss.position.x + Math.cos(angle) * distance;
        squirrel.position.z = this.boss.position.z + Math.sin(angle) * distance;
        squirrel.position.y = 0.225;

        const levelData = this.levelData[this.level];
        squirrel.userData = {
            direction: new THREE.Vector3(),
            speed: levelData.speed,
            lastAttackTime: 0,
            isMinion: true
        };

        squirrel.castShadow = true;
        squirrel.receiveShadow = true;
        
        this.squirrels.push(squirrel);
        this.scene.add(squirrel);
    }

    createUI() {
        // Remove any existing UI elements
        const existingUI = document.getElementById('game-ui');
        if (existingUI) existingUI.remove();

        // Create main UI container
        const uiContainer = document.createElement('div');
        uiContainer.id = 'game-ui';
        uiContainer.style.position = 'absolute';
        uiContainer.style.top = '0';
        uiContainer.style.left = '0';
        uiContainer.style.width = '100%';
        uiContainer.style.height = '100%';
        uiContainer.style.pointerEvents = 'none';
        document.body.appendChild(uiContainer);

        // Create stats panel
        const statsPanel = document.createElement('div');
        statsPanel.style.position = 'absolute';
        statsPanel.style.top = '20px';
        statsPanel.style.left = '20px';
        statsPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        statsPanel.style.padding = '15px';
        statsPanel.style.borderRadius = '10px';
        statsPanel.style.color = 'white';
        statsPanel.style.fontFamily = 'Arial, sans-serif';
        statsPanel.style.fontSize = '16px';
        statsPanel.style.lineHeight = '1.5';
        uiContainer.appendChild(statsPanel);

        // Score display
        const scoreDiv = document.createElement('div');
        scoreDiv.id = 'score-display';
        scoreDiv.style.marginBottom = '10px';
        statsPanel.appendChild(scoreDiv);

        // Level display
        const levelDiv = document.createElement('div');
        levelDiv.id = 'level-display';
        levelDiv.style.marginBottom = '10px';
        statsPanel.appendChild(levelDiv);

        // Progress bar
        const progressContainer = document.createElement('div');
        progressContainer.style.width = '200px';
        progressContainer.style.height = '10px';
        progressContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        progressContainer.style.borderRadius = '5px';
        progressContainer.style.marginBottom = '10px';
        progressContainer.style.overflow = 'hidden';
        statsPanel.appendChild(progressContainer);

        const progressBar = document.createElement('div');
        progressBar.id = 'progress-bar';
        progressBar.style.width = '0%';
        progressBar.style.height = '100%';
        progressBar.style.backgroundColor = '#4CAF50';
        progressBar.style.transition = 'width 0.3s ease';
        progressContainer.appendChild(progressBar);

        // Weapon display
        const weaponDiv = document.createElement('div');
        weaponDiv.id = 'weapon-display';
        weaponDiv.style.display = 'flex';
        weaponDiv.style.alignItems = 'center';
        weaponDiv.style.marginBottom = '10px';
        statsPanel.appendChild(weaponDiv);

        const weaponIcon = document.createElement('div');
        weaponIcon.id = 'weapon-icon';
        weaponIcon.style.width = '20px';
        weaponIcon.style.height = '20px';
        weaponIcon.style.borderRadius = '50%';
        weaponIcon.style.marginRight = '10px';
        weaponDiv.appendChild(weaponIcon);

        const weaponText = document.createElement('div');
        weaponText.id = 'weapon-text';
        weaponDiv.appendChild(weaponText);

        // Level complete message
        const levelCompleteDiv = document.createElement('div');
        levelCompleteDiv.id = 'level-complete';
        levelCompleteDiv.style.position = 'absolute';
        levelCompleteDiv.style.top = '50%';
        levelCompleteDiv.style.left = '50%';
        levelCompleteDiv.style.transform = 'translate(-50%, -50%)';
        levelCompleteDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        levelCompleteDiv.style.padding = '20px';
        levelCompleteDiv.style.borderRadius = '10px';
        levelCompleteDiv.style.color = 'white';
        levelCompleteDiv.style.fontFamily = 'Arial, sans-serif';
        levelCompleteDiv.style.fontSize = '24px';
        levelCompleteDiv.style.textAlign = 'center';
        levelCompleteDiv.style.display = 'none';
        uiContainer.appendChild(levelCompleteDiv);

        // Add health bar - moved to left side
        const healthContainer = document.createElement('div');
        healthContainer.style.position = 'absolute';
        healthContainer.style.bottom = '20px';
        healthContainer.style.left = '20px'; // Changed from center (50%) to left (20px)
        healthContainer.style.width = '300px';
        healthContainer.style.height = '20px';
        healthContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        healthContainer.style.borderRadius = '10px';
        healthContainer.style.padding = '3px';
        uiContainer.appendChild(healthContainer);

        const healthBar = document.createElement('div');
        healthBar.id = 'health-bar';
        healthBar.style.width = '100%';
        healthBar.style.height = '100%';
        healthBar.style.backgroundColor = '#ff3333';
        healthBar.style.borderRadius = '8px';
        healthBar.style.transition = 'width 0.3s ease';
        healthContainer.appendChild(healthBar);

        // Add label for health bar
        const healthLabel = document.createElement('div');
        healthLabel.style.position = 'absolute';
        healthLabel.style.bottom = '20px';
        healthLabel.style.left = '330px'; // Right of health bar
        healthLabel.style.color = 'white';
        healthLabel.style.fontFamily = 'Arial, sans-serif';
        healthLabel.style.fontSize = '16px';
        healthLabel.style.textShadow = '1px 1px 2px black';
        healthLabel.textContent = 'HEALTH';
        uiContainer.appendChild(healthLabel);

        // Add stamina bar - moved to left side, above health bar
        const staminaContainer = document.createElement('div');
        staminaContainer.style.position = 'absolute';
        staminaContainer.style.bottom = '50px';
        staminaContainer.style.left = '20px'; // Changed from center (50%) to left (20px)
        staminaContainer.style.width = '300px';
        staminaContainer.style.height = '15px';
        staminaContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        staminaContainer.style.borderRadius = '7px';
        staminaContainer.style.padding = '2px';
        uiContainer.appendChild(staminaContainer);

        const staminaBar = document.createElement('div');
        staminaBar.id = 'stamina-bar';
        staminaBar.style.width = '100%';
        staminaBar.style.height = '100%';
        staminaBar.style.backgroundColor = '#2855a4';
        staminaBar.style.borderRadius = '5px';
        staminaBar.style.transition = 'width 0.1s ease';
        staminaContainer.appendChild(staminaBar);

        // Add label for stamina bar
        const staminaLabel = document.createElement('div');
        staminaLabel.style.position = 'absolute';
        staminaLabel.style.bottom = '50px';
        staminaLabel.style.left = '330px'; // Right of stamina bar
        staminaLabel.style.color = 'white';
        staminaLabel.style.fontFamily = 'Arial, sans-serif';
        staminaLabel.style.fontSize = '16px';
        staminaLabel.style.textShadow = '1px 1px 2px black';
        staminaLabel.textContent = 'STAMINA';
        uiContainer.appendChild(staminaLabel);

        // Game over screen
        const gameOverDiv = document.createElement('div');
        gameOverDiv.id = 'game-over';
        gameOverDiv.style.position = 'absolute';
        gameOverDiv.style.top = '50%';
        gameOverDiv.style.left = '50%';
        gameOverDiv.style.transform = 'translate(-50%, -50%)';
        gameOverDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        gameOverDiv.style.padding = '30px';
        gameOverDiv.style.borderRadius = '15px';
        gameOverDiv.style.color = 'white';
        gameOverDiv.style.fontFamily = 'Arial, sans-serif';
        gameOverDiv.style.fontSize = '32px';
        gameOverDiv.style.textAlign = 'center';
        gameOverDiv.style.display = 'none';
        uiContainer.appendChild(gameOverDiv);

        this.updateUI();
    }

    updateUI() {
        const levelData = this.levelData[this.level];
        const progress = (this.levelScore / levelData.scoreToNext) * 100;
        
        document.getElementById('score-display').textContent = `Score: ${this.score}`;
        document.getElementById('level-display').textContent = `Level: ${this.level}`;
        document.getElementById('progress-bar').style.width = `${progress}%`;
        
        // Update weapon display
        const weaponText = document.getElementById('weapon-text');
        const weaponIcon = document.getElementById('weapon-icon');
        
        // Show remaining time for powerups
        if (this.currentNutType !== 'normal') {
            const timeLeft = Math.max(0, Math.floor((this.powerUpEndTime - performance.now()) / 1000));
            weaponText.textContent = `${this.currentNutType.toUpperCase()} (${timeLeft}s)`;
        } else {
            weaponText.textContent = `Weapon: ${this.currentNutType}`;
        }
        
        weaponIcon.style.backgroundColor = `#${this.nutTypes[this.currentNutType].color.toString(16)}`;
        
        if (this.isLevelComplete) {
            const levelCompleteDiv = document.getElementById('level-complete');
            levelCompleteDiv.style.display = 'block';
            levelCompleteDiv.innerHTML = `
                <div style="margin-bottom: 20px;">Level ${this.level} Complete!</div>
                <div style="font-size: 18px; margin-bottom: 20px;">Score: ${this.score}</div>
                ${this.level < this.maxLevel ? 
                    '<div style="font-size: 16px;">Press SPACE to continue to next level</div>' :
                    '<div style="font-size: 16px;">Congratulations! You completed all levels!</div>'
                }
            `;
        } else {
            document.getElementById('level-complete').style.display = 'none';
        }

        // Update health bar
        const healthPercent = (this.health / this.maxHealth) * 100;
        const healthBar = document.getElementById('health-bar');
        healthBar.style.width = `${healthPercent}%`;
        
        // Update health bar color based on health level
        if (healthPercent > 60) {
            healthBar.style.backgroundColor = '#33ff33';
        } else if (healthPercent > 30) {
            healthBar.style.backgroundColor = '#ffff33';
        } else {
            healthBar.style.backgroundColor = '#ff3333';
        }

        // Update stamina bar
        const staminaPercent = (this.stamina / this.maxStamina) * 100;
        const staminaBar = document.getElementById('stamina-bar');
        if (staminaBar) {
            staminaBar.style.width = `${staminaPercent}%`;
            
            // Change stamina bar color based on level - three tiers
            if (staminaPercent > 66.67) {
                staminaBar.style.backgroundColor = '#2855a4'; // blue when high
            } else if (staminaPercent > 33.33) {
                staminaBar.style.backgroundColor = '#ff9933'; // orange when medium
            } else {
                staminaBar.style.backgroundColor = '#ff3333'; // red when low
            }
        }

        // Show game over screen if health is depleted
        const gameOverDiv = document.getElementById('game-over');
        if (this.isGameOver) {
            gameOverDiv.style.display = 'block';
            gameOverDiv.innerHTML = `
                <div style="margin-bottom: 20px;">Game Over!</div>
                <div style="font-size: 24px; margin-bottom: 20px;">Final Score: ${this.score}</div>
                <div style="font-size: 18px;">Press R to restart</div>
            `;
        } else {
            gameOverDiv.style.display = 'none';
        }
    }

    createPowerUp() {
        const powerUpTypes = ['explosive', 'rapid'];
        const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
        
        const geometry = new THREE.SphereGeometry(0.5);
        const material = new THREE.MeshStandardMaterial({ 
            color: this.nutTypes[type].color,
            emissive: this.nutTypes[type].color,
            emissiveIntensity: 0.5
        });
        
        const powerUp = new THREE.Mesh(geometry, material);
        powerUp.position.set(
            (Math.random() * 50 - 25), // Keep within walls
            1,
            (Math.random() * 50 - 25)
        );
        powerUp.userData = { type: type };
        powerUp.castShadow = true;
        
        this.powerUps.push(powerUp);
        this.scene.add(powerUp);
    }

    createHealthPowerUp() {
        const geometry = new THREE.SphereGeometry(0.5);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x00FF00, // Green for health
            emissive: 0x00FF00,
            emissiveIntensity: 0.5
        });
        
        const healthPowerUp = new THREE.Mesh(geometry, material);
        healthPowerUp.position.set(
            (Math.random() * 50 - 25), // Keep within walls
            1,
            (Math.random() * 50 - 25)
        );
        
        // Add a pulsing animation
        healthPowerUp.userData = { 
            type: 'health',
            pulsePhase: 0,
            pulsing: true
        };
        
        // Add a red cross to identify as health
        const crossMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
        
        // Vertical part of cross
        const verticalGeometry = new THREE.BoxGeometry(0.1, 0.5, 0.1);
        const verticalPart = new THREE.Mesh(verticalGeometry, crossMaterial);
        healthPowerUp.add(verticalPart);
        
        // Horizontal part of cross
        const horizontalGeometry = new THREE.BoxGeometry(0.5, 0.1, 0.1);
        const horizontalPart = new THREE.Mesh(horizontalGeometry, crossMaterial);
        healthPowerUp.add(horizontalPart);
        
        healthPowerUp.castShadow = true;
        
        this.healthPowerUps.push(healthPowerUp);
        this.scene.add(healthPowerUp);
    }

    createShieldPowerUp() {
        const geometry = new THREE.SphereGeometry(0.5);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x0088ff, // Blue for shield
            emissive: 0x0088ff,
            emissiveIntensity: 0.5
        });
        
        const shieldPowerUp = new THREE.Mesh(geometry, material);
        shieldPowerUp.position.set(
            (Math.random() * 50 - 25), // Keep within walls
            1,
            (Math.random() * 50 - 25)
        );
        
        // Add a pulsing animation
        shieldPowerUp.userData = { 
            type: 'shield',
            pulsePhase: 0,
            pulsing: true
        };
        
        // Add a shield icon
        const shieldIconMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
        // Create a simple shield icon
        const shieldIconGeometry = new THREE.TorusGeometry(0.25, 0.05, 8, 16);
        const shieldIcon = new THREE.Mesh(shieldIconGeometry, shieldIconMaterial);
        shieldIcon.rotation.x = Math.PI / 2;
        shieldPowerUp.add(shieldIcon);
        
        shieldPowerUp.castShadow = true;
        
        this.shieldPowerUps.push(shieldPowerUp);
        this.scene.add(shieldPowerUp);
    }

    activateShield() {
        // Remove existing shield if there is one
        this.deactivateShield();
        
        // Create shield mesh around player
        const shieldGeometry = new THREE.SphereGeometry(1.5, 32, 32);
        const shieldMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x0088ff,
            transparent: true,
            opacity: 0.4
        });
        
        this.shieldMesh = new THREE.Mesh(shieldGeometry, shieldMaterial);
        this.camera.add(this.shieldMesh);
        
        // Set shield state
        this.isShielded = true;
        this.shieldEndTime = performance.now() + this.shieldDuration;
        
        // Show notification
        this.showPowerUpNotification('shield');
    }
    
    deactivateShield() {
        if (this.shieldMesh) {
            this.camera.remove(this.shieldMesh);
            this.shieldMesh = null;
        }
        this.isShielded = false;
    }

    launchNut() {
        const time = performance.now();
        if (time - this.lastNutTime < this.nutCooldown) return;
        
        const nutType = this.nutTypes[this.currentNutType];
        const nutGeometry = new THREE.SphereGeometry(0.3);
        const nutMaterial = new THREE.MeshStandardMaterial({ 
            color: nutType.color,
            roughness: 0.1,
            metalness: 0.9,
            emissive: nutType.color,
            emissiveIntensity: 0.2
        });
        const nut = new THREE.Mesh(nutGeometry, nutMaterial);

        // Get camera direction and position
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        
        // Set nut position in front of camera
        nut.position.copy(this.camera.position);
        nut.position.add(direction.multiplyScalar(1));
        
        // Set initial velocity based on nut type
        nut.velocity = new THREE.Vector3();
        nut.velocity.copy(direction).multiplyScalar(nutType.speed);
        nut.velocity.y += 0.5;

        // Add nut properties
        nut.userData = {
            type: this.currentNutType,
            damage: nutType.damage
        };

        // Create trail
        const trailGeometry = new THREE.BufferGeometry();
        const trailMaterial = new THREE.LineBasicMaterial({ 
            color: nutType.color,
            transparent: true,
            opacity: 0.5
        });
        const trail = new THREE.Line(trailGeometry, trailMaterial);
        nut.trail = trail;
        nut.trailPoints = [];
        this.scene.add(trail);
        
        nut.castShadow = true;
        nut.receiveShadow = true;

        this.nuts.push(nut);
        this.scene.add(nut);
        this.lastNutTime = time;
        this.soundManager.playSound('launch');
    }

    startRapidFire() {
        if (this.rapidFireInterval) {
            clearInterval(this.rapidFireInterval);
        }
        this.isRapidFiring = true;
        this.rapidFireInterval = setInterval(() => {
            if (this.controls.isLocked && !this.isGameOver && !this.isLevelComplete) {
                this.launchNut();
            }
        }, 150);
    }

    stopRapidFire() {
        if (this.rapidFireInterval) {
            clearInterval(this.rapidFireInterval);
            this.rapidFireInterval = null;
        }
        this.isRapidFiring = false;
    }

    updateNuts() {
        for (let i = this.nuts.length - 1; i >= 0; i--) {
            const nut = this.nuts[i];
            const previousPosition = nut.position.clone();
            nut.position.add(nut.velocity);
            nut.velocity.y -= 0.1;

            // Update trail
            nut.trailPoints.push(nut.position.clone());
            if (nut.trailPoints.length > 20) {
                nut.trailPoints.shift();
            }
            const positions = new Float32Array(nut.trailPoints.length * 3);
            nut.trailPoints.forEach((point, index) => {
                positions[index * 3] = point.x;
                positions[index * 3 + 1] = point.y;
                positions[index * 3 + 2] = point.z;
            });
            nut.trail.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            // Check for collisions
            let hitSomething = false;

            // Check boss collision first
            if (this.boss) {
                const bossBox = new THREE.Box3().setFromObject(this.boss);
                bossBox.expandByScalar(0.6); // Larger collision box for boss

                if (bossBox.containsPoint(nut.position)) {
                    this.soundManager.playSound('hit');
                    
                    // Apply damage to boss
                    this.boss.userData.health -= nut.userData.damage * 10; // Multiply damage for boss
                    
                    if (this.boss.userData.health <= 0) {
                        this.killSquirrel(this.boss, -1);
                    }
                    
                    // Handle explosive nuts
                    if (nut.userData.type === 'explosive') {
                        this.createExplosion(nut.position.clone(), this.nutTypes.explosive.radius);
                    }
                    
                    hitSomething = true;
                }
            }

            // Check regular squirrel collisions
            if (!hitSomething) {
                for (let j = this.squirrels.length - 1; j >= 0; j--) {
                    const squirrel = this.squirrels[j];
                    const squirrelBox = new THREE.Box3().setFromObject(squirrel);
                    squirrelBox.expandByScalar(0.2);

                    if (squirrelBox.containsPoint(nut.position)) {
                        this.soundManager.playSound('hit');
                        
                        // Handle explosive nuts
                        if (nut.userData.type === 'explosive') {
                            this.createExplosion(nut.position.clone(), this.nutTypes.explosive.radius);
                        } else {
                            this.killSquirrel(squirrel, j);
                        }

                        hitSomething = true;
                        break;
                    }
                }
            }

            // Remove nut if it hit something
            if (hitSomething) {
                this.scene.remove(nut);
                this.scene.remove(nut.trail);
                this.nuts.splice(i, 1);
                continue;
            }

            // Remove nuts that hit the ground or go too far
            if (nut.position.y < 0.1 || 
                Math.abs(nut.position.x) > 50 || 
                Math.abs(nut.position.z) > 50) {
                this.scene.remove(nut);
                this.scene.remove(nut.trail);
                this.nuts.splice(i, 1);
            }
        }
    }

    createExplosion(position, radius) {
        // Visual effect
        const explosionGeometry = new THREE.SphereGeometry(radius, 32, 32);
        const explosionMaterial = new THREE.MeshBasicMaterial({
            color: 0xff5500,
            transparent: true,
            opacity: 0.7
        });
        const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
        explosion.position.copy(position);
        this.scene.add(explosion);
        
        // Damage squirrels in radius
        for (let i = this.squirrels.length - 1; i >= 0; i--) {
            const squirrel = this.squirrels[i];
            const distance = position.distanceTo(squirrel.position);
            if (distance < radius) {
                this.killSquirrel(squirrel, i);
            }
        }
        
        // Also damage boss if in radius
        if (this.boss) {
            const distance = position.distanceTo(this.boss.position);
            if (distance < radius) {
                // Apply half damage to boss from explosion area effect
                this.boss.userData.health -= 5;
                if (this.boss.userData.health <= 0) {
                    this.killSquirrel(this.boss, -1);
                }
                this.updateBossHealthBar();
            }
        }
        
        // Fade out and remove explosion effect
        const fadeInterval = setInterval(() => {
            explosion.material.opacity -= 0.05;
            explosion.scale.x += 0.1;
            explosion.scale.y += 0.1;
            explosion.scale.z += 0.1;
            
            if (explosion.material.opacity <= 0) {
                clearInterval(fadeInterval);
                this.scene.remove(explosion);
            }
        }, 50);
    }

    killSquirrel(squirrel, index) {
        if (squirrel === this.boss) {
            // Boss death
            this.soundManager.playSound('death');
            this.scene.remove(squirrel);
            this.boss = null;
            this.isLevelComplete = true;
            
            // Remove boss health bar
            const bossHealthBar = document.getElementById('boss-health-container');
            if (bossHealthBar) bossHealthBar.style.display = 'none';
            
            // Clear all minions
            this.squirrels.forEach(minion => this.scene.remove(minion));
            this.squirrels = [];
            
            this.updateUI();
        } else {
            // Normal squirrel death
            this.soundManager.playSound('death');
            // Create death animation
            const deathParticles = new THREE.Group();
            for (let k = 0; k < 10; k++) {
                const particleGeometry = new THREE.SphereGeometry(0.05);
                const particleMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
                const particle = new THREE.Mesh(particleGeometry, particleMaterial);
                
                particle.position.copy(squirrel.position);
                particle.position.x += (Math.random() - 0.5) * 0.5;
                particle.position.y += (Math.random() - 0.5) * 0.5;
                particle.position.z += (Math.random() - 0.5) * 0.5;
                
                particle.userData = {
                    velocity: new THREE.Vector3(
                        (Math.random() - 0.5) * 0.2,
                        Math.random() * 0.2,
                        (Math.random() - 0.5) * 0.2
                    ),
                    lifetime: 1.0
                };
                
                deathParticles.add(particle);
            }
            this.scene.add(deathParticles);
            
            // Remove squirrel
            this.scene.remove(squirrel);
            this.squirrels.splice(index, 1);
            
            // Update score only for non-boss levels
            if (this.level !== 3) {
                this.score += 10;
                this.levelScore += 10;
                
                const levelData = this.levelData[this.level];
                if (this.levelScore >= levelData.scoreToNext && !this.isLevelComplete) {
                    this.isLevelComplete = true;
                    this.soundManager.playSound('levelComplete');
                }
            }
            
            this.updateUI();
            
            setTimeout(() => {
                this.scene.remove(deathParticles);
            }, 1000);
        }
    }

    updateSquirrels() {
        const time = performance.now();

        // Boss level specific updates
        if (this.level === 3 && this.boss) {
            // Update boss
            const bossData = this.boss.userData;
            const distanceToPlayer = this.boss.position.distanceTo(this.camera.position);
            
            // Boss movement
            if (time - bossData.lastDirectionChange > bossData.directionChangeInterval) {
                const randomOffset = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.5,
                    0,
                    (Math.random() - 0.5) * 0.5
                );
                bossData.direction.copy(this.camera.position)
                    .sub(this.boss.position)
                    .normalize()
                    .add(randomOffset)
                    .normalize();
                
                bossData.lastDirectionChange = time;
            }

            // Boss attack
            if (distanceToPlayer < 5) {
                const levelData = this.levelData[this.level];
                if (time - bossData.lastAttackTime > levelData.bossAttackSpeed * 1000) {
                    this.takeDamage(levelData.bossAttackDamage);
                    bossData.lastAttackTime = time;
                    this.soundManager.playSound('hit');
                }
            }

            // Move boss
            const newX = this.boss.position.x + bossData.direction.x * bossData.speed;
            const newZ = this.boss.position.z + bossData.direction.z * bossData.speed;
            
            // Keep boss within walls
            const bossRadius = 3;
            const mapBounds = 25;
            this.boss.position.x = Math.max(-mapBounds, Math.min(mapBounds, newX));
            this.boss.position.z = Math.max(-mapBounds, Math.min(mapBounds, newZ));
            
            // Rotate boss to face movement direction
            this.boss.rotation.y = Math.atan2(bossData.direction.x, bossData.direction.z);

            // Spawn minions
            if (time - this.lastMinionSpawnTime > this.levelData[this.level].minionSpawnInterval * 1000) {
                if (this.squirrels.length < this.levelData[this.level].minionCount) {
                    this.spawnMinion();
                    this.lastMinionSpawnTime = time;
                }
            }

            this.updateBossHealthBar();
        }

        // Update regular squirrels
        // More balanced spawning
        if (time - this.lastSpawnTime > this.spawnInterval * 1000 && 
            this.squirrels.length < this.maxSquirrels) {
            
            // Spawn multiple squirrels at once based on level
            const spawnCount = Math.min(
                Math.floor(this.level * 1.5), // Reduced spawn count multiplier
                this.maxSquirrels - this.squirrels.length
            );
            
            for (let i = 0; i < spawnCount; i++) {
                const squirrel = this.createSquirrel();
                
                // Spawn squirrels in a circle around the player
                const angle = Math.random() * Math.PI * 2;
                const distance = 35 + Math.random() * 10; // Increased minimum spawn distance
                squirrel.position.x = this.camera.position.x + Math.cos(angle) * distance;
                squirrel.position.z = this.camera.position.z + Math.sin(angle) * distance;
                squirrel.position.y = 0.225;
                
                const levelData = this.levelData[this.level];
                squirrel.userData = {
                    direction: new THREE.Vector3(),
                    speed: levelData.speed * 1.2, // Reduced base speed multiplier
                    lastAttackTime: 0,
                    lastDirectionChange: time,
                    directionChangeInterval: 1000 + Math.random() * 2000 // Add slight randomness to movement
                };
                
                squirrel.castShadow = true;
                squirrel.receiveShadow = true;
                
                this.squirrels.push(squirrel);
                this.scene.add(squirrel);
            }
            
            if (spawnCount > 0) {
                this.soundManager.playSound('movement');
            }
            
            this.lastSpawnTime = time;
        }
        
        // Update all squirrels with more balanced behavior
        this.squirrels.forEach(squirrel => {
            const data = squirrel.userData;
            const levelData = this.levelData[this.level];
            
            // Calculate distance to player
            const distanceToPlayer = squirrel.position.distanceTo(this.camera.position);
            
            // Add slight randomness to movement direction
            if (time - data.lastDirectionChange > data.directionChangeInterval) {
                const randomOffset = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.3,
                    0,
                    (Math.random() - 0.5) * 0.3
                );
                data.direction.copy(this.camera.position)
                    .sub(squirrel.position)
                    .normalize()
                    .add(randomOffset)
                    .normalize();
                
                data.lastDirectionChange = time;
                data.directionChangeInterval = 1000 + Math.random() * 2000;
            }
            
            // Attack if close enough
            if (distanceToPlayer < 2) {
                if (!data.lastAttackTime || (time - data.lastAttackTime) > levelData.attackSpeed * 1000) {
                    this.takeDamage(levelData.attackDamage);
                    data.lastAttackTime = time;
                    this.soundManager.playSound('hit');
                }
            }
            
            // More balanced speed scaling based on distance
            let currentSpeed = data.speed;
            const minDistance = 5; // Minimum distance to maintain from player
            
            if (distanceToPlayer < 15) {
                // Gradual speed increase based on distance, with a maximum cap
                const speedMultiplier = Math.min(
                    1.3 + (this.level * 0.1), // Increased multiplier
                    1.8 // Increased maximum speed multiplier cap
                );
                currentSpeed *= speedMultiplier;
                
                // Slow down if too close to player to prevent circling
                if (distanceToPlayer < minDistance) {
                    currentSpeed *= 0.5;
                }
            }
            
            // Apply maximum speed cap
            const maxSpeed = 0.12; // Increased maximum allowed speed
            currentSpeed = Math.min(currentSpeed, maxSpeed);
            
            // Calculate new position
            const newX = squirrel.position.x + data.direction.x * currentSpeed;
            const newZ = squirrel.position.z + data.direction.z * currentSpeed;
            
            // Keep within bounds and maintain minimum distance from other squirrels
            if (Math.abs(newX) < 40 && Math.abs(newZ) < 40) {
                let canMove = true;
                
                // Check distance from other squirrels
                for (const otherSquirrel of this.squirrels) {
                    if (otherSquirrel !== squirrel) {
                        const distance = Math.sqrt(
                            Math.pow(newX - otherSquirrel.position.x, 2) +
                            Math.pow(newZ - otherSquirrel.position.z, 2)
                        );
                        if (distance < 1.5) { // Minimum distance between squirrels
                            canMove = false;
                            break;
                        }
                    }
                }
                
                if (canMove) {
                    squirrel.position.x = newX;
                    squirrel.position.z = newZ;
                }
            }
            
            // Rotate squirrel to face movement direction
            squirrel.rotation.y = Math.atan2(data.direction.x, data.direction.z);
        });
    }

    updatePowerUps() {
        const time = performance.now();
        
        // Check if current powerup has expired
        if (this.currentNutType !== 'normal' && time > this.powerUpEndTime) {
            // Reset to normal nuts
            if (this.currentNutType === 'rapid') {
                this.stopRapidFire();
            }
            this.currentNutType = 'normal';
            this.nutCooldown = this.nutTypes[this.currentNutType].cooldown || 0.5;
            this.updateUI();
        }
        
        // Check if shield has expired
        if (this.isShielded && time > this.shieldEndTime) {
            this.deactivateShield();
        }
        
        // Spawn new weapon power-up
        if (time - this.lastPowerUpTime > this.powerUpInterval * 1000) {
            this.createPowerUp();
            this.lastPowerUpTime = time;
        }
        
        // Spawn new health power-up
        if (time - this.lastHealthPowerUpTime > this.healthPowerUpInterval * 1000) {
            this.createHealthPowerUp();
            this.lastHealthPowerUpTime = time;
        }
        
        // Spawn new shield power-up
        if (time - this.lastShieldPowerUpTime > this.shieldPowerUpInterval * 1000) {
            this.createShieldPowerUp();
            this.lastShieldPowerUpTime = time;
        }
        
        // Check for power-up collection
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const powerUp = this.powerUps[i];
            const distance = powerUp.position.distanceTo(this.camera.position);
            
            if (distance < 2) {
                // End previous powerup effects
                if (this.currentNutType === 'rapid') {
                    this.stopRapidFire();
                }
                
                this.currentNutType = powerUp.userData.type;
                this.nutCooldown = this.nutTypes[this.currentNutType].cooldown || 0.5;
                this.powerUpEndTime = time + this.powerUpDuration;
                
                // Start rapid fire if applicable
                if (this.currentNutType === 'rapid') {
                    this.startRapidFire();
                }
                
                // Show powerup notification
                this.showPowerUpNotification(this.currentNutType);
                
                // Remove powerup object
                this.scene.remove(powerUp);
                this.powerUps.splice(i, 1);
                this.updateUI();
            }
        }
        
        // Check for health power-up collection
        for (let i = this.healthPowerUps.length - 1; i >= 0; i--) {
            const healthPowerUp = this.healthPowerUps[i];
            const distance = healthPowerUp.position.distanceTo(this.camera.position);
            
            // Update pulsing animation
            if (healthPowerUp.userData.pulsing) {
                healthPowerUp.userData.pulsePhase += 0.05;
                const scale = 1.0 + 0.1 * Math.sin(healthPowerUp.userData.pulsePhase);
                healthPowerUp.scale.set(scale, scale, scale);
                healthPowerUp.rotation.y += 0.02;
            }
            
            if (distance < 2) {
                // Add health to player
                this.health = Math.min(this.maxHealth, this.health + this.healthPowerUpAmount);
                
                // Show health notification
                this.showPowerUpNotification('health');
                
                // Remove health powerup object
                this.scene.remove(healthPowerUp);
                this.healthPowerUps.splice(i, 1);
                this.updateUI();
                
                // Play sound
                this.soundManager.playSound('hit');
            }
        }
        
        // Check for shield power-up collection
        for (let i = this.shieldPowerUps.length - 1; i >= 0; i--) {
            const shieldPowerUp = this.shieldPowerUps[i];
            const distance = shieldPowerUp.position.distanceTo(this.camera.position);
            
            // Update pulsing animation
            if (shieldPowerUp.userData.pulsing) {
                shieldPowerUp.userData.pulsePhase += 0.05;
                const scale = 1.0 + 0.1 * Math.sin(shieldPowerUp.userData.pulsePhase);
                shieldPowerUp.scale.set(scale, scale, scale);
                shieldPowerUp.rotation.y += 0.02;
            }
            
            if (distance < 2) {
                // Activate shield effect
                this.activateShield();
                
                // Remove shield powerup object
                this.scene.remove(shieldPowerUp);
                this.shieldPowerUps.splice(i, 1);
                
                // Play sound
                this.soundManager.playSound('hit');
            }
        }
    }

    showPowerUpNotification(type) {
        // Create or update notification
        let notification = document.getElementById('powerup-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'powerup-notification';
            notification.style.position = 'absolute';
            notification.style.bottom = '50px';
            notification.style.left = '50%';
            notification.style.transform = 'translateX(-50%)';
            notification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            notification.style.color = 'white';
            notification.style.padding = '10px 20px';
            notification.style.borderRadius = '20px';
            notification.style.fontFamily = 'Arial, sans-serif';
            notification.style.fontSize = '18px';
            notification.style.fontWeight = 'bold';
            notification.style.transition = 'opacity 0.5s';
            notification.style.textAlign = 'center';
            document.getElementById('game-ui').appendChild(notification);
        }
        
        // Set content based on powerup type
        let message = '';
        let color = '';
        switch (type) {
            case 'explosive':
                message = 'EXPLOSIVE NUTS: Area damage!';
                color = '#ff5500';
                break;
            case 'rapid':
                message = 'RAPID FIRE: Auto-shooting!';
                color = '#ffff00';
                break;
            case 'health':
                message = `HEALTH BOOST: +${this.healthPowerUpAmount} HP!`;
                color = '#00ff00';
                break;
            case 'shield':
                message = 'SHIELD ACTIVATED: Invincible for 8 seconds!';
                color = '#0088ff';
                break;
        }
        
        notification.textContent = message;
        notification.style.borderBottom = `3px solid ${color}`;
        notification.style.opacity = '1';
        
        // Fade out after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
        }, 3000);
    }

    startNextLevel() {
        if (this.level < this.maxLevel) {
            this.level++;
            this.levelScore = 0;
            this.isLevelComplete = false;
            
            // Heal player partially when completing a level
            this.health = Math.min(this.maxHealth, this.health + 30);
            
            // Update game parameters based on new level
            const levelData = this.levelData[this.level];
            this.maxSquirrels = levelData.squirrels;
            this.spawnInterval = levelData.spawnInterval;
            
            // Clear existing squirrels
            this.squirrels.forEach(squirrel => this.scene.remove(squirrel));
            this.squirrels = [];
            
            // Create new squirrels for the level
            this.createSquirrels();
            
            this.updateUI();
        }
    }

    takeDamage(amount) {
        if (!this.isGameOver && !this.isShielded) { // Only take damage if not shielded
            this.health = Math.max(0, this.health - amount);
            if (this.health <= 0) {
                this.gameOver();
            }
            this.updateUI();
        }
    }

    gameOver() {
        this.isGameOver = true;
        this.controls.unlock();
        this.updateUI();
    }

    updateStamina(delta) {
        // Handle sprinting stamina mechanics
        if (this.isSprinting && (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight)) {
            // Drain stamina while sprinting
            this.stamina = Math.max(0, this.stamina - this.staminaDrainRate * delta);
            
            // Lock out sprinting if stamina is completely drained
            if (this.stamina <= 0) {
                this.isSprinting = false;
                this.canSprint = false;
            }
        } else {
            // Regenerate stamina when not sprinting
            this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * delta);
            
            // Allow sprinting again once stamina recovers past threshold
            if (!this.canSprint && this.stamina > this.staminaLockoutThreshold) {
                this.canSprint = true;
            }
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.controls.isLocked) {
            const time = performance.now();
            const delta = (time - this.prevTime) / 1000;

            // Reset velocity
            this.velocity.x = 0;
            this.velocity.z = 0;

            // Calculate movement direction
            this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
            this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
            this.direction.normalize();

            // Update stamina
            this.updateStamina(delta);

            // Calculate speed based on sprint state
            let currentSpeed = this.moveSpeed;
            if (this.isSprinting && this.stamina > 0) {
                currentSpeed *= this.sprintMultiplier;
            }

            // Apply movement with consistent speed
            if (this.moveForward || this.moveBackward) {
                this.velocity.z = this.direction.z * currentSpeed;
            }
            if (this.moveLeft || this.moveRight) {
                this.velocity.x = this.direction.x * currentSpeed;
            }

            // Calculate new position
            const moveAmount = delta * 60;
            const newX = this.camera.position.x + (this.velocity.x * moveAmount);
            const newZ = this.camera.position.z + (this.velocity.z * moveAmount);

            // Wall collision detection
            const playerRadius = 1; // Player collision radius
            const wallDistance = 29; // Distance from center to walls

            let canMoveX = true;
            let canMoveZ = true;

            // Check X-axis movement
            if (Math.abs(newX) > wallDistance - playerRadius) {
                canMoveX = false;
                // Push player back if they're too close to or beyond the wall
                if (Math.abs(this.camera.position.x) > wallDistance - playerRadius) {
                    this.camera.position.x = Math.sign(this.camera.position.x) * (wallDistance - playerRadius);
                }
            }

            // Check Z-axis movement
            if (Math.abs(newZ) > wallDistance - playerRadius) {
                canMoveZ = false;
                // Push player back if they're too close to or beyond the wall
                if (Math.abs(this.camera.position.z) > wallDistance - playerRadius) {
                    this.camera.position.z = Math.sign(this.camera.position.z) * (wallDistance - playerRadius);
                }
            }

            // Apply movement only in valid directions
            if (canMoveX) {
                this.controls.moveRight(this.velocity.x * moveAmount);
            }
            if (canMoveZ) {
                this.controls.moveForward(this.velocity.z * moveAmount);
            }

            // Keep camera at fixed height
            this.camera.position.y = 1.6;

            this.updateNuts();
            this.updateSquirrels();
            this.updatePowerUps();
            this.updateUI(); // Update UI every frame to show stamina
            this.renderer.render(this.scene, this.camera);
            this.prevTime = time;
        } else {
            // Keep rendering even when controls are not locked
            this.renderer.render(this.scene, this.camera);
        }
    }
}

// Start the game
const game = new Game(); 