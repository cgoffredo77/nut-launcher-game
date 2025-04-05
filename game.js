import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Game Version 1.1.0 - Latest update with boss fight enhancements

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
        // Initialize basic properties
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

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

        // Hide loading status and title screen
        document.getElementById('loading-status').style.display = 'none';
        document.getElementById('title-screen').style.display = 'none';
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
            if (this.isGameOver) return; // Prevent actions if game is over

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

            if (this.isGameOver) return; // Prevent movement if game is over

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
            if (this.isGameOver) return; // Prevent actions if game is over

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
        ground.userData = { isEnvironment: true };
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
        northWall.userData = { isEnvironment: true };
        this.scene.add(northWall);

        // South wall
        const southWall = new THREE.Mesh(
            new THREE.BoxGeometry(60, wallHeight, wallThickness),
            wallMaterial
        );
        southWall.position.set(0, wallHeight/2, 30);
        southWall.castShadow = true;
        southWall.receiveShadow = true;
        southWall.userData = { isEnvironment: true };
        this.scene.add(southWall);

        // East wall
        const eastWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, 60),
            wallMaterial
        );
        eastWall.position.set(30, wallHeight/2, 0);
        eastWall.castShadow = true;
        eastWall.receiveShadow = true;
        eastWall.userData = { isEnvironment: true };
        this.scene.add(eastWall);

        // West wall
        const westWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, 60),
            wallMaterial
        );
        westWall.position.set(-30, wallHeight/2, 0);
        westWall.castShadow = true;
        westWall.receiveShadow = true;
        westWall.userData = { isEnvironment: true };
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
            grass.userData = { isEnvironment: true };
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
            tree.userData = { isEnvironment: true };
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
        
        // Make the boss even bigger
        boss.scale.set(5, 5, 5); // Increased from 3 to 5
        
        // Give boss a distinct color and glow
        boss.children.forEach(child => {
            if (child.material) {
                if (child.material.color) {
                    child.material = child.material.clone();
                    child.material.color.setHex(0x8B0000); // Dark red
                    child.material.emissive = new THREE.Color(0x400000); // Red glow
                    child.material.emissiveIntensity = 0.5;
                }
            }
        });

        // Add crown to identify as boss
        const crownGeometry = new THREE.ConeGeometry(0.15, 0.3, 5);
        const crownMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xFFD700, // Gold
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0xFFD700,
            emissiveIntensity: 0.5
        });
        
        // Create multiple spikes for the crown
        for (let i = 0; i < 5; i++) {
            const spike = new THREE.Mesh(crownGeometry, crownMaterial);
            const angle = (Math.PI * 2 * i) / 5;
            spike.position.set(
                Math.cos(angle) * 0.2,
                0.75, // Position above head
                Math.sin(angle) * 0.2 + 0.45 // Offset to center on head
            );
            boss.add(spike);
        }

        // Set boss position - fix floating by setting Y to proper ground level
        boss.position.set(0, 0.225 * 5, -25); // Scale Y position by boss scale (5) to match ground
        
        // Add boss properties
        const levelData = this.levelData[this.level];
        boss.userData = {
            isBoss: true,
            health: levelData.bossHealth,
            maxHealth: levelData.bossHealth,
            direction: new THREE.Vector3(),
            speed: levelData.bossSpeed,
            lastAttackTime: 0,
            lastRangedAttackTime: 0,
            lastLeapAttackTime: 0,
            lastAreaAttackTime: 0,
            lastDirectionChange: performance.now(),
            directionChangeInterval: 3000,
            currentState: 'chase', // chase, ranged, leap, area
            stateChangeTime: performance.now(),
            attackCooldowns: {
                melee: 3000, // Basic attack
                ranged: 5000, // Throwing attack
                leap: 12000, // Jumps at player
                area: 15000 // Area effect attack
            },
            stateDuration: {
                ranged: 5000,
                leap: 3000,
                area: 4000
            },
            inLeapAttack: false,
            leapTarget: new THREE.Vector3(),
            leapHeight: 0,
            leapProgress: 0,
            leapStartPosition: new THREE.Vector3()
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
            
            // Update position - apply custom logic for enemy projectiles
            if (nut.userData.isEnemyProjectile) {
                nut.position.add(nut.userData.velocity);
                nut.rotation.x += 0.1;
                nut.rotation.y += 0.1;
                
                // Update lifetime and remove old projectiles
                nut.userData.lifetime += 0.016; // Approximately one frame at 60fps
                if (nut.userData.lifetime > 5) { // Remove after 5 seconds
                    this.scene.remove(nut);
                    this.nuts.splice(i, 1);
                    continue;
                }
                
                // Check for collision with player
                const distanceToPlayer = nut.position.distanceTo(this.camera.position);
                if (distanceToPlayer < 1.5) {
                    // Player hit by projectile
                    if (!this.isShielded) {
                        this.takeDamage(nut.userData.damage);
                        this.soundManager.playSound('hit');
                        
                        // Apply slight screen shake
                        this.applyScreenShake(0.2, 200);
                    }
                    
                    // Remove projectile
                    this.scene.remove(nut);
                    this.nuts.splice(i, 1);
                    continue;
                }
            } else {
                // Normal player projectile update logic
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
            }

            // Check for collisions
            let hitSomething = false;

            // Check boss collision first
            if (this.boss && !nut.userData.isEnemyProjectile) { // Only player projectiles can damage boss
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
            if (!hitSomething && !nut.userData.isEnemyProjectile) { // Only player projectiles damage squirrels
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
        explosion.userData = { isEffect: true }; // Mark as visual effect
        this.scene.add(explosion);
        
        // Damage squirrels in radius
        for (let i = this.squirrels.length - 1; i >= 0; i--) {
            const squirrel = this.squirrels[i];
            const distance = position.distanceTo(squirrel.position);
            if (distance < radius) {
                this.killSquirrel(squirrel, i);
            }
        }
        
        // Also damage boss if in radius (but only from player explosions)
        if (this.boss && !explosion.userData.fromBoss) {
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
        
        return explosion;
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
            
            // Boss state machine
            if (bossData.inLeapAttack) {
                // Special case for leap attack animation
                this.updateBossLeapAttack();
            } else {
                // Check if we need to change state
                const stateElapsed = time - bossData.stateChangeTime;
                
                if (bossData.currentState !== 'chase' && 
                    stateElapsed > bossData.stateDuration[bossData.currentState]) {
                    // Return to chase state after attack states
                    bossData.currentState = 'chase';
                    bossData.stateChangeTime = time;
                } else if (bossData.currentState === 'chase') {
                    // Decide if we should enter an attack state
                    if (distanceToPlayer < 20) {
                        // Perform ranged attack if ready
                        if (time - bossData.lastRangedAttackTime > bossData.attackCooldowns.ranged) {
                            bossData.currentState = 'ranged';
                            bossData.stateChangeTime = time;
                            bossData.lastRangedAttackTime = time;
                            
                            // Prepare ranged attack
                            this.bossPrepareRangedAttack();
                        }
                        // Perform leap attack if ready
                        else if (distanceToPlayer > 8 && 
                                 time - bossData.lastLeapAttackTime > bossData.attackCooldowns.leap) {
                            bossData.currentState = 'leap';
                            bossData.stateChangeTime = time;
                            bossData.lastLeapAttackTime = time;
                            
                            // Start leap attack
                            this.bossStartLeapAttack();
                        }
                        // Perform area attack if ready and close enough
                        else if (distanceToPlayer < 10 && 
                                 time - bossData.lastAreaAttackTime > bossData.attackCooldowns.area) {
                            bossData.currentState = 'area';
                            bossData.stateChangeTime = time;
                            bossData.lastAreaAttackTime = time;
                            
                            // Perform area attack
                            this.bossAreaAttack();
                        }
                        // Perform melee attack if ready and close enough
                        else if (distanceToPlayer < 5 && 
                                 time - bossData.lastAttackTime > bossData.attackCooldowns.melee) {
                            this.bossMeleeAttack();
                    bossData.lastAttackTime = time;
                        }
                    }
                }

                // Update boss based on current state
                switch (bossData.currentState) {
                    case 'chase':
                        this.updateBossChase();
                        break;
                    case 'ranged':
                        this.updateBossRangedAttack();
                        break;
                    case 'area':
                        // Animation handled in bossAreaAttack
                        break;
                    // 'leap' state is handled by updateBossLeapAttack
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
            
            // Ensure boss is removed when moving to next level
            if (this.boss) {
                this.scene.remove(this.boss);
                this.boss = null;
            }
            
            // Extra cleanup for level transition from boss to level 4
            if (this.level === 4) {
                // Force a deep cleanup of the scene before creating new environment
                this.forceDeepCleanup();
            }
            
            // Clear existing environment elements
            this.clearEnvironment();
            
            // Create new environment based on level
            if (this.level === 3) {
                // Create boss arena for level 3
                this.createBossArena();
                
                // Show level transition message
                this.showLevelTransitionMessage("Boss Level: The Lair of the Squirrel King");
            } else {
                // Create standard environment for other levels
                this.createGround();
                
                // Reset lighting and fog if coming from boss level
                if (this.level === 4) {
                    this.resetStandardLighting();
                    this.scene.fog = null; // Remove fog
                    
                    // Show level transition message
                    this.showLevelTransitionMessage("You've defeated the Squirrel King! Return to the forest...");
                } else if (this.level === 2) {
                    this.showLevelTransitionMessage("Level 2: More squirrels await...");
                } else if (this.level === 5) {
                    this.showLevelTransitionMessage("Final Level: The Ultimate Challenge");
                }
            }
            
            // Create new squirrels for the level
            this.createSquirrels();
            
            this.updateUI();
        }
    }

    showLevelTransitionMessage(message) {
        // Create or get message container
        let msgContainer = document.getElementById('level-transition-message');
        if (!msgContainer) {
            msgContainer = document.createElement('div');
            msgContainer.id = 'level-transition-message';
            msgContainer.style.position = 'absolute';
            msgContainer.style.top = '30%';
            msgContainer.style.left = '50%';
            msgContainer.style.transform = 'translate(-50%, -50%)';
            msgContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            msgContainer.style.color = 'white';
            msgContainer.style.padding = '20px 40px';
            msgContainer.style.borderRadius = '10px';
            msgContainer.style.fontFamily = 'Arial, sans-serif';
            msgContainer.style.fontSize = '24px';
            msgContainer.style.fontWeight = 'bold';
            msgContainer.style.textAlign = 'center';
            msgContainer.style.zIndex = '1000';
            msgContainer.style.opacity = '0';
            msgContainer.style.transition = 'opacity 1s ease-in-out';
            document.getElementById('game-ui').appendChild(msgContainer);
        }
        
        // Set message and animate
        msgContainer.textContent = message;
        msgContainer.style.opacity = '1';
        
        // Fade out after 3 seconds
        setTimeout(() => {
            msgContainer.style.opacity = '0';
        }, 3000);
    }

    resetStandardLighting() {
        // Remove existing lights from boss level
        this.scene.children.forEach(child => {
            if (child instanceof THREE.AmbientLight || child instanceof THREE.DirectionalLight) {
                this.scene.remove(child);
            }
        });
        
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
        
        // Reset sky to blue
        this.updateSkyForStandardLevel();
    }

    updateSkyForStandardLevel() {
        // Find existing sky
        let sky = null;
        this.scene.children.forEach(child => {
            if (child.userData && child.userData.isSky) {
                sky = child;
            }
        });
        
        if (sky) {
            this.scene.remove(sky);
        }
        
        // Create blue sky
        const skyGeometry = new THREE.SphereGeometry(100, 32, 32);
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) }, // Blue
                bottomColor: { value: new THREE.Color(0xffffff) }, // White
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
        const newSky = new THREE.Mesh(skyGeometry, skyMaterial);
        newSky.userData = { isEnvironment: true, isSky: true };
        this.scene.add(newSky);
    }

    clearEnvironment() {
        // Remove all environment elements like ground, walls, trees, etc.
        for (let i = this.scene.children.length - 1; i >= 0; i--) {
            const child = this.scene.children[i];
            
            // Check if the object is part of the environment
            if (child.userData && (child.userData.isEnvironment || child.userData.isEffect || child.userData.isLeapTarget || child.userData.fromBoss)) {
                this.scene.remove(child);
            }
            
            // Also remove any meshes that are likely to be attack effects by checking their material properties
            if (child.type === 'Mesh') {
                // Check for red materials (likely to be attack effects)
                if (child.material) {
                    if (child.material.color) {
                        // Check if the material is reddish
                        const color = child.material.color;
                        if ((color.r > 0.7 && color.g < 0.5 && color.b < 0.5) || // Red
                            (color.r > 0.9 && color.g < 0.6)) { // Orange-red (explosions)
                            this.scene.remove(child);
                        }
                    }
                    // Check for emissive materials (likely to be effects)
                    if (child.material.emissive && 
                       (child.material.emissiveIntensity > 0.2 || child.material.transparent)) {
                        this.scene.remove(child);
                    }
                }
            }
            
            // Remove any plane geometry that might be at ground level
            if (child.geometry && 
                (child.geometry.type === 'CircleGeometry' || 
                 child.geometry.type === 'RingGeometry' ||
                 child.geometry.type === 'PlaneGeometry') &&
                Math.abs(child.position.y) < 0.2) {
                this.scene.remove(child);
            }
        }
        
        // Clear any animated objects
        if (this.animatedObjects) {
            this.animatedObjects = [];
        }
    }

    createBossArena() {
        // Create lava ground
        const groundGeometry = new THREE.PlaneGeometry(60, 60);
        const lavaMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B0000, // Dark red base color
            emissive: 0xff3300, // Lava glow
            emissiveIntensity: 0.5,
            roughness: 0.7,
            metalness: 0.3
        });
        const ground = new THREE.Mesh(groundGeometry, lavaMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        ground.userData = { isEnvironment: true };
        this.scene.add(ground);

        // Create lava cracks (glowing lines)
        for (let i = 0; i < 20; i++) {
            // Create a random lava crack
            const crackWidth = 0.1 + Math.random() * 0.3;
            const crackLength = 5 + Math.random() * 15;
            const crackGeometry = new THREE.PlaneGeometry(crackWidth, crackLength);
            const crackMaterial = new THREE.MeshBasicMaterial({
                color: 0xff5500,
                emissive: 0xffcc00,
                emissiveIntensity: 1.0,
                side: THREE.DoubleSide
            });
            
            const crack = new THREE.Mesh(crackGeometry, crackMaterial);
            crack.rotation.x = -Math.PI / 2;
            crack.rotation.z = Math.random() * Math.PI;
            crack.position.set(
                Math.random() * 50 - 25,
                0.05, // Slightly above ground
                Math.random() * 50 - 25
            );
            crack.userData = { isEnvironment: true };
            this.scene.add(crack);
            
            // Add pulsing animation to crack
            const initialIntensity = crackMaterial.emissiveIntensity;
            const flickerSpeed = 0.01 + Math.random() * 0.02;
            
            crack.userData.update = (time) => {
                // Pulsing glow
                crackMaterial.emissiveIntensity = initialIntensity * (0.7 + 0.5 * Math.sin(time * flickerSpeed));
            };
            
            if (!this.animatedObjects) this.animatedObjects = [];
            this.animatedObjects.push(crack);
        }

        // Add lava pools (circular areas of brighter lava)
        for (let i = 0; i < 8; i++) {
            const poolRadius = 2 + Math.random() * 3;
            const poolGeometry = new THREE.CircleGeometry(poolRadius, 32);
            const poolMaterial = new THREE.MeshBasicMaterial({
                color: 0xff3300,
                side: THREE.DoubleSide
            });
            
            const pool = new THREE.Mesh(poolGeometry, poolMaterial);
            pool.rotation.x = -Math.PI / 2;
            pool.position.set(
                Math.random() * 40 - 20,
                0.06, // Slightly above ground
                Math.random() * 40 - 20
            );
            pool.userData = { isEnvironment: true };
            this.scene.add(pool);
        }

        // Add dark stone walls
        const wallHeight = 10; // Taller than regular walls
        const wallThickness = 1.5;
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111, // Very dark
            roughness: 0.9,
            metalness: 0.1,
            map: this.createStoneBrickTexture()
        });

        // North wall
        const northWall = new THREE.Mesh(
            new THREE.BoxGeometry(60, wallHeight, wallThickness),
            wallMaterial
        );
        northWall.position.set(0, wallHeight/2, -30);
        northWall.castShadow = true;
        northWall.receiveShadow = true;
        northWall.userData = { isEnvironment: true };
        this.scene.add(northWall);

        // South wall
        const southWall = new THREE.Mesh(
            new THREE.BoxGeometry(60, wallHeight, wallThickness),
            wallMaterial
        );
        southWall.position.set(0, wallHeight/2, 30);
        southWall.castShadow = true;
        southWall.receiveShadow = true;
        southWall.userData = { isEnvironment: true };
        this.scene.add(southWall);

        // East wall
        const eastWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, 60),
            wallMaterial
        );
        eastWall.position.set(30, wallHeight/2, 0);
        eastWall.castShadow = true;
        eastWall.receiveShadow = true;
        eastWall.userData = { isEnvironment: true };
        this.scene.add(eastWall);

        // West wall
        const westWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, 60),
            wallMaterial
        );
        westWall.position.set(-30, wallHeight/2, 0);
        westWall.castShadow = true;
        westWall.receiveShadow = true;
        westWall.userData = { isEnvironment: true };
        this.scene.add(westWall);

        // Add pillars in corners
        const pillarGeometry = new THREE.CylinderGeometry(1.5, 2, 10, 8);
        const pillarMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.8,
            metalness: 0.3,
            map: this.createStoneBrickTexture()
        });
        
        // Add pillars in corners
        const corners = [
            { x: -25, z: -25 },
            { x: 25, z: -25 },
            { x: -25, z: 25 },
            { x: 25, z: 25 }
        ];
        
        corners.forEach(corner => {
            const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
            pillar.position.set(corner.x, 5, corner.z);
            pillar.castShadow = true;
            pillar.receiveShadow = true;
            pillar.userData = { isEnvironment: true };
            this.scene.add(pillar);
            
            // Add torch fire on top of pillar
            this.addTorch(corner.x, 10, corner.z);
        });
        
        // Add more pillars along walls
        for (let i = 0; i < 4; i++) {
            // North wall pillars
            const northPillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
            northPillar.position.set(-15 + i * 10, 5, -28);
            northPillar.castShadow = true;
            northPillar.receiveShadow = true;
            northPillar.userData = { isEnvironment: true };
            this.scene.add(northPillar);
            
            // South wall pillars
            const southPillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
            southPillar.position.set(-15 + i * 10, 5, 28);
            southPillar.castShadow = true;
            southPillar.receiveShadow = true;
            southPillar.userData = { isEnvironment: true };
            this.scene.add(southPillar);
            
            // Add torches to some pillars
            if (i % 2 === 0) {
                this.addTorch(-15 + i * 10, 8, -27);
                this.addTorch(-15 + i * 10, 8, 27);
            }
        }

        // Add skulls and bones props
        for (let i = 0; i < 15; i++) {
            this.addSkull(
                Math.random() * 50 - 25,
                0.1,
                Math.random() * 50 - 25
            );
        }

        // Add dramatic lighting
        this.setupBossLighting();
        
        // Change sky to dark red
        this.updateSkyForBossFight();
    }

    createStoneBrickTexture() {
        // Create a simple procedural brick texture
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Fill background
        ctx.fillStyle = '#222222';
        ctx.fillRect(0, 0, 256, 256);
        
        // Draw brick pattern
        ctx.fillStyle = '#333333';
        
        // Draw horizontal lines
        for (let y = 0; y < 256; y += 32) {
            ctx.fillRect(0, y, 256, 2);
        }
        
        // Draw vertical lines with offset for brick pattern
        for (let x = 0; x < 256; x += 64) {
            for (let y = 0; y < 256; y += 64) {
                ctx.fillRect(x, y, 2, 30);
                ctx.fillRect(x + 32, y + 32, 2, 30);
            }
        }
        
        // Add some noise/texture
        for (let i = 0; i < 1000; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const size = 1 + Math.random() * 2;
            
            ctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.3})`;
            ctx.fillRect(x, y, size, size);
            
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.1})`;
            ctx.fillRect(x + 1, y + 1, size, size);
        }
        
        // Create texture
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        
        return texture;
    }

    addTorch(x, y, z) {
        // Create torch base
        const torchBaseGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.8, 8);
        const torchBaseMaterial = new THREE.MeshStandardMaterial({
            color: 0x5D4037, // Brown
            roughness: 0.9
        });
        const torchBase = new THREE.Mesh(torchBaseGeometry, torchBaseMaterial);
        torchBase.position.set(x, y, z);
        torchBase.castShadow = true;
        torchBase.userData = { isEnvironment: true };
        this.scene.add(torchBase);
        
        // Create fire effect
        const fireGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        const fireMaterial = new THREE.MeshBasicMaterial({
            color: 0xff5500,
            transparent: true,
            opacity: 0.9
        });
        const fire = new THREE.Mesh(fireGeometry, fireMaterial);
        fire.position.set(x, y + 0.7, z);
        fire.userData = { isEnvironment: true };
        this.scene.add(fire);
        
        // Add point light at fire location
        const light = new THREE.PointLight(0xff5500, 2, 15);
        light.position.set(x, y + 0.7, z);
        light.castShadow = true;
        light.shadow.mapSize.width = 512;
        light.shadow.mapSize.height = 512;
        light.userData = { isEnvironment: true };
        this.scene.add(light);
        
        // Animate fire
        if (!this.animatedObjects) this.animatedObjects = [];
        
        const initialScale = fire.scale.clone();
        const initialIntensity = light.intensity;
        
        fire.userData.update = (time) => {
            // Random flicker
            const flicker = 0.8 + 0.4 * Math.random();
            fire.scale.set(
                initialScale.x * flicker,
                initialScale.y * (flicker * 1.2),
                initialScale.z * flicker
            );
            
            // Color shifts slightly
            const hue = 0.05 + 0.05 * Math.random(); // Slight variation in orange/red
            fire.material.color.setHSL(hue, 1, 0.5);
            
            // Light intensity varies
            light.intensity = initialIntensity * flicker;
        };
        
        this.animatedObjects.push(fire);
    }

    addSkull(x, y, z) {
        // Simple skull
        const skullGroup = new THREE.Group();
        
        // Skull base (cranium)
        const craniumGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        craniumGeometry.scale(1, 0.8, 1.2); // Elongate slightly
        
        const skullMaterial = new THREE.MeshStandardMaterial({
            color: 0xEEEEEE,
            roughness: 0.9
        });
        
        const cranium = new THREE.Mesh(craniumGeometry, skullMaterial);
        skullGroup.add(cranium);
        
        // Jaw
        const jawGeometry = new THREE.BoxGeometry(0.4, 0.2, 0.3);
        const jaw = new THREE.Mesh(jawGeometry, skullMaterial);
        jaw.position.set(0, -0.3, 0.2);
        skullGroup.add(jaw);
        
        // Eye sockets
        const socketGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        const socketMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        
        const leftEye = new THREE.Mesh(socketGeometry, socketMaterial);
        leftEye.position.set(-0.15, 0, 0.3);
        skullGroup.add(leftEye);
        
        const rightEye = new THREE.Mesh(socketGeometry, socketMaterial);
        rightEye.position.set(0.15, 0, 0.3);
        skullGroup.add(rightEye);
        
        // Random rotation
        skullGroup.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );
        
        skullGroup.position.set(x, y, z);
        skullGroup.userData = { isEnvironment: true };
        this.scene.add(skullGroup);
        
        return skullGroup;
    }

    setupBossLighting() {
        // Remove existing ambient light
        this.scene.children.forEach(child => {
            if (child instanceof THREE.AmbientLight || child instanceof THREE.DirectionalLight) {
                this.scene.remove(child);
            }
        });
        
        // Add dim ambient light
        const ambientLight = new THREE.AmbientLight(0x330000, 0.3); // Dark red ambient
        this.scene.add(ambientLight);
        
        // Add dim directional light
        const directionalLight = new THREE.DirectionalLight(0xff3300, 0.5);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);
        
        // Add red fog
        this.scene.fog = new THREE.FogExp2(0x330000, 0.01);
    }

    updateSkyForBossFight() {
        // Find existing sky
        let sky = null;
        this.scene.children.forEach(child => {
            if (child.userData && child.userData.isSky) {
                sky = child;
            }
        });
        
        if (sky) {
            this.scene.remove(sky);
        }
        
        // Create dark red sky
        const skyGeometry = new THREE.SphereGeometry(100, 32, 32);
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x660000) }, // Dark red
                bottomColor: { value: new THREE.Color(0x000000) }, // Black
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
        const newSky = new THREE.Mesh(skyGeometry, skyMaterial);
        newSky.userData = { isEnvironment: true, isSky: true };
        this.scene.add(newSky);
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

        // Stop player movement and actions
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.isSprinting = false;
        this.isRapidFiring = false;
        clearInterval(this.rapidFireInterval);
        this.rapidFireInterval = null;

        // Remove all enemies
        this.squirrels.forEach(squirrel => this.scene.remove(squirrel));
        this.squirrels = [];

        // Remove boss if present
        if (this.boss) {
            this.scene.remove(this.boss);
            this.boss = null;
        }
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

            // Update animated objects
            if (this.animatedObjects) {
                this.animatedObjects.forEach(obj => {
                    if (obj.userData && obj.userData.update) {
                        obj.userData.update(time * 0.001);
                    }
                });
            }

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

    // New boss attack methods
    bossMeleeAttack() {
        // Basic melee attack - more damaging than regular squirrels
        const levelData = this.levelData[this.level];
        this.takeDamage(levelData.bossAttackDamage);
        this.soundManager.playSound('hit');
        
        // Visual indication of attack
        this.createAttackVisual(this.boss.position.clone(), 0xff0000, 3);
    }

    bossPrepareRangedAttack() {
        // Visual telegraph that ranged attack is coming
        const bossPosition = this.boss.position.clone();
        
        // Create glowing effect around boss
        const glowGeometry = new THREE.SphereGeometry(3, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.3
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.copy(bossPosition);
        this.scene.add(glow);
        
        // Animate glow
        const glowInterval = setInterval(() => {
            glow.scale.x += 0.05;
            glow.scale.y += 0.05;
            glow.scale.z += 0.05;
            glow.material.opacity -= 0.01;
            
            if (glow.material.opacity <= 0) {
                clearInterval(glowInterval);
                this.scene.remove(glow);
            }
        }, 50);
    }

    updateBossRangedAttack() {
        // Perform ranged attack
        if (performance.now() - this.boss.userData.stateChangeTime > 1500) { // Delay before firing
            // Fire 3 projectiles in burst
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    if (this.boss) { // Make sure boss still exists
                        this.bossFireRangedAttack();
                    }
                }, i * 300); // Fire with slight delay between each
            }
            
            // Reset to chase state
            this.boss.userData.currentState = 'chase';
            this.boss.userData.stateChangeTime = performance.now();
        }
    }

    bossFireRangedAttack() {
        // Create acorn/nut projectile
        const projectileGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const projectileMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x996633,
            roughness: 0.3,
            metalness: 0.2
        });
        const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
        
        // Position at boss
        projectile.position.copy(this.boss.position);
        projectile.position.y += 2; // Adjust to fire from higher position
        
        // Create direction toward player with slight randomness
        const direction = new THREE.Vector3();
        direction.subVectors(this.camera.position, projectile.position).normalize();
        
        // Add slight randomness to direction
        direction.x += (Math.random() - 0.5) * 0.1;
        direction.y += (Math.random() - 0.5) * 0.1;
        direction.z += (Math.random() - 0.5) * 0.1;
        direction.normalize();
        
        // Set velocity
        projectile.userData = {
            isEnemyProjectile: true,
            velocity: direction.multiplyScalar(0.5), // Speed of projectile
            damage: this.levelData[this.level].bossAttackDamage * 0.7, // Slightly less than melee
            lifetime: 0
        };
        
        this.scene.add(projectile);
        
        // Add to the nuts array to reuse existing collision logic
        this.nuts.push(projectile);
        
        // Play sound
        this.soundManager.playSound('launch');
        
        // Add launch visual effect
        this.createAttackVisual(projectile.position.clone(), 0xffcc00, 1.5);
    }

    bossStartLeapAttack() {
        const bossData = this.boss.userData;
        
        // Store the starting position for the leap
        bossData.leapStartPosition.copy(this.boss.position);
        
        // Set leap parameters
        bossData.inLeapAttack = true;
        bossData.leapTarget.copy(this.camera.position);
        bossData.leapProgress = 0;
        bossData.leapHeight = 15; // Maximum height of leap
        
        // Visual telegraph
        const telegraph = new THREE.RingGeometry(5, 5.2, 32);
        const telegraphMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5
        });
        const ring = new THREE.Mesh(telegraph, telegraphMaterial);
        ring.position.copy(this.camera.position);
        ring.position.y = 0.1;
        ring.rotation.x = Math.PI / 2;
        ring.userData = { isLeapTarget: true };
        this.scene.add(ring);
        
        // Animate telegraph ring
        const animateRing = () => {
            if (!this.boss || !this.boss.userData.inLeapAttack) {
                this.scene.remove(ring);
                return;
            }
            
            ring.scale.x += 0.03;
            ring.scale.y += 0.03;
            ring.scale.z += 0.03;
            
            requestAnimationFrame(animateRing);
        };
        
        animateRing();
        
        // Play warning sound
        this.soundManager.playSound('death'); // Reusing death sound for now
    }

    updateBossLeapAttack() {
        const bossData = this.boss.userData;
        
        // Progress the leap animation
        bossData.leapProgress += 0.01; // Reduced from 0.02 to 0.01 to make the jump slower
        
        if (bossData.leapProgress >= 1) {
            // End of leap - land and cause damage in area
            bossData.inLeapAttack = false;
            bossData.currentState = 'chase';
            
            // Fix position to ground level after landing
            this.boss.position.y = 0.225 * 5;
            
            // Create landing impact
            const explosion = this.createExplosion(this.boss.position.clone(), 7);
            if (explosion) {
                explosion.userData.fromBoss = true; // Mark this explosion as coming from the boss
            }
            
            // Damage player if close to landing spot
            const distanceToPlayer = this.boss.position.distanceTo(this.camera.position);
            if (distanceToPlayer < 7) {
                this.takeDamage(this.levelData[this.level].bossAttackDamage * 1.5);
                
                // Apply knockback to player
                const knockbackDir = new THREE.Vector3()
                    .subVectors(this.camera.position, this.boss.position)
                    .normalize()
                    .multiplyScalar(10);
                
                // Move player position
                this.camera.position.add(knockbackDir);
            }
            
            // Remove target indicators
            this.scene.children.forEach(child => {
                if (child.userData && child.userData.isLeapTarget) {
                    this.scene.remove(child);
                }
            });
            
            return;
        }
        
        // Calculate arc of jump using the actual starting position and target position
        const t = bossData.leapProgress;
        
        // Horizontal interpolation (linear)
        this.boss.position.x = (1 - t) * bossData.leapStartPosition.x + t * bossData.leapTarget.x;
        this.boss.position.z = (1 - t) * bossData.leapStartPosition.z + t * bossData.leapTarget.z;
        
        // Vertical position (parabolic)
        const baseHeight = 0.225 * 5; // Base ground-level height for boss
        const heightFactor = 4 * t * (1 - t); // Parabolic curve peaking at t=0.5
        this.boss.position.y = baseHeight + bossData.leapHeight * heightFactor;
        
        // Rotate boss to face forward in jump direction
        const direction = new THREE.Vector3()
            .subVectors(bossData.leapTarget, bossData.leapStartPosition)
            .normalize();
        this.boss.rotation.y = Math.atan2(direction.x, direction.z);
        
        // Add particle trail effect
        if (Math.random() > 0.5) {
            const trailGeometry = new THREE.SphereGeometry(0.3, 8, 8);
            const trailMaterial = new THREE.MeshBasicMaterial({
                color: 0x8B0000,
                transparent: true,
                opacity: 0.7
            });
            const trailParticle = new THREE.Mesh(trailGeometry, trailMaterial);
            trailParticle.position.copy(this.boss.position);
            trailParticle.userData = { 
                isEffect: true,
                lifetime: 1
            };
            this.scene.add(trailParticle);
            
            // Fade out trail
            const fadeInterval = setInterval(() => {
                trailParticle.material.opacity -= 0.05;
                trailParticle.scale.multiplyScalar(0.95);
                
                if (trailParticle.material.opacity <= 0) {
                    clearInterval(fadeInterval);
                    this.scene.remove(trailParticle);
                }
            }, 50);
        }
    }

    bossAreaAttack() {
        // Telegraph the area attack
        const attackRadius = 8; // Range of the attack
        
        // Create a growing ring to telegraph the attack
        const ringGeometry = new THREE.RingGeometry(0.1, 0.4, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.copy(this.boss.position);
        ring.position.y = 0.1;
        ring.rotation.x = Math.PI / 2;
        this.scene.add(ring);
        
        // Flash the boss red
        this.boss.children.forEach(child => {
            if (child.material && child.material.color) {
                child.material.emissiveIntensity = 1.0;
            }
        });
        
        // Show charging animation
        let scale = 1;
        const chargeInterval = setInterval(() => {
            scale += 0.2;
            ring.scale.set(scale, scale, scale);
            
            // Pulse boss size slightly
            this.boss.scale.x = 5 + Math.sin(scale * 0.5) * 0.2;
            this.boss.scale.y = 5 + Math.sin(scale * 0.5) * 0.2;
            this.boss.scale.z = 5 + Math.sin(scale * 0.5) * 0.2;
            
            if (scale >= attackRadius * 2) {
                clearInterval(chargeInterval);
                this.scene.remove(ring);
                
                // Reset boss appearance
                this.boss.scale.set(5, 5, 5);
                this.boss.children.forEach(child => {
                    if (child.material && child.material.emissiveIntensity) {
                        child.material.emissiveIntensity = 0.5;
                    }
                });
                
                // Perform actual attack
                const distanceToPlayer = this.boss.position.distanceTo(this.camera.position);
                if (distanceToPlayer < attackRadius) {
                    this.takeDamage(this.levelData[this.level].bossAttackDamage * 1.2);
                    
                    // Apply screen shake effect
                    this.applyScreenShake(0.5, 500);
                }
                
                // Visual explosion effect
                const explosion = this.createExplosion(this.boss.position.clone(), attackRadius);
                if (explosion) {
                    explosion.userData.fromBoss = true; // Mark this explosion as coming from the boss
                }
                this.soundManager.playSound('death');
            }
        }, 50);
    }

    updateBossChase() {
        const bossData = this.boss.userData;
        const time = performance.now();
        
        // Change direction occasionally
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

        // Move boss
        const newX = this.boss.position.x + bossData.direction.x * bossData.speed;
        const newZ = this.boss.position.z + bossData.direction.z * bossData.speed;
        
        // Keep boss within walls
        const bossRadius = 5;
        const mapBounds = 25;
        this.boss.position.x = Math.max(-mapBounds, Math.min(mapBounds, newX));
        this.boss.position.z = Math.max(-mapBounds, Math.min(mapBounds, newZ));
        
        // Fix boss Y position to ground level (accounting for scale)
        this.boss.position.y = 0.225 * 5; // 0.225 is the base squirrel height, multiplied by boss scale (5)
        
        // Rotate boss to face movement direction
        this.boss.rotation.y = Math.atan2(bossData.direction.x, bossData.direction.z);
    }

    createAttackVisual(position, color, size) {
        const flashGeometry = new THREE.SphereGeometry(size, 16, 16);
        const flashMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.7
        });
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.copy(position);
        flash.userData = { isEffect: true }; // Mark as visual effect
        this.scene.add(flash);
        
        // Fade out quickly
        const fadeInterval = setInterval(() => {
            flash.material.opacity -= 0.1;
            flash.scale.multiplyScalar(1.1);
            
            if (flash.material.opacity <= 0) {
                clearInterval(fadeInterval);
                this.scene.remove(flash);
            }
        }, 50);
    }

    applyScreenShake(intensity, duration) {
        const originalPosition = this.camera.position.clone();
        let elapsed = 0;
        const interval = 20; // ms between shake updates
        
        const shake = () => {
            const offsetX = (Math.random() - 0.5) * intensity;
            const offsetY = (Math.random() - 0.5) * intensity;
            const offsetZ = (Math.random() - 0.5) * intensity;
            
            this.camera.position.set(
                originalPosition.x + offsetX,
                originalPosition.y + offsetY,
                originalPosition.z + offsetZ
            );
            
            elapsed += interval;
            
            if (elapsed < duration) {
                setTimeout(shake, interval);
            } else {
                // Reset to original position
                this.camera.position.copy(originalPosition);
            }
        };
        
        shake();
    }

    forceDeepCleanup() {
        // Create an entirely new, clean scene to replace the current one
        const newScene = new THREE.Scene();
        
        // Keep only essentials: camera, player, UI elements
        // Transfer essential non-environment objects to the new scene
        this.scene.children.forEach(child => {
            // Keep only: camera, directional lights, ambient lights, and fog
            if (child === this.camera ||
                child instanceof THREE.DirectionalLight ||
                child instanceof THREE.AmbientLight) {
                newScene.add(child.clone());
            }
        });
        
        // Replace old scene with new clean scene
        this.scene = newScene;
        
        // Recreate the player controls to point to the new scene
        this.controls = new PointerLockControls(this.camera, document.body);
    }
}

// Initialize game but don't start it
const game = new Game(); 

// Add event listener for the play button
document.getElementById('play-button').addEventListener('click', () => {
    game.init();
}); 