import Phaser from 'phaser';
import './style.css';
import { FagioloOnline, type AdminLeaderboardEntry, type AdminModerationRecord, type AdminPrizeClaim, type LeaderboardEntry, type PlayerPrizeClaim } from './online';

const W = 1664;
const H = 934;
const FLOOR = 768;
const RUN_TIME_SECONDS = 60;
const formatRunTime = (milliseconds: number) => {
  if (milliseconds >= RUN_TIME_SECONDS * 1000) return '—';
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const LEVEL_NAMES = ['OUTER GARDENS', 'INNER RAMPARTS', 'ROYAL KEEP'] as const;
const LEVEL_BACKGROUNDS = [
  '/assets/level-background-generated.webp',
  '/assets/level-2-background.webp',
  '/assets/level-3-background.webp',
] as const;
const LEVEL_STARTS = [0, 0, 0] as const;
const LEVEL_ENDS = [5000, 5000, 5000] as const;
const LEVEL_PLATFORM_Y_OFFSETS = [
  [0, -12, 20, -5, 0, -30, 10, 0, 16, -10, 0, 10, -10, 0],
  // Inner Ramparts: high stair climbs separated by exposed floor drops.
  [0, -38, -72, -18, 0, -48, -85, 0, -42, -84, 0, -42, -88, 0],
  // Royal Keep: broken bridges with varied rises and falls between towers.
  [0, -15, -50, 5, 0, 0, -45, 0, 0, -50, 0, 15, -35, 0],
] as const;
const LEVEL_PLATFORM_X_OFFSETS = [
  [0, -30, 30, -25, 0, 40, -35, 0, 25, -30, 0, -35, 30, 0],
  [0, 25, -15, 40, 0, -20, 30, 0, 20, -10, 0, 25, 10, 0],
  [0, -35, 35, -45, 0, 45, -35, 0, -55, 55, 0, -45, 35, 0],
] as const;
const LEVEL_PLATFORM_WIDTH_OFFSETS = [
  [0, -35, 30, -20, 0, 40, -35, 0, 35, -30, 0, 35, -30, 0],
  [0, -30, -40, 15, 0, -10, -15, 0, 10, 0, 0, -30, -25, 0],
  [0, 35, -25, 30, 0, -10, 40, 0, 35, -45, 0, 25, -30, 0],
] as const;
const LEVEL_GUARD_X_OFFSETS = [
  [0, 0, 0, 0, 0, 0],
  [20, -25, 25, -30, 25, -35],
  [-35, 45, -35, 25, -40, 60],
] as const;
const LEVEL_SPIKE_X_OFFSETS = [
  [0, 0, 0, 0],
  [45, -15, 50, 10],
  [-50, 55, -15, 60],
] as const;
const LEVEL_SPIKE_PHASE_OFFSETS = [0, 0.15, 0.2] as const;
const LEVEL_LASER_X_OFFSETS = [[0, 0, 0], [80, -50, 110], [-30, 95, -105]] as const;
const LEVEL_CRATE_X_OFFSETS = [[0, 0, 0, 0], [80, -25, -50, 70], [-60, 25, 50, -80]] as const;
const LEVEL_BARREL_X_OFFSETS = [0, 120, -120] as const;
const LEVEL_GUARD_PATROL_SPEEDS = [84, 96, 108] as const;
const LEVEL_GUARD_CHASE_SPEEDS = [155, 170, 185] as const;
const LEVEL_REFILL_X = [2500, 2570, 2440] as const;
const LEVEL_EXTRA_LIFE_X = [3680, 3030, 4240] as const;
const LASER_POST_Y = FLOOR;
const LASER_POST_BASE = 413 / 448;
const LASER_EMITTER_SOURCE = { x: 350, y: 104 };
// The emitter aperture sits toward the level center in the post artwork.
const LASER_EMITTER_X_OFFSET = (LASER_EMITTER_SOURCE.x - 256) * 62 / 512;
const LASER_Y = LASER_POST_Y + (LASER_EMITTER_SOURCE.y / 448 - LASER_POST_BASE) * 48;
const platforms = [
  { x: 0, y: FLOOR, w: 585, h: 166 },
  { x: 550, y: 660, w: 230, h: 72 },
  { x: 790, y: 560, w: 220, h: 172 },
  { x: 1025, y: 660, w: 250, h: 72 },
  { x: 1270, y: FLOOR, w: 500, h: 166 },
  { x: 1765, y: 660, w: 225, h: 72 },
  { x: 1995, y: 555, w: 225, h: 177 },
  { x: 2225, y: FLOOR, w: 420, h: 166 },
  { x: 2635, y: 650, w: 250, h: 82 },
  { x: 2890, y: 545, w: 230, h: 187 },
  { x: 3125, y: FLOOR, w: 430, h: 166 },
  { x: 3545, y: 655, w: 250, h: 77 },
  { x: 3798, y: 550, w: 235, h: 182 },
  { x: 4035, y: FLOOR, w: 965, h: 166 },
];

type GuardMode = 'patrol' | 'alert' | 'chase' | 'search' | 'stunned';
type GuardAgent = { x: number; y: number; minX: number; maxX: number; spawnX: number; spawnY: number; spawnDirection: number; spriteHeight: number; direction: number; velocity: number; mode: GuardMode; timer: number; lastSeenX: number; anim: number; gait: number; turning: boolean };
type BeanCoin = { x: number; y: number; taken: boolean; locked?: boolean; crateIndex?: number };
type WoodenCrate = { x: number; surfaceY: number; width: number; height: number; broken: boolean };
type SpikeHazard = { x: number; surfaceY: number; phaseOffset: number };
type LaserGate = { leftPostX: number; rightPostX: number; phaseOffset: number };

class HeistScene extends Phaser.Scene {
  private online = new FagioloOnline();
  private onlineOverlay?: HTMLDivElement;
  private onlineMode: 'signup' | 'login' = 'signup';
  private leaderboardLevel = 1;
  private adminLevel = 1;
  private onlineIsAdmin = false;
  private closedLevels = new Set<number>();
  private levelAvailabilityLoaded = false;
  private gameShortcutSuppressedUntil = 0;
  private leaderboardRunStatus = '';
  private platformSprites: Phaser.GameObjects.Image[] = [];
  private activePlatforms: (typeof platforms[number])[] = [];
  private activePlatformIndices: number[] = [];
  private readonly sourcePlatforms = platforms.map(platform => ({ ...platform }));
  private courseWidth = LEVEL_ENDS[0] - LEVEL_STARTS[0];
  private activeCoinCount = 0;
  private raidBonusTarget = 0;
  private raidBonusAwarded = false;
  private landingSquash = 0;
  private art!: Phaser.GameObjects.Graphics;
  private guardLightArt!: Phaser.GameObjects.Graphics;
  private worldStaticArt!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private modalArt!: Phaser.GameObjects.Graphics;
  private player = { x: 300, y: 690, vx: 0, vy: 0, grounded: false };
  private coins: BeanCoin[] = [
    { x: 368, y: 678, taken: false }, { x: 451, y: 640, taken: false },
    { x: 640, y: 523, taken: false }, { x: 754, y: 505, taken: false },
    { x: 888, y: 510, taken: false }, { x: 1067, y: 620, taken: false },
    { x: 1420, y: 690, taken: false }, { x: 1580, y: 675, taken: false },
    { x: 1810, y: 620, taken: false }, { x: 2050, y: 515, taken: false },
    { x: 2350, y: 690, taken: false }, { x: 2700, y: 610, taken: false },
    { x: 2950, y: 510, taken: false }, { x: 3260, y: 690, taken: false },
    { x: 3620, y: 615, taken: false }, { x: 3850, y: 515, taken: false },
    { x: 4300, y: 690, taken: false }, { x: 4580, y: 685, taken: false },
    { x: 242.5, y: FLOOR - 104, taken: false, locked: true, crateIndex: 0 },
    { x: 868.5, y: 560 - 95, taken: false, locked: true, crateIndex: 1 },
    { x: 1360, y: FLOOR - 104, taken: false, locked: true, crateIndex: 2 },
    { x: 3420, y: FLOOR - 104, taken: false, locked: true, crateIndex: 3 },
  ];
  private readonly sourceCoins = this.coins.map(coin => ({ ...coin }));
  private crates: WoodenCrate[] = [
    { x: 242.5, surfaceY: FLOOR, width: 75, height: 74, broken: false },
    { x: 868.5, surfaceY: 560, width: 67, height: 67, broken: false },
    { x: 1360, surfaceY: FLOOR, width: 75, height: 74, broken: false },
    { x: 3420, surfaceY: FLOOR, width: 75, height: 74, broken: false },
  ];
  private readonly sourceCrates = this.crates.map(crate => ({ ...crate }));
  private barrel = { x: 1540, surfaceY: FLOOR, width: 84, height: 112 };
  private readonly sourceBarrel = { ...this.barrel };
  private spikeHazards: SpikeHazard[] = [
    { x: 411, surfaceY: FLOOR, phaseOffset: 3.0 },
    { x: 1865, surfaceY: 660, phaseOffset: 1.15 },
    { x: 2760, surfaceY: 650, phaseOffset: 2.3 },
    { x: 3650, surfaceY: 655, phaseOffset: 0.65 },
  ];
  private readonly sourceSpikeHazards = this.spikeHazards.map(hazard => ({ ...hazard }));
  private laserGates: LaserGate[] = [
    { leftPostX: 2275, rightPostX: 2415, phaseOffset: 0 },
    { leftPostX: 3220, rightPostX: 3360, phaseOffset: 1.4 },
    { leftPostX: 4380, rightPostX: 4520, phaseOffset: 2.8 },
  ];
  private readonly sourceLaserGates = this.laserGates.map(gate => ({ ...gate }));
  private keys!: { left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key; jump: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key; w: Phaser.Input.Keyboard.Key; space: Phaser.Input.Keyboard.Key };
  private titleImage?: Phaser.GameObjects.Image;
  private titleLayer?: Phaser.GameObjects.Container;
  private titleBean?: Phaser.GameObjects.Image;
  private titleStartZone?: Phaser.GameObjects.Zone;
  private modalButtonZone?: Phaser.GameObjects.Zone;
  private backgroundArt: Phaser.GameObjects.Image[] = [];
  private heroSprite!: Phaser.GameObjects.Image;
  private levelBanner!: Phaser.GameObjects.Text;
  private levelIndex = 0;
  private unlockedLevel = 0;
  private levelMenu?: HTMLDivElement;
  private landingMenu?: HTMLDivElement;
  private gameTopControls?: HTMLDivElement;
  private gameResultActions?: HTMLDivElement;
  private touchControlMenu?: HTMLDivElement;
  private settingsMenu?: HTMLDivElement;
  private pauseMenu?: HTMLDivElement;
  private preloader?: HTMLDivElement;
  private orientationGate?: HTMLDivElement;
  private pendingLandscapeLevel?: number;
  private orientationFrame?: number;
  private viewportRefreshTimer?: number;
  private orientationResumeState?: 'playing' | 'paused';
  private viewOffsetX = 0;
  private viewOffsetY = 0;
  private spikeSprites: Phaser.GameObjects.Image[] = [];
  private worldPropSprites: Phaser.GameObjects.Image[] = [];
  private chestSprites: Phaser.GameObjects.Image[] = [];
  private laserPostSprites: Phaser.GameObjects.Image[][] = [];
  private powerupSprites: Phaser.GameObjects.Image[] = [];
  private guardSprites: Phaser.GameObjects.Image[] = [];
  private guards: GuardAgent[] = [
    { x: 1140, y: 629, spawnX: 1140, spawnY: 629, spawnDirection: 1, spriteHeight: 120, minX: 1045, maxX: 1245, direction: 1, velocity: 76, mode: 'patrol', timer: 0, lastSeenX: 1140, anim: 0, gait: 0, turning: false },
    { x: 900, y: 532, spawnX: 900, spawnY: 532, spawnDirection: -1, spriteHeight: 108, minX: 820, maxX: 980, direction: -1, velocity: -76, mode: 'patrol', timer: 0, lastSeenX: 900, anim: 0, gait: 0, turning: false },
    { x: 2100, y: 527, spawnX: 2100, spawnY: 527, spawnDirection: -1, spriteHeight: 108, minX: 2010, maxX: 2205, direction: -1, velocity: -76, mode: 'patrol', timer: 0, lastSeenX: 2100, anim: 0, gait: 0, turning: false },
    { x: 3000, y: 517, spawnX: 3000, spawnY: 517, spawnDirection: 1, spriteHeight: 108, minX: 2910, maxX: 3100, direction: 1, velocity: 76, mode: 'patrol', timer: 0, lastSeenX: 3000, anim: 0, gait: 0, turning: false },
    { x: 3900, y: 522, spawnX: 3900, spawnY: 522, spawnDirection: -1, spriteHeight: 108, minX: 3815, maxX: 4015, direction: -1, velocity: -76, mode: 'patrol', timer: 0, lastSeenX: 3900, anim: 0, gait: 0, turning: false },
    { x: 4650, y: 737, spawnX: 4650, spawnY: 737, spawnDirection: 1, spriteHeight: 120, minX: 4580, maxX: 4760, direction: 1, velocity: 76, mode: 'patrol', timer: 0, lastSeenX: 4650, anim: 0, gait: 0, turning: false },
  ];
  private readonly sourceGuards = this.guards.map(guard => ({ ...guard }));
  private signText!: Phaser.GameObjects.Text;
  private coinSprites: Phaser.GameObjects.Image[] = [];
  private powerupZones: Phaser.GameObjects.Zone[] = [];
  private powerupChargeTexts: Phaser.GameObjects.Text[] = [];
  private refillSprite?: Phaser.GameObjects.Image;
  private extraLifePickupSprite?: Phaser.GameObjects.Image;
  private refillPickup = { x: 2500, y: FLOOR - 42, taken: false };
  private extraLifePickup = { x: 3680, y: FLOOR - 42, taken: false };
  private refillChoicePending = false;
  private refillChoiceMenu?: HTMLDivElement;
  private powerupCharges: [number, number, number] = [1, 1, 1];
  private speedTimer = 0;
  private invisibilityTimer = 0;
  private magnetTimer = 0;
  private extraLifeAvailable = false;
  private settingsOpen = false;
  private touchLeft = false;
  private touchRight = false;
  private touchJumpPressed = false;
  private touchJumpHeld = false;
  private gadgetHover = [false, false, false, false];
  private touchControlsVisible = false;
  private state: 'title' | 'playing' | 'paused' | 'won' | 'lost' | 'timeout' = 'title';
  private score = 0;
  private lives = 3;
  private timeLeft = RUN_TIME_SECONDS;
  private elapsed = 0;
  private runElapsedMs = 0;
  private hurtTimer = 0;
  private faceRight = true;
  private animTime = 0;
  private heroGait = 0;
  private jumpAnticipationTimer = 0;
  private jumpBufferTimer = 0;
  private coyoteTimer = 0;
  private autoLeapForward = false;
  private checkpointX = 100;
  private checkpointY = FLOOR - 34;
  private nextCheckpointIndex = 0;
  private checkpoints = [1668, 2500, 3336, 4180];
  private readonly sourceCheckpoints = [...this.checkpoints];
  private landingTimer = 0;
  private runStepMark = 0;
  private chestOpened = false;
  private chestAnimTimer = 0;
  private soundEnabled = true;
  private musicEnabled = true;
  private musicVolume = 0.55;
  private soundEffectsVolume = 0.8;
  private screenShakeEnabled = true;
  private audioContext?: AudioContext;
  private sfxBus?: GainNode;
  private musicBus?: GainNode;
  private musicTimer?: number;
  private musicStep = 0;
  private nextMusicTime = 0;
  private hudRefreshTimer = 0;
  private guardLightRefreshTimer = 0;
  private crispMobileLayer?: HTMLDivElement;
  private crispWorldLayer?: HTMLDivElement;
  private crispWorldNodes = new Map<string, HTMLImageElement>();
  private crispPreloadedImages: HTMLImageElement[] = [];
  private crispHudNodes = new Map<string, HTMLElement>();
  private crispSignBoard?: HTMLDivElement;
  private crispSignInstructions?: HTMLDivElement;
  private crispOverlayActive = false;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() { super('Heist'); }

  preload() {
    const mount = document.getElementById('game');
    if (mount) {
      const existingPreloaders = Array.from(mount.querySelectorAll<HTMLDivElement>('.game-preloader'));
      const preloaderFromMarkup = mount.querySelector<HTMLDivElement>('#initial-preloader') ?? existingPreloaders[0];
      this.preloader = preloaderFromMarkup ?? document.createElement('div');
      this.preloader.className = 'game-preloader';
      if (!preloaderFromMarkup) {
        this.preloader.innerHTML = `<div class="loader-copy"><img class="loader-avatar" src="/assets/fagiolo-idle-v2-0.png" alt=""><div class="loader-brand-copy"><h1 class="loader-title"><span>FAGIOLO</span><em>HEIST!</em></h1><p class="loader-kicker">PREPARING THE GREAT ESCAPE</p></div></div><div class="orientation-hint"><span class="orientation-phone" aria-hidden="true"></span><span class="orientation-hint-copy"><b>LANDSCAPE FOR THE BEST HEIST</b><small>Rotate your phone while Fagiolo gets ready.</small></span></div><div class="loader-route"><div class="loader-runner-mover"><img class="loader-bean" src="/assets/fagiolo-walk-v2-0.png" alt="Fagiolo walking"></div><span class="route-shadow"></span></div><div class="loader-progress"><div class="loader-track"><i></i></div><span class="loader-percent">0%</span></div><p class="loader-caption">FAGIOLO IS MAKING A GETAWAY</p>`;
        mount.append(this.preloader);
      }
      // Vite/dev restarts can leave the static loader and a generated loader
      // together. Keep one loader and one brand block even across a hot reload.
      mount.querySelectorAll<HTMLDivElement>('.game-preloader').forEach(loader => {
        if (loader !== this.preloader) loader.remove();
      });
      this.preloader.querySelectorAll<HTMLElement>('.loader-copy').forEach((brand, index) => {
        if (index > 0) brand.remove();
      });
      let loaderStartedAt = 0;
      const fill = this.preloader.querySelector('.loader-track i') as HTMLElement;
      const percent = this.preloader.querySelector('.loader-percent') as HTMLElement;
      const runnerImage = this.preloader.querySelector('.loader-bean') as HTMLImageElement;
      const runnerMover = this.preloader.querySelector('.loader-runner-mover') as HTMLElement;
      const runnerShadow = this.preloader.querySelector('.route-shadow') as HTMLElement;
      const route = this.preloader.querySelector('.loader-route') as HTMLElement;
      const runnerFrames = Array.from({ length: 6 }, (_, frame) => {
        const image = new Image();
        image.src = `/assets/fagiolo-walk-v2-${frame}.png`;
        return image;
      });
      const jumpFrames = Array.from({ length: 4 }, (_, frame) => {
        const image = new Image();
        image.src = `/assets/fagiolo-jump-v2-${frame}.png`;
        return image;
      });
      // The bar's CSS gives it a full-width fill for its final appearance;
      // explicitly start it empty so it cannot look complete while JS prepares.
      fill.style.transform = 'scaleX(0)';
      const routeWidth = route.clientWidth;
      const runnerWidth = runnerMover.clientWidth;
      let frameIndex = 0;
      let walkCanvases: HTMLCanvasElement[] = [];
      let jumpCanvases: HTMLCanvasElement[] = [];
      let runnerCanvas: HTMLCanvasElement | null = null;
      let runnerContext: CanvasRenderingContext2D | null = null;
      let jumping = false;
      let loadReady = false;
      let sceneFinished = false;
      let dismissed = false;
      const sceneDuration = 4000;
      let walkStartedAt = 0;
      const finishIfReady = () => {
        if (!loadReady || !sceneFinished || dismissed) return;
        dismissed = true;
        this.preloader?.classList.add('is-done');
        window.setTimeout(() => {
          this.preloader?.remove();
        }, 650);
      };
      let jumpPlayed = false;
      let jumpStartedAt = 0;
      let lastPercentValue = -1;
      let sourceFramesReady = false;
      let displayedRunnerSrc = runnerImage.src;
      void Promise.all([...runnerFrames, ...jumpFrames].map(image => image.decode().catch(() => undefined)))
        .then(() => { sourceFramesReady = true; });
      let lastDrawnRunnerFrame: HTMLCanvasElement | null = null;
      const drawRunnerFrame = (frames: HTMLCanvasElement[], index: number) => {
        if (!runnerContext || !runnerCanvas || !frames.length) return;
        const frame = frames[index % frames.length];
        if (frame === lastDrawnRunnerFrame) return;
        runnerContext.clearRect(0, 0, runnerCanvas.width, runnerCanvas.height);
        runnerContext.drawImage(frame, 0, 0);
        lastDrawnRunnerFrame = frame;
      };
      const animateLoading = (now: number) => {
        const elapsed = Math.min(sceneDuration, now - loaderStartedAt);
        const walkElapsed = Math.min(sceneDuration, now - walkStartedAt);
        const smoothStep = (value: number) => value * value * (3 - 2 * value);
        let progress: number;
        if (elapsed < 1800) progress = 0.42 * smoothStep(elapsed / 1800);
        else if (elapsed < 2400) progress = 0.42 + 0.16 * smoothStep((elapsed - 1800) / 600);
        else progress = 0.58 + 0.42 * smoothStep((elapsed - 2400) / (sceneDuration - 2400));

        if (!jumpPlayed && walkElapsed >= 1800) {
          jumpPlayed = true;
          jumping = true;
          jumpStartedAt = walkElapsed;
        }

        // Start on an in-stride pose so the first forward movement is already
        // accompanied by a visible walking step (rather than a sliding idle pose).
        frameIndex = (1 + Math.floor(walkElapsed / 82)) % runnerFrames.length;
        if (jumping) {
          const jumpElapsed = walkElapsed - jumpStartedAt;
          if (jumpElapsed >= 600) {
            jumping = false;
            (runnerCanvas ?? runnerImage).classList.remove('is-jumping');
          } else if (jumpElapsed < 100) {
            (runnerCanvas ?? runnerImage).classList.remove('is-jumping');
            drawRunnerFrame(jumpCanvases, 0);
          } else {
            (runnerCanvas ?? runnerImage).classList.add('is-jumping');
            const jumpPose = 1 + Math.min(2, Math.floor((jumpElapsed - 100) / 160));
            drawRunnerFrame(jumpCanvases, jumpPose);
          }
        }
        if (!jumping) drawRunnerFrame(walkCanvases, frameIndex);
        if (!runnerContext && sourceFramesReady) {
          const source = jumping
            ? jumpFrames[(walkElapsed - jumpStartedAt) < 100
              ? 0
              : 1 + Math.min(2, Math.floor(((walkElapsed - jumpStartedAt) - 100) / 160))].src
            : runnerFrames[frameIndex].src;
          if (source !== displayedRunnerSrc) {
            runnerImage.src = source;
            displayedRunnerSrc = source;
          }
        }

        const percentValue = Math.round(progress * 100);
        fill.style.transform = `scaleX(${progress})`;
        if (percentValue !== lastPercentValue) {
          percent.textContent = `${percentValue}%`;
          lastPercentValue = percentValue;
        }
        // Keep Fagiolo's route speed constant and independent of the loading bar.
        const runnerProgress = walkElapsed / sceneDuration;
        const runnerX = routeWidth * runnerProgress - runnerWidth / 2;
        runnerMover.style.transform = `translate3d(${runnerX}px, 0, 0)`;
        runnerShadow.style.transform = `translate3d(${runnerX + runnerWidth / 2}px, 0, 0) translateX(-50%)`;
        if (elapsed >= sceneDuration) {
          sceneFinished = true;
          finishIfReady();
        } else window.requestAnimationFrame(animateLoading);
      };
      // Let the line, route, and already-visible walking pose move while the
      // higher quality opaque frame canvases are prepared.
      loaderStartedAt = performance.now();
      walkStartedAt = loaderStartedAt;
      window.requestAnimationFrame(animateLoading);
      // Decode and normalize every pose before starting. Reusing prepared
      // canvases avoids image decode hitches during the walk and jump.
      const prepareFrame = async (image: HTMLImageElement) => {
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context unavailable');
        context.drawImage(image, 0, 0);
        // Preserve the source art's original alpha and antialiased edges. Frame
        // consistency belongs in the sprite artwork, not a per-pixel runtime fix.
        return canvas;
      };
      Promise.all([...runnerFrames, ...jumpFrames].map(prepareFrame)).then(preparedFrames => {
        if (dismissed) return;
        walkCanvases = preparedFrames.slice(0, runnerFrames.length);
        jumpCanvases = preparedFrames.slice(runnerFrames.length);
        runnerCanvas = document.createElement('canvas');
        runnerCanvas.className = runnerImage.className;
        runnerCanvas.width = walkCanvases[0].width;
        runnerCanvas.height = walkCanvases[0].height;
        runnerContext = runnerCanvas.getContext('2d');
        if (!runnerContext) throw new Error('Canvas 2D context unavailable');
        runnerImage.replaceWith(runnerCanvas);
        const walkElapsed = Math.min(sceneDuration, performance.now() - walkStartedAt);
        const currentFrame = (1 + Math.floor(walkElapsed / 82)) % runnerFrames.length;
        if (walkElapsed >= 1800 && walkElapsed < 2400) {
          const jumpElapsed = walkElapsed - 1800;
          if (jumpElapsed < 100) {
            runnerCanvas.classList.remove('is-jumping');
            drawRunnerFrame(jumpCanvases, 0);
          } else {
            runnerCanvas.classList.add('is-jumping');
            drawRunnerFrame(jumpCanvases, 1 + Math.min(2, Math.floor((jumpElapsed - 100) / 160)));
          }
        } else {
          runnerCanvas.classList.remove('is-jumping');
          drawRunnerFrame(walkCanvases, currentFrame);
        }
      }).catch(() => {
        // The regular predecoded sprite frames continue animating if canvas
        // pixel processing is unavailable; the loader progress keeps running.
      });
      this.load.once('complete', () => {
        loadReady = true;
        finishIfReady();
      });
    }
    this.load.image('level-background', '/assets/level-background-generated.webp');
    this.load.image('level-2-background', '/assets/level-2-background.webp');
    this.load.image('level-3-background', '/assets/level-3-background.webp');
    for (let frame = 0; frame < 3; frame++) {
      this.load.image(`bean-idle-${frame}`, `/assets/fagiolo-idle-v2-${frame}.png`);
    }
    for (let frame = 0; frame < 6; frame++) {
      this.load.image(`bean-walk-${frame}`, `/assets/fagiolo-walk-v2-${frame}.png`);
    }
    for (let frame = 0; frame < 4; frame++) {
      this.load.image(`bean-jump-${frame}`, `/assets/fagiolo-jump-v2-${frame}.png`);
    }
    this.load.image('bean-coin', '/assets/bean-coin-optimized.png');
    this.load.image('prop-spikes', '/assets/prop-spikes.png');
    this.load.image('prop-laser-post', '/assets/prop-laser-post.png');
    this.load.image('prop-crate', '/assets/prop-crate.png');
    this.load.image('prop-barrel', '/assets/prop-barrel.png');
    for (let frame = 0; frame < 4; frame++) {
      this.load.image(`prop-chest-${frame}`, `/assets/prop-chest-${frame}.png`);
    }
    this.load.image('power-speed', '/assets/power-speed.png');
    this.load.image('power-cloak', '/assets/power-cloak.png');
    this.load.image('power-magnet', '/assets/power-magnet.png');
    this.load.image('power-life', '/assets/power-life.png');
    this.load.image('guard-idle', '/assets/guard-idle-aligned.png');
    for (let frame = 0; frame < 6; frame++) {
      this.load.image(`guard-walk-${frame}`, `/assets/guard-walk-${frame}-aligned.png`);
    }
    this.load.image('guard-stunned', '/assets/guard-stunned-aligned.png');
  }

  create() {
    this.unlockedLevel = Math.max(0, Math.min(2, Number(localStorage.getItem('fagiolo-unlocked-level') || 0)));
    this.soundEnabled = localStorage.getItem('fagiolo-sound-enabled') !== 'false';
    this.musicEnabled = localStorage.getItem('fagiolo-music-enabled') !== 'false';
    const savedMusicVolume = localStorage.getItem('fagiolo-music-volume');
    const savedEffectsVolume = localStorage.getItem('fagiolo-effects-volume');
    if (savedMusicVolume !== null) this.musicVolume = Phaser.Math.Clamp(Number(savedMusicVolume), 0, 100) / 100;
    if (savedEffectsVolume !== null) this.soundEffectsVolume = Phaser.Math.Clamp(Number(savedEffectsVolume), 0, 100) / 100;
    this.screenShakeEnabled = localStorage.getItem('fagiolo-screen-shake') !== 'false';
    this.touchControlsVisible = this.sys.game.device.input.touch || navigator.maxTouchPoints > 0;
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.input.keyboard?.removeCapture([
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
    ]);
    const addGameKey = (keyCode: number) => this.input.keyboard!.addKey(keyCode, false);
    this.keys = {
      left: addGameKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: addGameKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      jump: addGameKey(Phaser.Input.Keyboard.KeyCodes.UP),
      a: addGameKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: addGameKey(Phaser.Input.Keyboard.KeyCodes.D),
      w: addGameKey(Phaser.Input.Keyboard.KeyCodes.W),
      space: addGameKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };
    this.keys = Object.assign(this.keys, {
      power1: addGameKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      power2: addGameKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      power3: addGameKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      power4: addGameKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
    });
    this.titleImage = this.add.image(W / 2, H / 2, 'level-background').setDisplaySize(W, H).setScrollFactor(0).setDepth(-3).setVisible(false);
    this.titleLayer = this.add.container(0, 0).setScrollFactor(0).setDepth(6);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x081522, 0.38);
    const titleArt = this.add.graphics();
    titleArt.fillStyle(0x071521, 0.92); titleArt.fillRoundedRect(138, 155, 790, 620, 34);
    titleArt.lineStyle(2, 0xd3ad60, 0.88); titleArt.strokeRoundedRect(138, 155, 790, 620, 34);
    titleArt.fillStyle(0xdab45f, 1); titleArt.fillRoundedRect(185, 199, 8, 532, 4);
    titleArt.fillStyle(0x315a50, 0.88); titleArt.fillRoundedRect(216, 472, 654, 66, 16);
    titleArt.lineStyle(1, 0xa5c6a3, 0.45); titleArt.strokeRoundedRect(216, 472, 654, 66, 16);
    titleArt.fillStyle(0x397a68, 1); titleArt.fillRoundedRect(216, 589, 654, 102, 22);
    titleArt.lineStyle(2, 0xc9e4bf, 0.9); titleArt.strokeRoundedRect(216, 589, 654, 102, 22);
    titleArt.fillStyle(0xd9b65e, 1); titleArt.fillRoundedRect(239, 610, 5, 60, 3);
    const menuEyebrow = this.add.text(240, 222, 'A CASTLE HEIST PLATFORM ADVENTURE', {
      fontFamily: 'Arial', fontSize: '14px', fontStyle: 'bold', color: '#d8bb76', letterSpacing: 2.2,
    });
    const menuTitle = this.add.text(232, 265, 'FAGIOLO\nHEIST', {
      fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '78px', fontStyle: 'bold', lineSpacing: -8,
      color: '#fff4d4', stroke: '#132b25', strokeThickness: 9,
      shadow: { color: '#081017', blur: 14, fill: true, offsetX: 3, offsetY: 6 },
    });
    const menuTagline = this.add.text(242, 446, 'THE GREAT BEAN ESCAPE', {
      fontFamily: 'Arial', fontSize: '21px', fontStyle: 'bold', color: '#e6d4aa', letterSpacing: 1.4,
    });
    const mission = this.add.text(244, 491, 'CROSS THREE CASTLE ZONES. BEANS BOOST YOUR SCORE.\nREACH THE FINAL CHEST BEFORE TIME RUNS OUT.', {
      fontFamily: 'Arial', fontSize: '15px', fontStyle: 'bold', color: '#e4eadb', lineSpacing: 5,
    });
    const startLabel = this.add.text(543, 621, 'START HEIST', {
      fontFamily: 'Arial', fontSize: '28px', fontStyle: 'bold', color: '#fff8e8', letterSpacing: 1.5,
      shadow: { color: '#183a30', blur: 4, fill: true },
    }).setOrigin(0.5, 0);
    const controlHint = this.add.text(242, 713, 'MOVE A/D OR ARROWS   JUMP W/SPACE/UP   GADGETS 1-4   FULLSCREEN F   PAUSE ESC', {
      fontFamily: 'Arial', fontSize: '13px', fontStyle: 'bold', color: '#bbccc0', letterSpacing: 0.4,
    });
    this.titleBean = this.add.image(1200, 618, 'bean-idle-0').setOrigin(0.5, 0.72).setDisplaySize(280, 218);
    this.titleLayer.add([shade, titleArt, menuEyebrow, menuTitle, menuTagline, mission, startLabel, controlHint, this.titleBean]);
    this.titleLayer.setVisible(false);
    const landing = document.createElement('div');
    landing.className = 'landing-menu is-visible';
    landing.innerHTML = `<header class="landing-nav"><span class="brand-mark"><img src="/assets/fagiolo-idle-v2-0.png" alt="Fagiolo"></span><span class="nav-caption">FAGIOLO HEIST</span><span class="nav-chip">A SNEAKY PLATFORMER</span></header><section class="landing-hero"><div class="hero-copy"><p class="hero-eyebrow"><i></i> SNEAK IN. GET THE BEANS. GET OUT.</p><h1>FAGIOLO<br><em>HEIST!</em></h1><p class="hero-description">Slip past the guards, dodge castle traps and collect beans on your way to the treasure.</p><button class="landing-cta" type="button"><span>CHOOSE A LEVEL</span><b>→</b></button></div></section><footer class="landing-footer"><span>MOVE <b>A / D</b> OR <b>← →</b></span><span>LEAP <b>SPACE</b></span><span>GADGETS <b>1 — 4</b></span><span class="footer-note">ESC <b>PAUSES</b></span></footer>`;
    document.getElementById('game')?.append(landing);
    this.landingMenu = landing;
    this.setLandingBackdrop();
    landing.querySelector('.landing-cta')?.addEventListener('click', () => {
      this.playGameSound('start');
      this.startBackgroundMusic();
      this.showLevelSelect();
    });
    const levelMenu = document.createElement('div');
    levelMenu.className = 'level-menu';
    levelMenu.innerHTML = `<section class="level-panel"><header class="level-heading"><div><p class="level-kicker">THE CASTLE · THREE WINGS</p><h1>Choose your route</h1><p class="level-intro">Each wing has its own watch, its own hazards, and a way through.</p></div><span class="level-seal"><img src="/assets/fagiolo-idle-v2-0.png" alt="Fagiolo"></span></header><div class="level-cards"></div><footer class="level-panel-footer"><span>COMPLETE A WING TO OPEN THE NEXT</span><button class="level-back" type="button">RETURN TO TITLE</button></footer></section>`;
    document.getElementById('game')?.append(levelMenu);
    this.levelMenu = levelMenu;
    const cards = levelMenu.querySelector('.level-cards') as HTMLDivElement;
    LEVEL_NAMES.forEach((name, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'level-card';
      card.innerHTML = `<span class="level-number">0${index + 1}</span><span class="level-name">${name}</span><span class="level-status">READY TO PLAY</span>`;
      card.disabled = false;
      card.addEventListener('click', () => this.startGame(index));
      cards.append(card);
    });
    levelMenu.querySelector('.level-back')?.addEventListener('click', () => {
      this.returnToTitle();
    });
    this.createGameOverlays();
    this.addOnlineEntryPoints(landing, levelMenu);
    this.backgroundArt = [this.add.image(W / 2, H / 2, 'level-background')
      .setScrollFactor(0).setDepth(-10).setVisible(false)];
    for (let level = 0; level < LEVEL_NAMES.length; level++) {
      for (const [index, platform] of platforms.entries()) {
        const variantWidth = platform.w + (LEVEL_PLATFORM_WIDTH_OFFSETS[level][index] ?? 0);
        const textureKey = `stone-platform-${level}-${index}`;
        const painter = this.add.graphics();
        this.drawStonePlatform(painter, { ...platform, x: 4, y: 1, w: variantWidth }, index + level * 5);
        painter.generateTexture(textureKey, variantWidth + 8, platform.h + 15);
        painter.destroy();
        if (level === 0) {
          this.platformSprites.push(this.add.image(platform.x - 4, platform.y - 1, textureKey).setOrigin(0).setDepth(1).setVisible(false));
        }
      }
    }
    this.worldStaticArt = this.add.graphics().setDepth(2.8).setVisible(false);
    this.art = this.add.graphics().setDepth(3).setVisible(false);
    this.guardLightArt = this.add.graphics().setDepth(4).setVisible(false);
    this.hud = this.add.graphics().setDepth(8).setScrollFactor(0).setVisible(false);
    this.modalArt = this.add.graphics().setDepth(12).setScrollFactor(0).setVisible(false);
    this.heroSprite = this.add.image(this.player.x, this.player.y, 'bean-idle-0').setOrigin(0.5, 0.72).setDisplaySize(165, 128).setDepth(6).setVisible(false);
    this.spikeSprites = this.spikeHazards.map(hazard => this.add.image(hazard.x, hazard.surfaceY, 'prop-spikes').setOrigin(0.5, 314 / 448).setDisplaySize(148, 130).setDepth(1.2).setVisible(false));
    this.worldPropSprites = [
      ...this.crates.map(crate => this.add.image(crate.x, crate.surfaceY, 'prop-crate')
        .setOrigin(0.5, 413 / 448)
        .setDisplaySize(crate.width * 1.36, crate.height * 1.19)
        .setDepth(2)
        .setVisible(false)),
      this.add.image(this.barrel.x, this.barrel.surfaceY, 'prop-barrel').setOrigin(0.5, 413 / 448).setDisplaySize(124, 132).setDepth(2).setVisible(false),
    ];
    this.chestSprites = [
      this.add.image(1038, 660, 'prop-chest-0').setOrigin(0.5, 420 / 448).setDisplaySize(146, 109).setDepth(1).setVisible(false),
      this.add.image(4810, FLOOR, 'prop-chest-0').setOrigin(0.5, 420 / 448).setDisplaySize(146, 109).setDepth(1).setVisible(false),
    ];
    this.laserPostSprites = this.laserGates.map(gate => [
      this.add.image(gate.leftPostX, LASER_POST_Y, 'prop-laser-post').setOrigin(0.5, LASER_POST_BASE).setDisplaySize(62, 48).setDepth(1.5).setVisible(false),
      this.add.image(gate.rightPostX, LASER_POST_Y, 'prop-laser-post').setOrigin(0.5, LASER_POST_BASE).setDisplaySize(62, 48).setFlipX(true).setDepth(1.5).setVisible(false),
    ]);
    this.powerupSprites = ['power-speed', 'power-cloak', 'power-magnet', 'power-life'].map(key =>
      this.add.image(0, 0, key).setDisplaySize(44, 44).setDepth(5).setScrollFactor(0).setVisible(false),
    );
    this.guardSprites = this.guards.map(guard => this.add.image(guard.x, guard.y, 'guard-idle')
      .setOrigin(0.5, 0.72)
      .setDisplaySize(guard.spriteHeight * 137 / 120, guard.spriteHeight)
      .setDepth(2)
      .setVisible(false));
    this.coinSprites = this.coins.map(c => this.add.image(c.x, c.y, 'bean-coin').setDisplaySize(48, 36).setDepth(2).setVisible(false));
    this.createCrispMobileOverlay();
    this.refillSprite = this.add.image(this.refillPickup.x, this.refillPickup.y, 'prop-chest-0').setDisplaySize(72, 54).setDepth(3).setVisible(false);
    this.extraLifePickupSprite = this.add.image(this.extraLifePickup.x, this.extraLifePickup.y, 'power-life').setDisplaySize(48, 48).setDepth(3).setVisible(false);
    this.signText = this.add.text(133, 497, 'MOVE: A/D OR ARROWS\nJUMP: W / SPACE / UP\nBEANS = SCORE\nCHEST = EXIT', { fontFamily: 'Trebuchet MS', fontSize: '15px', fontStyle: 'bold', color: '#20160f', align: 'center', lineSpacing: 4 }).setResolution(this.gameplayTextResolution()).setOrigin(.5).setDepth(4).setVisible(false);
    this.levelBanner = this.add.text(W / 2, 145, '', {
      fontFamily: 'Lilita One, Arial Black, sans-serif', fontSize: '28px', fontStyle: 'bold', color: '#fff2c9',
      stroke: '#10212c', strokeThickness: 7, shadow: { color: '#07111a', blur: 12, fill: true, offsetY: 3 },
    }).setResolution(this.gameplayTextResolution()).setOrigin(.5).setDepth(7).setScrollFactor(0).setAlpha(0).setVisible(false);
    this.powerupZones = [105, 245, 385, 525].map((x, i) => this.add.zone(x, H - 76, 132, 108).setScrollFactor(0).setInteractive()
      .on('pointerover', () => { this.gadgetHover[i] = true; })
      .on('pointerout', () => { this.gadgetHover[i] = false; })
      .on('pointerdown', () => this.activatePowerup(i)));
    this.titleStartZone = this.add.zone(543, 640, 654, 102).setDepth(7).setScrollFactor(0).setInteractive().on('pointerdown', () => this.showLevelSelect());
    this.modalButtonZone = this.add.zone(W / 2, H / 2 + 142, 270, 60).setScrollFactor(0).setInteractive().on('pointerdown', () => {
      if (this.state === 'won') this.showLevelSelect();
      else if (this.state === 'lost' || this.state === 'timeout') this.startGame(this.levelIndex);
    });
    this.input.on('pointerup', () => { this.touchLeft = false; this.touchRight = false; this.touchJumpHeld = false; });
    this.input.keyboard?.on('keydown-ENTER', (event: KeyboardEvent) => {
      if (this.isGameShortcutBlocked(event)) return;
      this.state === 'title' ? this.showLevelSelect() : this.startGame(this.levelIndex);
    });
    this.input.keyboard?.on('keydown-R', (event: KeyboardEvent) => {
      if (this.isGameShortcutBlocked(event)) return;
      this.startGame(this.levelIndex);
    });
    this.input.keyboard?.on('keydown-ESC', (event: KeyboardEvent) => {
      if (this.isGameShortcutBlocked(event)) return;
      this.settingsOpen ? this.closeSettings(true) : this.togglePause();
    });
    this.input.keyboard?.on('keydown-F', (event: KeyboardEvent) => {
      if (this.isGameShortcutBlocked(event)) return;
      this.toggleFullscreen();
    });
    this.input.keyboard?.on('keydown-M', (event: KeyboardEvent) => {
      if (this.isGameShortcutBlocked(event)) return;
      this.soundEnabled = !this.soundEnabled;
      localStorage.setItem('fagiolo-sound-enabled', String(this.soundEnabled));
      this.updateSfxMix();
      this.syncSettingsMenu();
      if (this.state === 'paused') this.drawHud(true);
      if (this.soundEnabled) this.playGameSound('power');
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, (gameSize: Phaser.Structs.Size) => this.resizeGameView(gameSize.width, gameSize.height));
    this.resizeGameView(this.scale.width, this.scale.height);
  }

  private createGameOverlays() {
    const mount = document.getElementById('game');
    if (!mount) return;

    const controls = document.createElement('div');
    controls.className = 'game-top-controls';
    controls.innerHTML = `<button class="game-top-button" data-action="pause" aria-label="Pause game"><span class="top-button-icon pause-icon" aria-hidden="true"><i></i><i></i></span><small>PAUSE</small></button><button class="game-top-button" data-action="settings" aria-label="Open settings"><span class="top-button-icon settings-icon" aria-hidden="true">⚙</span><small>SETTINGS</small></button><button class="game-top-button fullscreen-button" data-action="fullscreen" aria-label="Enter fullscreen"><span class="top-button-icon fullscreen-icon" aria-hidden="true">⛶</span><small>FULL</small></button><button class="game-top-button exit-button" data-action="exit" aria-label="Exit to level select"><span class="top-button-icon exit-icon" aria-hidden="true">↪</span><small>EXIT</small></button>`;
    mount.append(controls);
    this.gameTopControls = controls;
    controls.querySelector('[data-action="pause"]')?.addEventListener('click', () => this.togglePause());
    controls.querySelector('[data-action="settings"]')?.addEventListener('click', () => this.toggleSettings());
    controls.querySelector('[data-action="fullscreen"]')?.addEventListener('click', () => this.toggleFullscreen());
    controls.querySelector('[data-action="exit"]')?.addEventListener('click', () => this.quitToLevelSelect());

    const resultActions = document.createElement('div');
    resultActions.className = 'game-result-actions';
    resultActions.innerHTML = `<section class="game-report" role="dialog" aria-modal="true" aria-labelledby="game-report-title"><div class="report-topline"><span class="report-brand-mark" aria-hidden="true"><img src="/assets/fagiolo-idle-v2-0.png" alt=""></span><span class="report-kicker">HEIST REPORT <i></i> LEVEL <b data-report-level>1</b></span><span class="report-status" data-report-status>RUN COMPLETE</span></div><header class="report-heading"><span class="report-emblem" data-report-emblem aria-hidden="true">★</span><div><h2 id="game-report-title" data-report-title>ESCAPE COMPLETE</h2><p data-report-subtitle>Fagiolo got away with the goods.</p></div></header><div class="report-stats"><article class="report-stat report-stat-score"><span>SCORE</span><strong data-report-score>00000</strong></article><article class="report-stat"><span>BEANS</span><strong data-report-beans>00 / 00</strong></article><article class="report-stat"><span>TIME LEFT</span><strong data-report-time>00:00</strong></article><article class="report-stat"><span>LIVES</span><strong data-report-lives>0 / 4</strong></article></div><div class="report-reward"><span class="report-reward-icon" aria-hidden="true">✦</span><span><small data-report-reward-kicker>LEVEL REWARD</small><b data-report-reward>CHEST +500</b></span><span class="report-reward-extra" data-report-extra>BEAN BONUS +500</span></div><footer class="report-actions"><button class="report-primary" type="button" data-result="primary">PLAY NEXT LEVEL</button><button class="report-secondary" type="button" data-result="levels">LEVEL SELECT</button></footer><p class="report-footnote" data-report-footnote>Every bean brings you closer to the perfect escape.</p></section>`;
    mount.append(resultActions);
    this.gameResultActions = resultActions;
    const primaryButton = resultActions.querySelector<HTMLButtonElement>('[data-result="primary"]');
    const primaryFromResult = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.state === 'lost' || this.state === 'timeout') this.retryCurrentLevel();
      else if (this.state === 'won') this.startGame(this.levelIndex < 2 ? this.levelIndex + 1 : this.levelIndex);
    };
    primaryButton?.addEventListener('click', primaryFromResult);
    const levelsButton = resultActions.querySelector<HTMLButtonElement>('[data-result="levels"]');
    const returnFromResult = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.state === 'lost' || this.state === 'timeout' || this.state === 'won') this.quitToLevelSelect();
    };
    levelsButton?.addEventListener('click', returnFromResult);
    resultActions.querySelector('.report-actions')?.insertAdjacentHTML('beforeend', '<button class="report-tertiary" type="button" data-result="leaderboard">LEADERBOARD</button>');
    resultActions.querySelector('.report-footnote')?.insertAdjacentHTML('beforebegin', '<p class="report-online-status" data-report-online-status aria-live="polite"></p>');
    resultActions.querySelector('[data-result="leaderboard"]')?.addEventListener('click', () => {
      this.openOnlinePanel(this.state === 'won' && !this.online.user ? 'auth' : 'leaderboard');
    });

    const refillChoice = document.createElement('div');
    refillChoice.className = 'powerup-refill-overlay';
    refillChoice.innerHTML = `<section class="powerup-refill-panel" role="dialog" aria-modal="true" aria-labelledby="refill-choice-title"><div class="refill-heading"><h2 id="refill-choice-title">Choose your power gem</h2><p>Pick one gadget to recharge. Each can hold up to two charges.</p></div><div class="powerup-refill-options"><button class="refill-option refill-speed" type="button" data-refill="0"><span class="refill-gem"><img src="/assets/power-speed.png" alt=""></span><span class="refill-option-copy"><b>SPEED</b><small>A quick burst of momentum</small><em data-refill-count>0 / 2 CHARGES</em></span><span class="refill-add">+1</span></button><button class="refill-option refill-cloak" type="button" data-refill="1"><span class="refill-gem"><img src="/assets/power-cloak.png" alt=""></span><span class="refill-option-copy"><b>CLOAK</b><small>Slip past the guards unseen</small><em data-refill-count>0 / 2 CHARGES</em></span><span class="refill-add">+1</span></button><button class="refill-option refill-magnet" type="button" data-refill="2"><span class="refill-gem"><img src="/assets/power-magnet.png" alt=""></span><span class="refill-option-copy"><b>MAGNET</b><small>Pull nearby beans your way</small><em data-refill-count>0 / 2 CHARGES</em></span><span class="refill-add">+1</span></button></div></section>`;
    mount.append(refillChoice);
    this.refillChoiceMenu = refillChoice;
    refillChoice.querySelectorAll<HTMLButtonElement>('[data-refill]').forEach(button => {
      button.addEventListener('click', () => this.chooseRefill(Number(button.dataset.refill)));
    });

    const settings = document.createElement('div');
    settings.className = 'game-settings-overlay';
    settings.innerHTML = `<section class="game-settings-panel" role="dialog" aria-modal="true" aria-labelledby="game-settings-title"><header class="game-settings-header"><span class="game-settings-kicker">HEIST PREFERENCES</span><button class="settings-close" type="button" aria-label="Close settings">×</button><h2 id="game-settings-title">Settings</h2><p>Make the escape feel right for you. Changes save automatically.</p></header><div class="settings-options"><div class="settings-option"><span class="settings-option-icon">♫</span><span class="settings-option-copy"><b>Soundtrack</b><small>Original castle heist music</small></span><button class="settings-toggle" type="button" data-setting="0" aria-pressed="true">ON</button></div><div class="settings-option"><span class="settings-option-icon">♪</span><span class="settings-option-copy"><b>Sound effects</b><small>Beans, jumps and heist feedback</small></span><button class="settings-toggle" type="button" data-setting="1" aria-pressed="true">ON</button></div><div class="settings-option"><span class="settings-option-icon">✦</span><span class="settings-option-copy"><b>Screen shake</b><small>Impact feedback when Fagiolo is hit</small></span><button class="settings-toggle" type="button" data-setting="2" aria-pressed="true">ON</button></div><div class="settings-option"><span class="settings-option-icon">▣</span><span class="settings-option-copy"><b>Display mode</b><small>Switch between windowed and fullscreen</small></span><button class="settings-toggle settings-display-toggle" type="button" data-setting="3" aria-pressed="false">WINDOWED</button></div></div><div class="settings-controls-hint"><span>MOVE <b>A / D</b> or <b>← / →</b></span><span>JUMP <b>SPACE</b></span><span>GADGETS <b>1–4</b></span></div><footer><button class="settings-resume" type="button">BACK TO HEIST <span>↗</span></button></footer></section>`;
    mount.append(settings);
    this.settingsMenu = settings;
    settings.querySelector('.settings-close')?.addEventListener('click', () => this.closeSettings(true));
    settings.querySelector('.settings-resume')?.addEventListener('click', () => this.closeSettings(true));
    settings.querySelectorAll<HTMLButtonElement>('.settings-toggle').forEach(button => {
      button.addEventListener('click', () => this.applySetting(Number(button.dataset.setting)));
    });
    const audioOptions = settings.querySelectorAll<HTMLElement>('.settings-option');
    const addVolumeControl = (optionIndex: number, kind: 'music' | 'effects', label: string, volume: number) => {
      const option = audioOptions[optionIndex];
      const control = document.createElement('div');
      control.className = 'settings-volume-control';
      control.innerHTML = `<label for="${kind}-volume-range">${label} volume</label><input id="${kind}-volume-range" type="range" min="0" max="100" step="1" value="${Math.round(volume * 100)}" aria-label="${label} volume"><output>${Math.round(volume * 100)}%</output>`;
      option.classList.add('has-volume');
      option.append(control);
      control.querySelector('input')?.addEventListener('input', event => {
        const value = Number((event.currentTarget as HTMLInputElement).value);
        control.querySelector('output')!.textContent = `${value}%`;
        if (kind === 'music') {
          this.musicVolume = value / 100;
          localStorage.setItem('fagiolo-music-volume', String(value));
          this.updateMusicMix();
        } else {
          this.soundEffectsVolume = value / 100;
          localStorage.setItem('fagiolo-effects-volume', String(value));
          this.updateSfxMix();
        }
      });
    };
    addVolumeControl(0, 'music', 'Music', this.musicVolume);
    addVolumeControl(1, 'effects', 'Sound effects', this.soundEffectsVolume);

    const pause = document.createElement('div');
    pause.className = 'game-pause-overlay';
    pause.innerHTML = `<section class="game-pause-panel" role="dialog" aria-modal="true" aria-labelledby="game-pause-title"><span class="game-pause-kicker">THE HEIST IS ON HOLD</span><h2 id="game-pause-title">Take a breath.</h2><p>Your route is safe. The guards are waiting.</p><button class="pause-resume" type="button">RESUME HEIST <span>▶</span></button><button class="pause-levels" type="button">RETURN TO LEVEL SELECT</button></section></div>`;
    mount.append(pause);
    this.pauseMenu = pause;
    pause.querySelector('.pause-resume')?.addEventListener('click', () => this.togglePause());
    pause.querySelector('.pause-levels')?.addEventListener('click', () => this.quitToLevelSelect());

    const orientationGate = document.createElement('div');
    orientationGate.className = 'orientation-gate';
    orientationGate.setAttribute('aria-hidden', 'true');
    orientationGate.innerHTML = `<section class="orientation-gate-card" role="dialog" aria-modal="true" aria-labelledby="orientation-gate-title"><span class="orientation-phone" aria-hidden="true"></span><p class="orientation-gate-kicker">THE HEIST PLAYS BEST WIDE</p><h2 id="orientation-gate-title">Turn your phone sideways</h2><p>We’ll start your level as soon as your screen is in landscape.</p><button class="orientation-gate-back" type="button">BACK TO LEVEL SELECT</button></section>`;
    mount.append(orientationGate);
    this.orientationGate = orientationGate;
    orientationGate.querySelector('.orientation-gate-back')?.addEventListener('click', () => {
      if (this.orientationResumeState) {
        this.orientationResumeState = undefined;
        this.quitToLevelSelect();
        return;
      }
      this.pendingLandscapeLevel = undefined;
      this.hideOrientationGate();
    });
    window.addEventListener('resize', () => {
      this.handleOrientationChange();
      this.queueViewportRefresh();
    }, { passive: true });
    window.addEventListener('orientationchange', () => {
      this.handleOrientationChange();
      this.queueViewportRefresh();
    }, { passive: true });
    window.visualViewport?.addEventListener('resize', () => this.queueViewportRefresh(), { passive: true });
    document.addEventListener('fullscreenchange', () => {
      this.queueViewportRefresh();
      this.syncSettingsMenu();
    });
    this.syncVisibleGameArea();

    if (this.touchControlsVisible) {
      const touch = document.createElement('div');
      touch.className = 'game-touch-controls';
      touch.innerHTML = `<button type="button" aria-label="Move left" data-touch="left"><span>‹</span><small>LEFT</small></button><button type="button" aria-label="Move right" data-touch="right"><span>›</span><small>RIGHT</small></button><button type="button" aria-label="Jump forward" data-touch="jump"><span>↑</span><small>LEAP</small></button>`;
      mount.append(touch);
      this.touchControlMenu = touch;
      const setTouch = (action: string, active: boolean) => {
        if (action === 'left') this.touchLeft = active;
        if (action === 'right') this.touchRight = active;
        if (action === 'jump') {
          if (active) this.touchJumpPressed = true;
          this.touchJumpHeld = active;
        }
      };
      touch.querySelectorAll<HTMLButtonElement>('[data-touch]').forEach(button => {
        const action = button.dataset.touch!;
        button.addEventListener('pointerdown', event => {
          event.preventDefault();
          button.setPointerCapture(event.pointerId);
          setTouch(action, true);
        });
        const release = (event: PointerEvent) => { event.preventDefault(); setTouch(action, false); };
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('lostpointercapture', () => setTouch(action, false));
      });
    }
    this.syncSettingsMenu();
    this.createOnlineOverlay(mount);
  }

  private addOnlineEntryPoints(landing: HTMLDivElement, levelMenu: HTMLDivElement) {
    const nav = landing.querySelector('.landing-nav');
    if (nav) {
      const actions = document.createElement('div');
      actions.className = 'online-entry-actions';
      actions.innerHTML = '<button type="button" class="online-entry-button" data-open-auth>Sign in</button><button type="button" class="online-entry-button online-entry-leaderboard" data-open-leaderboard>Leaderboard</button>';
      nav.append(actions);
    }
    const footer = levelMenu.querySelector('.level-panel-footer');
    if (footer) {
      const actions = document.createElement('div');
      actions.className = 'online-entry-actions level-online-actions';
      actions.innerHTML = '<button type="button" class="online-entry-button" data-open-auth>Sign in</button><button type="button" class="online-entry-button online-entry-leaderboard" data-open-leaderboard>Leaderboard</button>';
      footer.prepend(actions);
    }
    document.querySelectorAll<HTMLButtonElement>('[data-open-auth]').forEach(button => {
      button.addEventListener('click', () => this.openOnlinePanel('auth'));
    });
    document.querySelectorAll<HTMLButtonElement>('[data-open-leaderboard]').forEach(button => {
      button.addEventListener('click', () => this.openOnlinePanel('leaderboard'));
    });
    this.online.restoreSession().then(() => {
      this.syncOnlineEntryPoints();
      if (this.isAdminRoute()) void this.enterAdminRoute();
    }).catch(() => {
      this.syncOnlineEntryPoints();
      if (this.isAdminRoute()) void this.enterAdminRoute();
    });
    window.addEventListener('fagiolo-auth-change', () => this.syncOnlineEntryPoints());
    window.addEventListener('popstate', () => {
      if (this.isAdminRoute()) void this.enterAdminRoute();
      else if (this.onlineOverlay?.dataset.adminRoute === 'true') {
        this.onlineOverlay.removeAttribute('data-admin-route');
        const headerKicker = this.onlineOverlay.querySelector<HTMLElement>('.online-panel-header .online-kicker');
        if (headerKicker) headerKicker.textContent = 'FAGIOLO HEIST ONLINE';
        this.onlineOverlay.classList.remove('is-visible');
        this.onlineOverlay.setAttribute('aria-hidden', 'true');
      }
    });
  }

  private createOnlineOverlay(mount: HTMLElement) {
    const overlay = document.createElement('div');
    overlay.className = 'online-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `<section class="online-panel leaderboard-panel" role="dialog" aria-modal="true" aria-labelledby="online-title">
      <header class="online-panel-header"><span class="online-brand"><img src="/assets/fagiolo-idle-v2-0.png" alt=""></span><div><span class="online-kicker">FAGIOLO HEIST ONLINE</span><h2 id="online-title">Create your account</h2></div><button class="online-close" type="button" aria-label="Close">×</button></header>
      <div class="online-auth-view" data-online-auth-view>
        <p class="online-intro" data-auth-intro>Save your best runs and compete on each level’s leaderboard.</p>
        <form class="online-auth-form" data-auth-form><label class="online-field" data-auth-username-wrap>Account username<input name="login_username" type="text" minlength="3" maxlength="32" pattern="[A-Za-z0-9_]{3,32}" autocomplete="username" placeholder="BeanRunner" required></label><label class="online-field">Password<input name="password" type="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters" required></label><p class="online-privacy-note">Your login name and Telegram contact stay private. Only your in-game name appears on the leaderboard.</p><button class="online-submit" type="submit" data-auth-submit>CREATE ACCOUNT</button></form>
        <div class="online-member-view" data-online-member hidden><section class="player-profile-card"><span class="player-profile-avatar"><img src="/assets/fagiolo-idle-v2-0.png" alt=""></span><div class="player-profile-copy"><span class="online-kicker">PLAYER PROFILE</span><p class="online-member-name" data-online-member-name></p><p class="player-profile-login">ACCOUNT USERNAME <strong data-player-login></strong></p><p class="online-intro">Your best completed runs are saved here and ranked by level.</p></div><span class="player-profile-status">SIGNED IN</span></section></div>
        <p class="online-notice" data-auth-notice role="status" aria-live="polite"></p><button class="online-mode-switch" type="button" data-auth-mode-toggle>Already have an account? Sign in</button>
      </div>
      <div class="online-board-view" data-online-board-view hidden>
        <div class="online-board-title"><div><span class="online-kicker">THE HEIST RANKINGS</span><p class="online-intro">Best run per player, ranked by score, beans, then time.</p></div><button class="online-secondary board-profile-button" type="button" data-board-profile hidden>MY PROFILE</button></div>
        <div class="online-level-tabs" role="tablist" aria-label="Leaderboard level"><button type="button" data-board-level="1" aria-selected="true">LEVEL 1</button><button type="button" data-board-level="2" aria-selected="false">LEVEL 2</button><button type="button" data-board-level="3" aria-selected="false">LEVEL 3</button></div>
        <div class="online-podium" data-board-podium aria-label="Top three players" hidden></div>
        <div class="online-board-head" data-board-head><span>RANK / PLAYER</span><span>SCORE</span><span>BEANS</span><span>TIME</span></div><ol class="online-board-list" data-board-list></ol>
        <p class="online-notice" data-board-notice role="status" aria-live="polite"></p><button class="online-submit online-board-signin" type="button" data-board-signin>CREATE ACCOUNT / SIGN IN</button>
      </div>
    </section>`;
    const authForm = overlay.querySelector<HTMLFormElement>('[data-auth-form]');
    authForm?.querySelector('[data-auth-username-wrap]')?.insertAdjacentHTML('afterend', '<label class="online-field" data-auth-display-wrap>In-game name (public)<input name="username" type="text" minlength="3" maxlength="18" pattern="[A-Za-z0-9_]{3,18}" autocomplete="nickname" placeholder="Leave blank to use account username"></label><label class="online-field" data-auth-telegram-wrap>Telegram username (optional, private)<input name="telegram_username" type="text" maxlength="33" pattern="@?[A-Za-z0-9_]{5,32}" autocomplete="off" placeholder="Add before claiming a prize"></label>');
    const gameNameLabel = authForm?.querySelector('[data-auth-username-wrap]');
    if (gameNameLabel?.firstChild) gameNameLabel.firstChild.textContent = 'Account username';
    const privacyNote = authForm?.querySelector<HTMLElement>('.online-privacy-note');
    if (privacyNote) privacyNote.textContent = 'Your login username and Telegram contact stay private. Only your in-game name appears on the leaderboard. Save your password; there is no self-service password reset.';
    const passwordInput = authForm?.querySelector<HTMLInputElement>('[name="password"]');
    if (passwordInput) {
      const passwordWrap = document.createElement('div');
      passwordWrap.className = 'online-password-wrap';
      passwordInput.before(passwordWrap);
      passwordWrap.append(passwordInput);
      const visibilityButton = document.createElement('button');
      visibilityButton.type = 'button';
      visibilityButton.className = 'password-visibility';
      visibilityButton.setAttribute('aria-label', 'Show password');
      visibilityButton.setAttribute('aria-pressed', 'false');
      visibilityButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.2 12s3.4-6.2 9.8-6.2 9.8 6.2 9.8 6.2-3.4 6.2-9.8 6.2S2.2 12 2.2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      visibilityButton.addEventListener('click', () => {
        const showPassword = passwordInput.type === 'password';
        passwordInput.type = showPassword ? 'text' : 'password';
        visibilityButton.setAttribute('aria-pressed', String(showPassword));
        visibilityButton.setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password');
        passwordInput.focus({ preventScroll: true });
      });
      passwordWrap.append(visibilityButton);
    }
    const profileCard = overlay.querySelector('[data-online-member] .player-profile-card');
    profileCard?.insertAdjacentHTML('afterend', `<section class="player-profile-contact"><span class="online-kicker">PRIVATE PRIZE CONTACT</span><form class="online-profile-form" data-profile-form><label class="online-field">Telegram username<input name="account_telegram" type="text" minlength="5" maxlength="33" pattern="@?[A-Za-z0-9_]{5,32}" autocomplete="off" placeholder="@yourusername" required></label><p class="online-privacy-note">Only you and the prize admin can see this. Add it before requesting a prize claim. Your in-game name is public.</p><button class="online-secondary" type="submit">SAVE TELEGRAM NAME</button></form><p class="online-notice" data-profile-notice role="status" aria-live="polite"></p></section><section class="player-wins"><h3>Confirmed wins</h3><div data-player-wins><p class="online-privacy-note">Wins are recorded when a leaderboard is finalized.</p></div></section><section class="player-claims"><h3>Prize claims</h3><p class="online-privacy-note">A claim becomes available after results are finalized when you were selected for a reward.</p><div data-player-claims></div></section><button class="online-secondary admin-entry" type="button" data-open-admin hidden>OPEN PRIZE DESK</button><button class="online-secondary online-signout" type="button" data-auth-signout>SIGN OUT</button>`);
    const adminView = document.createElement('div');
    adminView.className = 'online-admin-view';
    adminView.dataset.onlineAdminView = '';
    adminView.hidden = true;
    adminView.innerHTML = `<div class="admin-page-heading"><div><span class="online-kicker">PRIVATE TO ADMINS</span><h2>Admin dashboard</h2></div><button class="online-secondary" type="button" data-admin-back>GAME ACCOUNT</button></div><p class="online-intro">Manage level access, review leaderboard runs, and handle prize claims. Telegram usernames appear only in this admin view.</p><section class="admin-overview"><article><small>PLAYERS</small><strong data-admin-players>—</strong></article><article><small>SAVED SCORES</small><strong data-admin-scores>—</strong></article><article><small>OPEN CLAIMS</small><strong data-admin-pending>—</strong></article></section><section class="admin-level-management"><h3>Level access</h3><p>Closed levels are hidden from play selection and cannot be started from the menu. Closing also freezes score submissions.</p><div data-admin-level-controls class="admin-level-controls"></div></section><section class="admin-score-review"><h3>Score review <span>LEVEL</span></h3><p class="admin-winner-rule">Mark one player to make them the winner and prize recipient when this board is cleared. If you mark nobody, the top-ranked player is recorded as winner without a prize. Close the level first to freeze scores; reopen it for the next competition.</p><div class="online-level-tabs" role="tablist" aria-label="Admin level"><button type="button" data-admin-level="1" aria-selected="true">LEVEL 1</button><button type="button" data-admin-level="2" aria-selected="false">LEVEL 2</button><button type="button" data-admin-level="3" aria-selected="false">LEVEL 3</button></div><div class="admin-reset-actions"><button type="button" data-clear-board="selected">CLEAR LEVEL 1 BOARD</button><button type="button" data-clear-board="all">CLEAR ALL LEADERBOARDS</button></div><ol class="admin-leaderboard-list" data-admin-leaderboard></ol><p class="online-notice" data-admin-board-notice role="status" aria-live="polite"></p></section><section class="admin-redeem"><h3>Verify a claim code</h3><form data-admin-redeem-form><input name="claim_code" type="text" maxlength="40" autocomplete="off" placeholder="Paste the winner's code" required><button class="online-submit" type="submit">VERIFY &amp; REDEEM</button></form><p class="online-notice" data-admin-redeem-notice role="status" aria-live="polite"></p></section><section class="admin-claims"><h3>Prize claim activity</h3><ol data-admin-claims-list class="admin-claims-list"></ol></section><section class="admin-claims admin-audit"><h3>Score moderation history</h3><ol data-admin-audit-list class="admin-claims-list"></ol></section><section class="admin-claims admin-audit"><h3>Leaderboard reset history</h3><ol data-admin-reset-list class="admin-claims-list"></ol></section>`;
    overlay.querySelector('.online-panel')?.append(adminView);

    mount.append(overlay);
    this.onlineOverlay = overlay;
    const close = () => {
      this.gameShortcutSuppressedUntil = performance.now() + 100;
      if (this.isAdminRoute()) history.replaceState(null, '', '/');
      overlay.removeAttribute('data-admin-route');
      const headerKicker = overlay.querySelector<HTMLElement>('.online-panel-header .online-kicker');
      if (headerKicker) headerKicker.textContent = 'FAGIOLO HEIST ONLINE';
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
    };
    overlay.querySelector('.online-close')?.addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('[data-auth-mode-toggle]')?.addEventListener('click', () => {
      this.onlineMode = this.onlineMode === 'signup' ? 'login' : 'signup';
      this.renderOnlineAuth();
    });
    overlay.querySelector('[data-auth-form]')?.addEventListener('submit', event => { void this.submitOnlineAuth(event); });
    overlay.querySelector('[data-profile-form]')?.addEventListener('submit', event => { void this.saveOnlineProfile(event); });
    overlay.querySelector('[data-open-admin]')?.addEventListener('click', () => {
      history.pushState(null, '', '/admin');
      void this.enterAdminRoute();
    });
    overlay.querySelector('[data-admin-back]')?.addEventListener('click', () => {
      if (this.isAdminRoute()) history.replaceState(null, '', '/');
      overlay.removeAttribute('data-admin-route');
      const headerKicker = overlay.querySelector<HTMLElement>('.online-panel-header .online-kicker');
      if (headerKicker) headerKicker.textContent = 'FAGIOLO HEIST ONLINE';
      this.openOnlinePanel('auth');
    });
    overlay.querySelector('[data-admin-redeem-form]')?.addEventListener('submit', event => { void this.redeemOnlinePrize(event); });
    overlay.querySelectorAll<HTMLButtonElement>('[data-admin-level]').forEach(button => {
      button.addEventListener('click', () => {
        this.adminLevel = Number(button.dataset.adminLevel);
        overlay.querySelectorAll<HTMLButtonElement>('[data-admin-level]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
        const clearLevel = overlay.querySelector<HTMLButtonElement>('[data-clear-board="selected"]');
        if (clearLevel) clearLevel.textContent = `CLEAR LEVEL ${this.adminLevel} BOARD`;
        void this.loadAdminLeaderboard();
      });
    });
    overlay.querySelector('[data-admin-level-controls]')?.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-toggle-level]');
      if (!button) return;
      void this.toggleAdminLevel(Number(button.dataset.toggleLevel), button.dataset.open !== 'true');
    });
    overlay.querySelectorAll<HTMLButtonElement>('[data-clear-board]').forEach(button => {
      button.addEventListener('click', () => void this.clearAdminLeaderboard(button.dataset.clearBoard === 'all' ? null : this.adminLevel));
    });
    overlay.querySelector('[data-auth-signout]')?.addEventListener('click', async () => {
      await this.online.signOut();
      this.renderOnlineAuth();
      this.setOnlineNotice('[data-auth-notice]', 'You are signed out.');
    });
    overlay.querySelector('[data-board-signin]')?.addEventListener('click', () => this.openOnlinePanel('auth'));
    overlay.querySelector('[data-board-profile]')?.addEventListener('click', () => this.openOnlinePanel('auth'));
    overlay.querySelectorAll<HTMLButtonElement>('[data-board-level]').forEach(button => {
      button.addEventListener('click', () => {
        this.leaderboardLevel = Number(button.dataset.boardLevel);
        overlay.querySelectorAll<HTMLButtonElement>('[data-board-level]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
        void this.loadOnlineLeaderboard();
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.onlineOverlay?.classList.contains('is-visible')) close();
    });
    this.renderOnlineAuth();
  }

  private openOnlinePanel(view: 'auth' | 'leaderboard' | 'admin') {
    const overlay = this.onlineOverlay;
    if (!overlay) return;
    const auth = overlay.querySelector<HTMLElement>('[data-online-auth-view]');
    const board = overlay.querySelector<HTMLElement>('[data-online-board-view]');
    const admin = overlay.querySelector<HTMLElement>('[data-online-admin-view]');
    if (view === 'admin' && (!this.online.user || !this.onlineIsAdmin)) view = 'auth';
    if (auth) auth.hidden = view !== 'auth';
    if (board) board.hidden = view !== 'leaderboard';
    if (admin) admin.hidden = view !== 'admin';
    const pageTitle = overlay.querySelector<HTMLElement>('#online-title');
    if (pageTitle) pageTitle.textContent = view === 'admin' ? 'Admin dashboard' : view === 'leaderboard' ? 'Leaderboard' : this.isAdminRoute() && !this.onlineIsAdmin ? 'Admin sign in' : this.online.user ? 'Player profile' : this.onlineMode === 'signup' ? 'Create your account' : 'Welcome back';
    const profileButton = overlay.querySelector<HTMLButtonElement>('[data-board-profile]');
    if (profileButton) profileButton.hidden = !this.online.user;
    overlay.dataset.view = view;
    overlay.classList.add('is-visible');
    overlay.setAttribute('aria-hidden', 'false');
    if (view === 'auth') {
      this.renderOnlineAuth();
      if (this.online.user) {
        void this.loadOnlineProfile();
        void this.loadMyPrizeClaims();
      }
    } else if (view === 'leaderboard') void this.loadOnlineLeaderboard();
    else void this.loadAdminPage();
  }

  private isAdminRoute() {
    return window.location.pathname.replace(/\/+$/, '') === '/admin';
  }

  private async enterAdminRoute() {
    const overlay = this.onlineOverlay;
    if (!overlay) return;
    overlay.dataset.adminRoute = 'true';
    this.onlineMode = 'login';
    const headerKicker = overlay.querySelector<HTMLElement>('.online-panel-header .online-kicker');
    if (headerKicker) headerKicker.textContent = 'PRIVATE ADMIN CONSOLE';
    await this.online.restoreSession().catch(() => undefined);
    await this.syncOnlineAdminAccess();
    if (this.onlineIsAdmin) {
      this.openOnlinePanel('admin');
      return;
    }
    this.openOnlinePanel('auth');
    this.renderOnlineAuth();
    const intro = overlay.querySelector<HTMLElement>('[data-auth-intro]');
    if (intro) intro.textContent = 'Enter the password for the single authorized administrator account.';
    this.setOnlineNotice('[data-auth-notice]', this.online.user ? 'This account does not have administrator access.' : '');
  }

  private isGameShortcutBlocked(event?: KeyboardEvent) {
    if (performance.now() < this.gameShortcutSuppressedUntil || this.onlineOverlay?.classList.contains('is-visible')) return true;
    const target = event?.target instanceof Element ? event.target : document.activeElement;
    return target instanceof Element
      && !!target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="textbox"]');
  }

  private isGameplayKeyboardBlocked() {
    if (this.onlineOverlay?.classList.contains('is-visible')) return true;
    const target = document.activeElement;
    return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]');
  }

  private renderOnlineAuth() {
    const overlay = this.onlineOverlay;
    if (!overlay) return;
    const adminRoute = this.isAdminRoute();
    const signedIn = Boolean(this.online.user) && (!adminRoute || this.onlineIsAdmin);
    const signup = !adminRoute && this.onlineMode === 'signup';
    const title = overlay.querySelector<HTMLElement>('#online-title');
    const intro = overlay.querySelector<HTMLElement>('[data-auth-intro]');
    const username = overlay.querySelector<HTMLElement>('[data-auth-username-wrap]');
    const displayName = overlay.querySelector<HTMLElement>('[data-auth-display-wrap]');
    const telegramField = overlay.querySelector<HTMLElement>('[data-auth-telegram-wrap]');
    const form = overlay.querySelector<HTMLElement>('[data-auth-form]');
    const privacyNote = overlay.querySelector<HTMLElement>('[data-auth-form] .online-privacy-note');
    const member = overlay.querySelector<HTMLElement>('[data-online-member]');
    const switcher = overlay.querySelector<HTMLButtonElement>('[data-auth-mode-toggle]');
    const memberName = overlay.querySelector<HTMLElement>('[data-online-member-name]');
    const playerLogin = overlay.querySelector<HTMLElement>('[data-player-login]');
    if (title) title.textContent = adminRoute && !this.onlineIsAdmin ? 'Admin sign in' : signedIn ? 'Player profile' : signup ? 'Create your account' : 'Welcome back';
    if (intro) intro.textContent = adminRoute ? 'Enter the password for the single authorized administrator account.' : signedIn ? 'Your best completed score for each level is saved to your account.' : 'Save your best runs and compete on each level’s leaderboard.';
    if (privacyNote) privacyNote.textContent = adminRoute ? 'This sign-in accepts the password for the one administrator account authorized in the database.' : 'Your login username and Telegram contact stay private. Only your in-game name appears on the leaderboard. Save your password; there is no self-service password reset.';
    if (username) username.hidden = signedIn || adminRoute;
    if (displayName) displayName.hidden = signedIn || !signup;
    if (telegramField) telegramField.hidden = signedIn || !signup;
    const loginInput = overlay.querySelector<HTMLInputElement>('[name="login_username"]');
    if (loginInput) { loginInput.required = !signedIn && !adminRoute; loginInput.disabled = signedIn || adminRoute; loginInput.minLength = 3; loginInput.maxLength = 32; }
    const displayInput = overlay.querySelector<HTMLInputElement>('[name="username"]');
    if (displayInput) { displayInput.required = false; displayInput.disabled = signedIn || !signup; }
    const telegramInput = overlay.querySelector<HTMLInputElement>('[name="telegram_username"]');
    if (telegramInput) {
      telegramInput.required = false;
      telegramInput.disabled = signedIn || !signup;
      telegramInput.minLength = 0;
      telegramInput.pattern = '@?[A-Za-z0-9_]{5,32}';
    }
    if (form) form.hidden = signedIn;
    if (member) member.hidden = !signedIn;
    if (memberName) memberName.textContent = signedIn ? `SIGNED IN AS  ${this.online.username}` : '';
    if (playerLogin) playerLogin.textContent = signedIn ? this.online.loginUsername : '';
    const adminEntry = overlay.querySelector<HTMLButtonElement>('[data-open-admin]');
    if (adminEntry) adminEntry.hidden = !signedIn || !this.onlineIsAdmin;
    const profileInput = overlay.querySelector<HTMLInputElement>('[name="account_telegram"]');
    if (profileInput && signedIn && !profileInput.value) profileInput.value = this.online.telegramUsername;
    if (switcher) {
      switcher.hidden = signedIn || adminRoute;
      switcher.textContent = signup ? 'Already have an account? Sign in' : 'New to Fagiolo Heist? Create an account';
    }
    const password = overlay.querySelector<HTMLInputElement>('[name="password"]');
    if (password) password.autocomplete = signup ? 'new-password' : 'current-password';
    const submit = overlay.querySelector<HTMLButtonElement>('[data-auth-submit]');
    if (submit) submit.textContent = signup ? 'CREATE ACCOUNT' : 'SIGN IN';
    const signInCta = overlay.querySelector<HTMLButtonElement>('[data-board-signin]');
    if (signInCta) signInCta.hidden = signedIn;
    const notice = overlay.querySelector<HTMLElement>('[data-auth-notice]');
    if (!this.online.isConfigured && notice && !notice.textContent) {
      notice.textContent = 'Online accounts are not connected yet. Add your Supabase settings to .env.local.';
    }
  }

  private async submitOnlineAuth(event: Event) {
    event.preventDefault();
    const overlay = this.onlineOverlay;
    const form = overlay?.querySelector<HTMLFormElement>('[data-auth-form]');
    const submit = overlay?.querySelector<HTMLButtonElement>('[data-auth-submit]');
    if (!form || !submit) return;
    const values = new FormData(form);
    const loginUsername = String(values.get('login_username') ?? '').trim();
    const displayNameValue = String(values.get('username') ?? '').trim();
    const username = displayNameValue || loginUsername;
    const telegramUsername = String(values.get('telegram_username') ?? '').trim().replace(/^@/, '');
    const password = String(values.get('password') ?? '');
    submit.disabled = true;
    this.setOnlineNotice('[data-auth-notice]', this.onlineMode === 'signup' ? 'Creating your account…' : 'Signing in…');
    try {
      if (this.onlineMode === 'signup') {
        if (!/^[A-Za-z0-9_]{3,32}$/.test(loginUsername)) throw new Error('Account username must be 3–32 letters, numbers, or underscores.');
        if (!displayNameValue && loginUsername.length > 18) throw new Error('Choose an in-game name of 3–18 characters, or shorten your account username to use it as the default.');
        if (!/^[A-Za-z0-9_]{3,18}$/.test(username)) throw new Error('In-game name must be 3–18 letters, numbers, or underscores.');
        if (telegramUsername && !/^[A-Za-z0-9_]{5,32}$/.test(telegramUsername)) throw new Error('Telegram username must be 5–32 letters, numbers, or underscores.');
        await this.online.signUp(loginUsername, username, telegramUsername, password);
        this.renderOnlineAuth();
        this.setOnlineNotice('[data-auth-notice]', 'Account ready. Your completed runs can now appear on the leaderboard.');
        void this.loadOnlineProfile();
        void this.loadMyPrizeClaims();
        if (this.state === 'won') void this.submitCompletedRun();
      } else {
        if (this.isAdminRoute()) {
          await this.online.signInAdmin(password);
          await this.syncOnlineAdminAccess();
          if (this.onlineIsAdmin) {
            this.openOnlinePanel('admin');
            return;
          }
          this.renderOnlineAuth();
          this.setOnlineNotice('[data-auth-notice]', 'This account does not have administrator access.');
          return;
        }
        if (!/^[A-Za-z0-9_]{3,32}$/.test(loginUsername)) throw new Error('Enter your account username.');
        await this.online.signIn(loginUsername, password);
        this.renderOnlineAuth();
        this.setOnlineNotice('[data-auth-notice]', 'Signed in. Your completed runs will be saved automatically.');
        void this.loadOnlineProfile();
        void this.loadMyPrizeClaims();
        if (this.state === 'won') void this.submitCompletedRun();
      }
    } catch (error) {
      this.setOnlineNotice('[data-auth-notice]', error instanceof Error ? error.message : 'Could not complete sign-in. Please try again.');
    } finally {
      submit.disabled = false;
    }
  }

  private async loadOnlineLeaderboard() {
    const overlay = this.onlineOverlay;
    const list = overlay?.querySelector<HTMLOListElement>('[data-board-list]');
    const podium = overlay?.querySelector<HTMLElement>('[data-board-podium]');
    const head = overlay?.querySelector<HTMLElement>('[data-board-head]');
    if (!overlay || !list || !podium || !head) return;
    list.replaceChildren();
    podium.replaceChildren();
    podium.hidden = true;
    head.hidden = true;
    this.setOnlineNotice('[data-board-notice]', this.online.isConfigured ? 'Loading level leaderboard…' : 'Connect your Supabase project to load leaderboard scores.');
    try {
      const entries = await this.online.getLeaderboard(this.leaderboardLevel);
      if (!entries.length) {
        this.setOnlineNotice('[data-board-notice]', 'No completed runs yet. Finish this level to claim the first spot.');
        return;
      }
      this.setOnlineNotice('[data-board-notice]', '');
      const topThree = entries.slice(0, 3);
      podium.dataset.count = String(topThree.length);
      topThree.forEach((entry, index) => podium.append(this.createLeaderboardPodiumCard(entry, index + 1)));
      podium.hidden = false;
      const remaining = entries.slice(3);
      head.hidden = remaining.length === 0;
      remaining.forEach((entry: LeaderboardEntry, index: number) => {
        const row = document.createElement('li');
        row.className = 'online-board-row';
        const player = document.createElement('span');
        player.className = 'online-board-player';
        const rank = document.createElement('b');
        rank.textContent = String(index + 4).padStart(2, '0');
        const name = document.createElement('strong');
        name.textContent = entry.username;
        player.append(rank, name);
        const score = document.createElement('b');
        score.className = 'online-board-score';
        score.textContent = entry.score.toLocaleString();
        const beans = document.createElement('span');
        beans.textContent = `${entry.beans_collected}/${entry.total_beans}`;
        const time = document.createElement('span');
        time.textContent = formatRunTime(entry.completion_time_ms);
        row.append(player, score, beans, time);
        list.append(row);
      });
    } catch (error) {
      this.setOnlineNotice('[data-board-notice]', error instanceof Error ? error.message : 'Could not load the leaderboard.');
    }
  }

  private createLeaderboardPodiumCard(entry: LeaderboardEntry, rank: number) {
    const card = document.createElement('article');
    card.className = `online-podium-card is-rank-${rank}`;
    const rankLabel = document.createElement('span');
    rankLabel.className = 'podium-rank-label';
    rankLabel.textContent = rank === 1 ? 'LEVEL CHAMPION' : rank === 2 ? 'RUNNER UP' : 'THIRD PLACE';
    const identity = document.createElement('div');
    identity.className = 'podium-identity';
    const avatar = document.createElement('span');
    avatar.className = 'podium-avatar';
    const bean = document.createElement('img');
    bean.src = '/assets/fagiolo-idle-v2-0.png';
    bean.alt = '';
    avatar.append(bean);
    const playerName = document.createElement('strong');
    playerName.textContent = entry.username;
    identity.append(avatar, playerName);
    const scoreLabel = document.createElement('span');
    scoreLabel.className = 'podium-score-label';
    scoreLabel.textContent = 'BEST SCORE';
    const score = document.createElement('b');
    score.className = 'podium-score';
    score.textContent = entry.score.toLocaleString();
    const details = document.createElement('div');
    details.className = 'podium-details';
    const beans = document.createElement('span');
    beans.textContent = `BEANS  ${entry.beans_collected}/${entry.total_beans}`;
    const time = document.createElement('span');
    time.textContent = `TIME  ${formatRunTime(entry.completion_time_ms)}`;
    details.append(beans, time);
    card.append(rankLabel, identity, scoreLabel, score, details);
    return card;
  }

  private setOnlineNotice(selector: string, message: string) {
    const notice = this.onlineOverlay?.querySelector<HTMLElement>(selector);
    if (notice) notice.textContent = message;
  }

  private async loadOnlineProfile() {
    const input = this.onlineOverlay?.querySelector<HTMLInputElement>('[name="account_telegram"]');
    if (!this.online.user || !input) return;
    try {
      const profile = await this.online.getMyProfile();
      if (profile && document.activeElement !== input) input.value = profile.telegram_username ? `@${profile.telegram_username}` : '';
    } catch (error) {
      this.setOnlineNotice('[data-profile-notice]', error instanceof Error ? error.message : 'Could not load your profile.');
    }
  }

  private async saveOnlineProfile(event: Event) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const input = form.querySelector<HTMLInputElement>('[name="account_telegram"]');
    if (!input) return;
    const telegramUsername = input.value.trim().replace(/^@/, '');
    if (!/^[A-Za-z0-9_]{5,32}$/.test(telegramUsername)) {
      this.setOnlineNotice('[data-profile-notice]', 'Enter a Telegram username with 5–32 letters, numbers, or underscores.');
      return;
    }
    try {
      const saved = await this.online.updateTelegramUsername(telegramUsername);
      input.value = `@${saved}`;
      this.setOnlineNotice('[data-profile-notice]', 'Private Telegram username saved.');
    } catch (error) {
      this.setOnlineNotice('[data-profile-notice]', error instanceof Error ? error.message : 'Could not save your Telegram username.');
    }
  }

  private async loadMyPrizeClaims() {
    const target = this.onlineOverlay?.querySelector<HTMLDivElement>('[data-player-claims]');
    if (!target || !this.online.user) return;
    void this.loadMyWinSummary();
    target.replaceChildren();
    try {
      const claims = await this.online.getMyPrizeClaims();
      if (!claims.length) {
        const note = document.createElement('p');
        note.className = 'online-privacy-note';
        note.textContent = 'No prize claims are available for this account yet.';
        target.append(note);
        return;
      }
      claims.forEach((claim: PlayerPrizeClaim) => {
        const card = document.createElement('article');
        card.className = 'player-claim-card';
        const title = document.createElement('strong');
        title.textContent = `LEVEL ${claim.level} · WIN ${new Date(claim.created_at).toLocaleDateString()}`;
        const status = document.createElement('span');
        status.className = `claim-status claim-status-${claim.status}`;
        status.textContent = claim.status === 'redeemed' ? 'CLAIMED' : claim.status === 'expired' ? 'CLAIM WINDOW CLOSED' : claim.status === 'code_issued' ? 'CODE ISSUED' : 'ELIGIBLE';
        card.append(title, status);
        if (claim.claim_deadline) {
          const deadline = document.createElement('small');
          deadline.className = 'claim-deadline';
          deadline.textContent = `Claim by ${new Date(claim.claim_deadline).toLocaleString()}`;
          card.append(deadline);
        }
        if (claim.status === 'eligible' || claim.status === 'code_issued') {
          const issue = document.createElement('button');
          issue.className = 'online-secondary';
          issue.type = 'button';
          issue.textContent = claim.status === 'code_issued' ? 'GET A FRESH CODE' : 'GET CLAIM CODE';
          issue.addEventListener('click', async () => {
            issue.disabled = true;
            this.setOnlineNotice('[data-profile-notice]', 'Creating a private, one-time code…');
            try {
              const code = await this.online.requestPrizeClaim(claim.claim_id);
              const codeBox = document.createElement('div');
              codeBox.className = 'claim-code-box';
              const hint = document.createElement('small');
              hint.textContent = 'Send this code privately from your listed Telegram account. It expires when the one-week claim window closes.';
              const codeText = document.createElement('code');
              codeText.textContent = code;
              const copy = document.createElement('button');
              copy.className = 'online-secondary';
              copy.type = 'button';
              copy.textContent = 'COPY CODE';
              copy.addEventListener('click', async () => {
                try { await navigator.clipboard.writeText(code); copy.textContent = 'COPIED'; }
                catch { copy.textContent = 'SELECT AND COPY THE CODE'; }
              });
              codeBox.append(hint, codeText, copy);
              card.querySelector('.claim-code-box')?.remove();
              card.append(codeBox);
              this.setOnlineNotice('[data-profile-notice]', 'Claim code created. Any older code for this prize is now invalid.');
              status.textContent = 'CODE ISSUED';
              status.className = 'claim-status claim-status-code_issued';
              issue.textContent = 'GET A FRESH CODE';
            } catch (error) {
              this.setOnlineNotice('[data-profile-notice]', error instanceof Error ? error.message : 'Could not create a claim code.');
              if (error instanceof Error && error.message.includes('claim window has ended')) void this.loadMyPrizeClaims();
            } finally { issue.disabled = false; }
          });
          card.append(issue);
        } else if (claim.status === 'redeemed') {
          const redeemed = document.createElement('small');
          redeemed.textContent = 'This prize has already been redeemed.';
          card.append(redeemed);
        } else if (claim.status === 'expired') {
          const expired = document.createElement('small');
          expired.textContent = 'The one-week prize claim window has ended.';
          card.append(expired);
        }
        target.append(card);
      });
    } catch (error) {
      const note = document.createElement('p');
      note.className = 'online-privacy-note';
      note.textContent = error instanceof Error ? error.message : 'Could not load prize claims.';
      target.append(note);
    }
  }

  private async loadMyWinSummary() {
    const target = this.onlineOverlay?.querySelector<HTMLElement>('[data-player-wins]');
    if (!target || !this.online.user) return;
    try {
      const summary = (await this.online.getMyWinSummary())[0];
      if (!summary) return;
      target.replaceChildren();
      const total = document.createElement('strong'); total.className = 'player-win-total';
      total.textContent = `${summary.total_wins} ${summary.total_wins === 1 ? 'WIN' : 'WINS'}`;
      const levels = document.createElement('div'); levels.className = 'player-win-levels';
      [summary.level_1_wins, summary.level_2_wins, summary.level_3_wins].forEach((wins, index) => {
        const item = document.createElement('span');
        item.textContent = `LEVEL ${index + 1} · ${wins}`;
        levels.append(item);
      });
      target.append(total, levels);
    } catch {
      target.textContent = 'Win history is temporarily unavailable.';
    }
  }

  private async syncOnlineAdminAccess() {
    this.onlineIsAdmin = false;
    if (this.online.user && this.online.isConfigured) {
      try { this.onlineIsAdmin = await this.online.isAdmin(); } catch { this.onlineIsAdmin = false; }
    }
    const button = this.onlineOverlay?.querySelector<HTMLButtonElement>('[data-open-admin]');
    if (button) button.hidden = !this.onlineIsAdmin;
    if (!this.onlineIsAdmin && this.onlineOverlay?.dataset.view === 'admin') this.openOnlinePanel('auth');
  }

  private async loadAdminPage() {
    if (!this.online.user || !this.onlineIsAdmin) {
      this.setOnlineNotice('[data-admin-board-notice]', 'Administrator access is required.');
      return;
    }
    await Promise.all([this.loadAdminOverview(), this.loadAdminLevelSettings(), this.loadAdminLeaderboard(), this.loadAdminPrizeClaims(), this.loadAdminModerationLog(), this.loadAdminResetHistory()]);
  }

  private async loadAdminResetHistory() {
    const list = this.onlineOverlay?.querySelector<HTMLOListElement>('[data-admin-reset-list]');
    if (!list) return;
    list.replaceChildren();
    try {
      const history = await this.online.getAdminLeaderboardResets();
      if (!history.length) { const item = document.createElement('li'); item.className = 'online-privacy-note'; item.textContent = 'No leaderboard resets yet.'; list.append(item); return; }
      history.forEach(reset => {
        const item = document.createElement('li'); item.className = 'admin-claim-row';
        const details = document.createElement('span');
        details.textContent = `${reset.level ? `Level ${reset.level}` : 'All levels'} · ${reset.entries_removed} scores cleared · ${reset.winner_summary ?? 'No winner recorded'} · ${new Date(reset.cleared_at).toLocaleString()}`;
        item.append(details); list.append(item);
      });
    } catch (error) { const item = document.createElement('li'); item.className = 'online-privacy-note'; item.textContent = error instanceof Error ? error.message : 'Could not load reset history.'; list.append(item); }
  }

  private async clearAdminLeaderboard(level: number | null) {
    const scope = level === null ? 'all three levels' : `Level ${level}`;
    const confirmed = window.confirm(`Finalize and clear ${scope}? Close the level first so no more scores can be submitted. The marked player wins and receives a prize claim; with no marked player, the highest-ranked player wins without a prize. Scores disappear from player leaderboards, while accounts and existing claims remain. The results will be archived.`);
    if (!confirmed) return;
    const buttons = this.onlineOverlay?.querySelectorAll<HTMLButtonElement>('[data-clear-board]');
    buttons?.forEach(button => { button.disabled = true; });
    this.setOnlineNotice('[data-admin-board-notice]', `Clearing ${scope.toLowerCase()} leaderboard…`);
    try {
      const removed = await this.online.clearAdminLeaderboard(level);
      await Promise.all([this.loadAdminLeaderboard(), this.loadAdminOverview(), this.loadAdminPrizeClaims(), this.loadAdminResetHistory()]);
      this.setOnlineNotice('[data-admin-board-notice]', removed
        ? `Cleared ${removed} saved score${removed === 1 ? '' : 's'} from ${scope.toLowerCase()}. The winner was recorded; player accounts and existing claims were kept.`
        : `There were no scores to clear in ${scope.toLowerCase()}, so no winner was recorded.`);
    } catch (error) {
      this.setOnlineNotice('[data-admin-board-notice]', error instanceof Error ? error.message : 'Could not clear leaderboard.');
    } finally { buttons?.forEach(button => { button.disabled = false; }); }
  }

  private async loadAdminModerationLog() {
    const list = this.onlineOverlay?.querySelector<HTMLOListElement>('[data-admin-audit-list]');
    if (!list) return;
    list.replaceChildren();
    try {
      const rows = await this.online.getAdminModerationLog();
      if (!rows.length) { const empty = document.createElement('li'); empty.className = 'online-privacy-note'; empty.textContent = 'No scores have been removed.'; list.append(empty); return; }
      rows.forEach((record: AdminModerationRecord) => {
        const item = document.createElement('li'); item.className = 'admin-claim-row';
        const info = document.createElement('span'); info.textContent = `${record.username ?? record.player_id.slice(0, 8)} · Level ${record.level} · ${record.score.toLocaleString()} · ${record.reason.replace(/_/g, ' ')} · ${new Date(record.deleted_at).toLocaleString()}`;
        item.append(info); list.append(item);
      });
    } catch (error) { const item = document.createElement('li'); item.className = 'online-privacy-note'; item.textContent = error instanceof Error ? error.message : 'Could not load moderation history.'; list.append(item); }
  }

  private async loadAdminOverview() {
    try {
      const summary = await this.online.getAdminOverview();
      const overlay = this.onlineOverlay;
      if (!overlay) return;
      overlay.querySelector('[data-admin-players]')!.textContent = summary.players.toLocaleString();
      overlay.querySelector('[data-admin-scores]')!.textContent = summary.scores.toLocaleString();
      overlay.querySelector('[data-admin-pending]')!.textContent = summary.pending_claims.toLocaleString();
    } catch (error) { this.setOnlineNotice('[data-admin-board-notice]', error instanceof Error ? error.message : 'Could not load dashboard summary.'); }
  }

  private async loadAdminLevelSettings() {
    const host = this.onlineOverlay?.querySelector<HTMLElement>('[data-admin-level-controls]');
    if (!host) return;
    host.replaceChildren();
    try {
      const settings = await this.online.getAdminLevelSettings();
      this.closedLevels = new Set(settings.filter(level => !level.is_open).map(level => level.level));
      this.levelAvailabilityLoaded = true;
      settings.forEach(level => {
        const item = document.createElement('div'); item.className = 'admin-level-control';
        const label = document.createElement('span'); label.innerHTML = `<b>LEVEL ${level.level}</b><small>${level.is_open ? 'Available to players' : 'Hidden and unavailable'}</small>`;
        const button = document.createElement('button'); button.className = `settings-toggle ${level.is_open ? 'is-open' : ''}`; button.type = 'button'; button.dataset.toggleLevel = String(level.level); button.dataset.open = String(level.is_open); button.setAttribute('aria-pressed', String(level.is_open)); button.textContent = level.is_open ? 'OPEN' : 'CLOSED';
        item.append(label, button); host.append(item);
      });
      this.syncLevelAvailability();
    } catch (error) { host.textContent = error instanceof Error ? error.message : 'Could not load level availability.'; }
  }

  private async toggleAdminLevel(level: number, isOpen: boolean) {
    const button = this.onlineOverlay?.querySelector<HTMLButtonElement>(`[data-toggle-level="${level}"]`);
    if (!button) return;
    button.disabled = true;
    try { await this.online.setAdminLevelOpen(level, isOpen); await this.loadAdminLevelSettings(); }
    catch (error) { this.setOnlineNotice('[data-admin-board-notice]', error instanceof Error ? error.message : 'Could not update level access.'); }
    finally { button.disabled = false; }
  }

  private syncLevelAvailability() {
    const cards = this.levelMenu?.querySelectorAll<HTMLButtonElement>('.level-card');
    cards?.forEach((card, index) => {
      const closed = this.closedLevels.has(index + 1);
      card.disabled = closed;
      const status = card.querySelector<HTMLElement>('.level-status');
      if (status && closed) status.textContent = 'CURRENTLY CLOSED';
      else if (status) status.textContent = index < this.unlockedLevel ? 'COMPLETED · REPLAY' : 'READY TO PLAY';
    });
  }

  private async loadAdminLeaderboard() {
    const list = this.onlineOverlay?.querySelector<HTMLOListElement>('[data-admin-leaderboard]');
    if (!list) return;
    list.replaceChildren();
    this.setOnlineNotice('[data-admin-board-notice]', 'Loading level results…');
    try {
      const entries = await this.online.getAdminLeaderboard(this.adminLevel);
      if (!entries.length) {
        this.setOnlineNotice('[data-admin-board-notice]', 'No completed runs for this level yet.');
        return;
      }
      entries.forEach((entry: AdminLeaderboardEntry, index: number) => {
        const row = document.createElement('li');
        row.className = 'admin-player-row';
        const details = document.createElement('div');
        details.className = 'admin-player-details';
        const name = document.createElement('strong');
        name.textContent = `${String(index + 1).padStart(2, '0')}  ${entry.username}`;
        const telegram = document.createElement('small');
        telegram.textContent = entry.telegram_username ? `@${entry.telegram_username}` : 'Telegram username not set';
        details.append(name, telegram);
        const score = document.createElement('span');
        score.className = 'admin-player-score';
        score.textContent = `${entry.score.toLocaleString()} · ${entry.beans_collected}/${entry.total_beans}`;
        const button = document.createElement('button');
        button.className = entry.is_winner ? 'online-secondary is-selected' : 'online-secondary';
        button.type = 'button';
        button.textContent = entry.is_winner ? 'REMOVE WINNER' : 'MARK WINNER';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            await this.online.setPrizeWinner(entry.player_id, this.adminLevel, !entry.is_winner);
            await this.loadAdminLeaderboard();
            this.setOnlineNotice('[data-admin-board-notice]', entry.is_winner
              ? 'Manual winner selection cleared. Clearing this board will now award the win to the highest-ranked player with no reward.'
              : `${entry.username} selected as manual winner and reward recipient. This takes effect when the board is cleared.`);
          } catch (error) {
            this.setOnlineNotice('[data-admin-board-notice]', error instanceof Error ? error.message : 'Could not update winner eligibility.');
            button.disabled = false;
          }
        });
        row.append(details, score, button);
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'admin-delete-score'; remove.textContent = 'REMOVE SCORE';
        remove.addEventListener('click', async () => {
          const reason = row.querySelector<HTMLSelectElement>('[data-score-reason]')?.value ?? '';
          if (!reason) { this.setOnlineNotice('[data-admin-board-notice]', 'Choose a moderation reason before removing this score.'); return; }
          if (!window.confirm(`Remove ${entry.username}'s Level ${this.adminLevel} score of ${entry.score.toLocaleString()}? The result will be recorded in moderation history.`)) return;
          remove.disabled = true;
          try { await this.online.deleteAdminScore(entry.player_id, this.adminLevel, reason); await Promise.all([this.loadAdminLeaderboard(), this.loadAdminOverview(), this.loadAdminPrizeClaims(), this.loadAdminModerationLog()]); }
          catch (error) { this.setOnlineNotice('[data-admin-board-notice]', error instanceof Error ? error.message : 'Could not remove score.'); remove.disabled = false; }
        });
        const reason = document.createElement('select'); reason.dataset.scoreReason = ''; reason.setAttribute('aria-label', `Reason for removing ${entry.username}'s score`);
        reason.innerHTML = '<option value="">Reason…</option><option value="impossible_score">Impossible score</option><option value="invalid_run">Invalid run</option><option value="duplicate_or_exploit">Duplicate or exploit</option><option value="other">Other / suspected cheating</option>';
        const moderation = document.createElement('div'); moderation.className = 'admin-score-actions'; moderation.append(reason, remove); row.append(moderation);
        list.append(row);
      });
      this.setOnlineNotice('[data-admin-board-notice]', 'Mark one player for a rewarded win before clearing; otherwise, the top-ranked player wins without a reward.');
    } catch (error) {
      this.setOnlineNotice('[data-admin-board-notice]', error instanceof Error ? error.message : 'Could not load admin results.');
    }
  }

  private async loadAdminPrizeClaims() {
    const list = this.onlineOverlay?.querySelector<HTMLOListElement>('[data-admin-claims-list]');
    if (!list) return;
    list.replaceChildren();
    try {
      const claims = await this.online.getAdminPrizeClaims();
      if (!claims.length) {
        const item = document.createElement('li');
        item.className = 'online-privacy-note';
        item.textContent = 'No prize claims yet.';
        list.append(item);
        return;
      }
      claims.forEach((claim: AdminPrizeClaim) => {
        const item = document.createElement('li');
        item.className = 'admin-claim-row';
        const info = document.createElement('span');
        info.textContent = `${claim.username} · Level ${claim.level} · ${claim.score?.toLocaleString() ?? '—'} · ${new Date(claim.created_at).toLocaleDateString()} · Claim by ${claim.claim_deadline ? new Date(claim.claim_deadline).toLocaleDateString() : '—'} · ${claim.telegram_username ? `@${claim.telegram_username}` : 'No Telegram username'}`;
        const status = document.createElement('b');
        status.textContent = claim.status === 'redeemed' ? 'REDEEMED' : claim.status === 'expired' ? 'EXPIRED' : claim.status === 'code_issued' ? 'CODE ISSUED' : 'ELIGIBLE';
        item.append(info, status);
        list.append(item);
      });
    } catch (error) {
      const item = document.createElement('li');
      item.className = 'online-privacy-note';
      item.textContent = error instanceof Error ? error.message : 'Could not load prize claims.';
      list.append(item);
    }
  }

  private async redeemOnlinePrize(event: Event) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const code = String(new FormData(form).get('claim_code') ?? '').trim();
    this.setOnlineNotice('[data-admin-redeem-notice]', 'Verifying and redeeming code…');
    try {
      const winner = await this.online.redeemPrizeClaim(code);
      if (!winner) throw new Error('The code could not be matched.');
      form.reset();
      this.setOnlineNotice('[data-admin-redeem-notice]', `Verified ${winner.username} for Level ${winner.level} (${winner.score?.toLocaleString() ?? 'score unavailable'} points). Telegram: ${winner.telegram_username ? `@${winner.telegram_username}` : 'not provided'}. Claim marked redeemed.`);
      await this.loadAdminPrizeClaims();
      await this.loadAdminLeaderboard();
    } catch (error) {
      this.setOnlineNotice('[data-admin-redeem-notice]', error instanceof Error ? error.message : 'Could not redeem this code.');
    }
  }

  private syncOnlineEntryPoints() {
    document.querySelectorAll<HTMLButtonElement>('[data-open-auth]').forEach(button => {
      button.textContent = this.online.user ? 'My profile' : 'Sign in';
      button.setAttribute('aria-label', this.online.user ? `Account: ${this.online.username}` : 'Sign in or create account');
    });
    void this.syncOnlineAdminAccess();
    if (this.onlineOverlay?.dataset.view === 'auth') this.renderOnlineAuth();
  }

  private async submitCompletedRun() {
    if (!this.online.isConfigured || !this.online.user) return;
    try {
      const collected = this.coins.filter(coin => coin.taken).length;
      const updated = await this.online.submitScore(this.levelIndex + 1, this.score, collected, this.coins.length, Math.max(1, Math.round(this.runElapsedMs)));
      this.leaderboardRunStatus = updated ? 'Your best run is now on the leaderboard.' : 'Your previous best run remains on the leaderboard.';
    } catch (error) {
      this.leaderboardRunStatus = error instanceof Error ? error.message : 'Could not save this run to the leaderboard.';
    }
    if (this.state === 'won') this.drawHud(false);
  }

  private requiresLandscape() {
    return this.touchControlsVisible && window.matchMedia('(orientation: portrait)').matches;
  }

  private queueViewportRefresh() {
    if (this.viewportRefreshTimer !== undefined) window.clearTimeout(this.viewportRefreshTimer);
    // Some mobile browsers update the visual viewport and safe areas a frame
    // after orientationchange. Re-read the parent size once that transition settles.
    this.viewportRefreshTimer = window.setTimeout(() => {
      this.viewportRefreshTimer = undefined;
      this.syncVisibleGameArea();
      this.scale.refresh();
    }, 120);
  }

  private syncVisibleGameArea() {
    syncVisibleGameArea();
  }

  private handleOrientationChange() {
    if (this.orientationFrame !== undefined) window.cancelAnimationFrame(this.orientationFrame);
    this.orientationFrame = window.requestAnimationFrame(() => {
      this.orientationFrame = undefined;
      const portrait = this.requiresLandscape();

      if (this.pendingLandscapeLevel !== undefined) {
        if (portrait) return;
        const level = this.pendingLandscapeLevel;
        this.pendingLandscapeLevel = undefined;
        this.hideOrientationGate();
        this.startGame(level);
        return;
      }

      if (portrait && (this.state === 'playing' || this.state === 'paused')) {
        if (!this.orientationResumeState) this.orientationResumeState = this.state;
        this.state = 'paused';
        this.touchLeft = false;
        this.touchRight = false;
        this.touchJumpPressed = false;
        this.touchJumpHeld = false;
        this.updateOrientationGate(true);
        this.orientationGate?.classList.add('is-visible');
        this.orientationGate?.setAttribute('aria-hidden', 'false');
        this.pauseMenu?.classList.remove('is-visible');
        this.settingsMenu?.classList.remove('is-visible');
        this.updateMusicMix();
        this.drawHud(true);
        return;
      }

      if (!portrait && this.orientationResumeState) {
        const resumeState = this.orientationResumeState;
        this.orientationResumeState = undefined;
        this.hideOrientationGate();
        this.state = resumeState;
        this.pauseMenu?.classList.toggle('is-visible', resumeState === 'paused' && !this.settingsOpen && !this.refillChoicePending);
        this.settingsMenu?.classList.toggle('is-visible', resumeState === 'paused' && this.settingsOpen);
        this.updateMusicMix();
        this.drawHud(resumeState === 'paused');
      }
    });
  }

  private updateOrientationGate(inGame: boolean) {
    const gate = this.orientationGate;
    if (!gate) return;
    const kicker = gate.querySelector<HTMLElement>('.orientation-gate-kicker');
    const title = gate.querySelector<HTMLElement>('#orientation-gate-title');
    const description = gate.querySelector<HTMLElement>('.orientation-gate-card p:not(.orientation-gate-kicker)');
    const button = gate.querySelector<HTMLButtonElement>('.orientation-gate-back');
    if (inGame) {
      if (kicker) kicker.textContent = 'YOUR HEIST IS PAUSED';
      if (title) title.textContent = 'Turn your phone back';
      if (description) description.textContent = 'Your level, timer and progress are saved while you rotate.';
      if (button) button.textContent = 'EXIT TO LEVEL SELECT';
    } else {
      if (kicker) kicker.textContent = 'THE HEIST PLAYS BEST WIDE';
      if (title) title.textContent = 'Turn your phone sideways';
      if (description) description.textContent = 'We’ll start your level as soon as your screen is in landscape.';
      if (button) button.textContent = 'BACK TO LEVEL SELECT';
    }
  }

  private hideOrientationGate() {
    this.orientationGate?.classList.remove('is-visible');
    this.orientationGate?.setAttribute('aria-hidden', 'true');
  }

  private toggleSettings() {
    if (this.settingsOpen) { this.closeSettings(true); return; }
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.settingsOpen = true;
    if (this.state === 'playing') this.state = 'paused';
    this.pauseMenu?.classList.remove('is-visible');
    this.settingsMenu?.classList.add('is-visible');
    this.syncSettingsMenu();
    this.updateMusicMix();
    this.drawHud(true);
  }

  private closeSettings(resume: boolean) {
    this.settingsOpen = false;
    this.settingsMenu?.classList.remove('is-visible');
    if (resume && this.state === 'paused') this.state = 'playing';
    this.pauseMenu?.classList.toggle('is-visible', this.state === 'paused' && !this.refillChoicePending);
    this.updateMusicMix();
    if (this.state === 'playing' || this.state === 'paused') this.drawHud(this.state === 'paused');
  }

  private applySetting(index: number) {
    if (index === 0) {
      this.musicEnabled = !this.musicEnabled;
      localStorage.setItem('fagiolo-music-enabled', String(this.musicEnabled));
      if (this.musicEnabled) this.startBackgroundMusic();
      else this.stopBackgroundMusic();
    } else if (index === 1) {
      this.soundEnabled = !this.soundEnabled;
      localStorage.setItem('fagiolo-sound-enabled', String(this.soundEnabled));
      this.updateSfxMix();
      if (this.soundEnabled) this.playGameSound('power');
    } else if (index === 2) {
      this.screenShakeEnabled = !this.screenShakeEnabled;
      localStorage.setItem('fagiolo-screen-shake', String(this.screenShakeEnabled));
    } else if (index === 3) {
      this.toggleFullscreen();
    }
    this.syncSettingsMenu();
    this.drawHud(true);
  }

  private syncSettingsMenu() {
    const values = [this.musicEnabled, this.soundEnabled, this.screenShakeEnabled];
    this.settingsMenu?.querySelectorAll<HTMLButtonElement>('.settings-toggle').forEach(button => {
      const index = Number(button.dataset.setting);
      if (index === 3) {
        button.textContent = this.scale.isFullscreen ? 'FULLSCREEN' : 'WINDOWED';
        button.setAttribute('aria-pressed', String(this.scale.isFullscreen));
      } else {
        const enabled = values[index];
        button.textContent = enabled ? 'ON' : 'OFF';
        button.setAttribute('aria-pressed', String(enabled));
      }
    });
    const fullscreenButton = this.gameTopControls?.querySelector<HTMLButtonElement>('[data-action="fullscreen"]');
    if (fullscreenButton) {
      const fullscreen = this.scale.isFullscreen;
      fullscreenButton.setAttribute('aria-pressed', String(fullscreen));
      fullscreenButton.setAttribute('aria-label', fullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
      const label = fullscreenButton.querySelector('small');
      if (label) label.textContent = fullscreen ? 'EXIT FULL' : 'FULL';
    }
    for (const [kind, value] of [['music', this.musicVolume], ['effects', this.soundEffectsVolume]] as const) {
      const range = this.settingsMenu?.querySelector<HTMLInputElement>(`#${kind}-volume-range`);
      if (range) {
        range.value = String(Math.round(value * 100));
        range.parentElement?.querySelector('output')?.replaceChildren(`${range.value}%`);
      }
    }
  }

  private quitToLevelSelect() {
    this.pendingLandscapeLevel = undefined;
    this.orientationResumeState = undefined;
    this.hideOrientationGate();
    this.returnToTitle();
    this.showLevelSelect();
  }

  private retryCurrentLevel() {
    if (this.state !== 'lost' && this.state !== 'timeout') return;
    const levelToRetry = this.levelIndex;
    this.gameResultActions?.classList.remove('is-visible');
    this.startGame(levelToRetry);
  }

  private returnToTitle() {
    this.state = 'title';
    this.setCrispOverlayActive(false);
    this.settingsOpen = false;
    this.refillChoicePending = false;
    this.refillChoiceMenu?.classList.remove('is-visible');
    this.pendingLandscapeLevel = undefined;
    this.orientationResumeState = undefined;
    this.hideOrientationGate();
    this.gameResultActions?.classList.remove('is-visible');
    this.levelMenu?.classList.remove('is-visible');
    this.gameTopControls?.classList.remove('is-visible');
    this.touchControlMenu?.classList.remove('is-visible');
    this.pauseMenu?.classList.remove('is-visible');
    this.settingsMenu?.classList.remove('is-visible');
    this.landingMenu?.classList.add('is-visible');

    // Gameplay sprites remain in the Phaser scene after a run. Hide them before
    // showing the title so the transparent landing overlay cannot reveal the level.
    this.cameras.main.stopFollow();
    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setScroll(0, 0);
    this.titleStartZone?.setActive(true).setInteractive();
    this.titleImage?.setActive(false).setVisible(false);
    this.titleLayer?.setActive(false).setVisible(false);
    this.tweens.killTweensOf(this.levelBanner);
    this.levelBanner?.setVisible(false);
    this.signText?.setVisible(false);
    this.hud?.setVisible(false);
    this.worldStaticArt?.setVisible(false);
    this.art?.setVisible(false);
    this.guardLightArt?.setVisible(false);
    this.heroSprite?.setVisible(false);
    this.platformSprites.forEach(sprite => sprite.setVisible(false));
    this.guardSprites.forEach(sprite => sprite.setVisible(false));
    this.spikeSprites.forEach(sprite => sprite.setVisible(false));
    this.worldPropSprites.forEach(sprite => sprite.setVisible(false));
    this.chestSprites.forEach(sprite => sprite.setVisible(false));
    this.laserPostSprites.forEach(pair => pair.forEach(sprite => sprite.setVisible(false)));
    this.coinSprites.forEach(sprite => sprite.setVisible(false));
    this.refillSprite?.setVisible(false);
    this.extraLifePickupSprite?.setVisible(false);
    this.powerupSprites.forEach(sprite => sprite.setVisible(false));
    this.powerupChargeTexts.forEach(text => text.setVisible(false));
    this.modalArt?.clear().setVisible(false);
    for (const key of ['scoreLabel', 'scoreText', 'timerLabel', 'timerText', 'livesLabel', 'livesCount', 'coinsLabel', 'coinsText', 'routeLabel', 'routeValue', 'modalTitle', 'modalBody', 'modalButtonText', 'modalSecondaryButtonText']) {
      ((this as any)[key] as Phaser.GameObjects.Text | undefined)?.setVisible(false);
    }
    for (const groupName of ['powerupLabels', 'powerupStatus']) {
      ((this as any)[groupName] as Phaser.GameObjects.Text[] | undefined)?.forEach(text => text.setVisible(false));
    }
    this.setLandingBackdrop();
    this.updateMusicMix();
  }

  private setLandingBackdrop() {
    const gameSurface = document.getElementById('game');
    if (!gameSurface) return;
    const portraitPhone = window.matchMedia('(orientation: portrait)').matches && window.innerWidth <= 760;
    gameSurface.style.backgroundColor = '#102744';
    gameSurface.style.backgroundImage = "url('/assets/fagiolo-landing-art.webp')";
    gameSurface.style.backgroundRepeat = 'no-repeat';
    gameSurface.style.backgroundPosition = portraitPhone ? '58% center' : '62% center';
    gameSurface.style.backgroundSize = portraitPhone ? 'auto 100%' : '115% auto';
  }

  private toggleFullscreen() {
    if (this.scale.isFullscreen) this.scale.stopFullscreen();
    else this.scale.startFullscreen();
    window.setTimeout(() => this.syncSettingsMenu(), 120);
  }

  private startBackgroundMusic() {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass || !this.musicEnabled) return;
    this.audioContext ??= new AudioContextClass();
    if (this.audioContext.state === 'suspended') void this.audioContext.resume();
    if (!this.musicBus) {
      this.musicBus = this.audioContext.createGain();
      this.musicBus.connect(this.audioContext.destination);
    }
    this.updateMusicMix();
    if (this.musicTimer !== undefined) return;
    const melody = [587, 0, 698, 659, 523, 0, 440, 0, 587, 0, 523, 440, 392, 0, 349, 0, 440, 0, 523, 587, 659, 0, 587, 0, 523, 0, 440, 392, 349, 0, 392, 0];
    const bass = [73.42, 0, 0, 0, 110, 0, 0, 0, 65.41, 0, 0, 0, 98, 0, 0, 0, 58.27, 0, 0, 0, 87.31, 0, 0, 0, 55, 0, 0, 0, 82.41, 0, 0, 0];
    const chords = [[146.83, 174.61, 220], [130.81, 164.81, 196], [116.54, 146.83, 174.61], [110, 146.83, 174.61]];
    const beat = 60 / 112 / 2;
    const playNote = (frequency: number, wave: OscillatorType, peak: number, duration: number, start: number) => {
      if (!frequency || !this.audioContext || !this.musicBus) return;
      const oscillator = this.audioContext.createOscillator();
      const envelope = this.audioContext.createGain();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, start);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(peak, start + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(envelope); envelope.connect(this.musicBus);
      oscillator.start(start); oscillator.stop(start + duration + 0.02);
    };
    this.nextMusicTime = this.audioContext.currentTime + 0.06;
    this.musicTimer = window.setInterval(() => {
      if (!this.musicEnabled || !this.audioContext || this.audioContext.state !== 'running') return;
      const now = this.audioContext.currentTime;
      if (this.nextMusicTime < now - beat) this.nextMusicTime = now + 0.04;
      const horizon = now + 0.12;
      while (this.nextMusicTime < horizon) {
        const step = this.musicStep++ % melody.length;
        const at = this.nextMusicTime;
        playNote(melody[step], 'triangle', 0.2, beat * 0.78, at);
        playNote(bass[step], 'sine', 0.24, beat * 1.65, at);
        if (step % 8 === 0) {
          for (const note of chords[Math.floor(step / 8)]) playNote(note, 'triangle', 0.025, beat * 3.7, at);
        }
        this.nextMusicTime += beat;
      }
    }, 25);
  }

  private stopBackgroundMusic() {
    if (this.musicTimer !== undefined) window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
    if (this.musicBus && this.audioContext) this.musicBus.gain.setTargetAtTime(0.0001, this.audioContext.currentTime, 0.08);
  }

  private updateMusicMix() {
    if (!this.musicBus || !this.audioContext) return;
    const sceneMix = this.state === 'playing' ? 0.42 : this.state === 'paused' ? 0.1 : 0.2;
    const volume = this.musicEnabled ? sceneMix * this.musicVolume : 0.0001;
    this.musicBus.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.24);
  }

  private updateSfxMix() {
    if (this.sfxBus && this.audioContext) {
      const volume = this.soundEnabled ? 0.72 * this.soundEffectsVolume : 0.0001;
      this.sfxBus.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.08);
    }
  }

  private showLevelSelect() {
    if (this.state === 'playing' || this.state === 'paused') return;
    this.state = 'title';
    this.gameTopControls?.classList.remove('is-visible');
    this.touchControlMenu?.classList.remove('is-visible');
    this.pauseMenu?.classList.remove('is-visible');
    this.settingsMenu?.classList.remove('is-visible');
    this.landingMenu?.classList.remove('is-visible');
    this.titleImage?.setActive(false).setVisible(false);
    this.titleLayer?.setActive(false).setVisible(false);
    this.levelMenu?.classList.add('is-visible');
    this.startBackgroundMusic();
    this.updateMusicMix();
    this.playGameSound('menu');
    if (this.online.isConfigured) void this.refreshLevelAvailability();
    const cards = this.levelMenu?.querySelectorAll<HTMLButtonElement>('.level-card');
    cards?.forEach((card, index) => {
      card.disabled = false;
      card.querySelector('.level-status')!.textContent = index < this.unlockedLevel ? 'COMPLETED · REPLAY' : 'READY TO PLAY';
    });
    this.syncLevelAvailability();
  }

  private async refreshLevelAvailability() {
    try {
      const settings = await this.online.getLevelSettings();
      this.closedLevels = new Set(settings.filter(level => !level.is_open).map(level => level.level));
      this.levelAvailabilityLoaded = true;
      this.syncLevelAvailability();
    } catch { this.levelAvailabilityLoaded = true; /* If online access is unavailable, preserve the current local level menu. */ }
  }

  private startGame(level = this.levelIndex) {
    if (this.state === 'playing' || this.state === 'paused') return;
    if (this.online.isConfigured && !this.levelAvailabilityLoaded) {
      void this.refreshLevelAvailability().then(() => this.startGame(level));
      return;
    }
    if (this.closedLevels.has(level + 1)) { this.showLevelSelect(); return; }
    if (this.requiresLandscape()) {
      this.pendingLandscapeLevel = Phaser.Math.Clamp(level, 0, 2);
      this.updateOrientationGate(false);
      this.orientationGate?.classList.add('is-visible');
      this.orientationGate?.setAttribute('aria-hidden', 'false');
      return;
    }
    this.pendingLandscapeLevel = undefined;
    this.orientationResumeState = undefined;
    this.gameResultActions?.classList.remove('is-visible');
    this.orientationGate?.classList.remove('is-visible');
    this.orientationGate?.setAttribute('aria-hidden', 'true');
    this.levelIndex = Phaser.Math.Clamp(level, 0, 2);
    this.levelMenu?.classList.remove('is-visible');
    this.landingMenu?.classList.remove('is-visible');
    this.titleStartZone?.disableInteractive();
    this.playGameSound('start');
    // Each level uses the complete course, with its own setting and progress.
    const sourceStart = LEVEL_STARTS[this.levelIndex];
    const sourceEnd = LEVEL_ENDS[this.levelIndex];
    this.courseWidth = sourceEnd - sourceStart;
    const inCourse = (x: number) => x >= sourceStart && x < sourceEnd;
    this.activePlatformIndices = [];
    const platformOffsets = LEVEL_PLATFORM_Y_OFFSETS[this.levelIndex];
    const platformXOffsets = LEVEL_PLATFORM_X_OFFSETS[this.levelIndex];
    const platformWidthOffsets = LEVEL_PLATFORM_WIDTH_OFFSETS[this.levelIndex];
    const crateXOffsets = LEVEL_CRATE_X_OFFSETS[this.levelIndex];
    const levelGuardOffsets = LEVEL_GUARD_X_OFFSETS[this.levelIndex];
    const levelSpikeOffsets = LEVEL_SPIKE_X_OFFSETS[this.levelIndex];
    this.activePlatforms = this.sourcePlatforms.flatMap((platform, index) => {
      const clippedLeft = Math.max(platform.x, sourceStart);
      const clippedRight = Math.min(platform.x + platform.w, sourceEnd);
      if (clippedRight <= clippedLeft) return [];
      this.activePlatformIndices.push(index);
      return [{
        ...platform,
        x: clippedLeft - sourceStart + (platformXOffsets[index] ?? 0),
        y: platform.y + (platformOffsets[index] ?? 0),
        w: clippedRight - clippedLeft + (platformWidthOffsets[index] ?? 0),
      }];
    });
    const sourcePlatformIndexAt = (x: number, referenceY: number) => {
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      this.sourcePlatforms.forEach((platform, index) => {
        if (x < platform.x || x > platform.x + platform.w) return;
        const distance = Math.abs(platform.y - referenceY);
        if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
      });
      return bestIndex;
    };
    const platformShiftAt = (x: number, referenceY: number) => {
      const platformIndex = sourcePlatformIndexAt(x, referenceY);
      return platformIndex < 0 ? 0 : platformOffsets[platformIndex] ?? 0;
    };
    const platformXShiftAt = (x: number, referenceY: number) => {
      const platformIndex = sourcePlatformIndexAt(x, referenceY);
      return platformIndex < 0 ? 0 : platformXOffsets[platformIndex] ?? 0;
    };
    this.coins = this.sourceCoins.filter(coin => inCourse(coin.x)).map(coin => ({
      ...coin,
      x: coin.x - sourceStart + platformXShiftAt(coin.x, coin.y)
        + (coin.crateIndex === undefined ? 0 : crateXOffsets[coin.crateIndex] ?? 0),
      y: coin.y + platformShiftAt(coin.x, coin.y), taken: false,
    }));
    this.activeCoinCount = this.coins.length;
    this.raidBonusTarget = Math.ceil(this.coins.length * 0.65);
    this.raidBonusAwarded = false;
    this.crates = this.sourceCrates.filter(crate => inCourse(crate.x)).map((crate, crateIndex) => ({
      ...crate,
      x: crate.x - sourceStart + platformXShiftAt(crate.x, crate.surfaceY)
        + (crateXOffsets[crateIndex] ?? 0),
      surfaceY: crate.surfaceY + platformShiftAt(crate.x, crate.surfaceY), broken: false,
    }));
    this.spikeHazards = this.sourceSpikeHazards.filter(hazard => inCourse(hazard.x)).map((hazard, index) => {
      const hazardX = hazard.x + (levelSpikeOffsets[index] ?? 0);
      return {
        ...hazard,
        x: hazardX - sourceStart + platformXShiftAt(hazard.x, hazard.surfaceY),
        surfaceY: hazard.surfaceY + platformShiftAt(hazard.x, hazard.surfaceY),
        phaseOffset: hazard.phaseOffset + LEVEL_SPIKE_PHASE_OFFSETS[this.levelIndex],
      };
    });
    this.laserGates = this.sourceLaserGates
      .filter(gate => inCourse((gate.leftPostX + gate.rightPostX) / 2))
      .map((gate, gateIndex) => {
        const offset = LEVEL_LASER_X_OFFSETS[this.levelIndex][gateIndex] ?? 0;
        return {
          ...gate,
          leftPostX: gate.leftPostX - sourceStart + offset,
          rightPostX: gate.rightPostX - sourceStart + offset,
          phaseOffset: gate.phaseOffset + this.levelIndex * 0.45,
        };
      });
    this.guards = this.sourceGuards.filter(guard => inCourse(guard.spawnX)).map((guard, guardIndex) => {
      const hostIndex = sourcePlatformIndexAt(guard.spawnX, guard.spawnY + 30);
      const host = this.activePlatforms[hostIndex];
      const guardXOffset = (platformXOffsets[hostIndex] ?? 0) + (levelGuardOffsets[guardIndex] ?? 0);
      const guardX = guard.spawnX + guardXOffset;
      const groundShift = platformShiftAt(guard.spawnX, guard.spawnY + 30);
      const patrolMin = Math.max(guard.minX + guardXOffset, (host?.x ?? 0) + 34);
      const patrolMax = Math.min(guard.maxX + guardXOffset, (host?.x ?? this.courseWidth) + (host?.w ?? 0) - 34);
      return {
        ...guard, x: guardX - sourceStart, spawnX: guardX - sourceStart,
        spawnY: guard.spawnY + groundShift,
        minX: patrolMin - sourceStart,
        maxX: patrolMax - sourceStart,
        lastSeenX: guardX - sourceStart,
      };
    });
    const hasBarrel = inCourse(this.sourceBarrel.x);
    this.barrel = {
      ...this.sourceBarrel,
      x: hasBarrel ? this.sourceBarrel.x - sourceStart + platformXShiftAt(this.sourceBarrel.x, this.sourceBarrel.surfaceY) + LEVEL_BARREL_X_OFFSETS[this.levelIndex] : -10000,
      surfaceY: this.sourceBarrel.surfaceY + platformShiftAt(this.sourceBarrel.x, this.sourceBarrel.surfaceY),
    };
    this.checkpoints = this.sourceCheckpoints.filter(point => point > sourceStart && point < sourceEnd).map(point => point - sourceStart);
    if (this.checkpoints.length === 0) this.checkpoints = [Math.floor(this.courseWidth * 0.55)];
    const pickupSurface = (x: number) => this.activePlatforms.find(platform => x >= platform.x && x <= platform.x + platform.w)?.y ?? FLOOR;
    this.refillPickup = { x: LEVEL_REFILL_X[this.levelIndex], y: pickupSurface(LEVEL_REFILL_X[this.levelIndex]) - 42, taken: false };
    this.extraLifePickup = { x: LEVEL_EXTRA_LIFE_X[this.levelIndex], y: pickupSurface(LEVEL_EXTRA_LIFE_X[this.levelIndex]) - 40, taken: false };
    const levelStart = 0;
    const levelEnd = this.courseWidth;
    const firstPlatform = this.activePlatforms[0];
    // Keep the full sprite inside the opening view on narrow mobile screens.
    const spawnX = Math.max(140, (firstPlatform?.x ?? 0) + 140);
    const spawnPlatform = this.activePlatforms.find(platform => spawnX >= platform.x && spawnX <= platform.x + platform.w);
    const spawnSurfaceY = spawnPlatform?.y ?? FLOOR;
    this.player = { x: spawnX, y: spawnSurfaceY - 34, vx: 0, vy: 0, grounded: true };
    this.coins.forEach(c => { c.locked = c.crateIndex !== undefined; });
    this.crates.forEach(crate => { crate.broken = false; });
    this.score = 0; this.lives = 3; this.timeLeft = RUN_TIME_SECONDS; this.elapsed = 0; this.runElapsedMs = 0; this.hurtTimer = 0; this.animTime = 0; this.leaderboardRunStatus = '';
    this.heroGait = 0; this.jumpAnticipationTimer = 0; this.jumpBufferTimer = 0; this.coyoteTimer = 0; this.autoLeapForward = false; this.landingTimer = 0; this.landingSquash = 0;
    this.checkpointX = spawnX; this.checkpointY = spawnSurfaceY - 34; this.nextCheckpointIndex = 0;
    this.levelIndex = Phaser.Math.Clamp(level, 0, 2);
    this.tweens.killTweensOf(this.levelBanner);
    this.levelBanner.setVisible(false).setAlpha(0).setY(145);
    this.chestOpened = false; this.chestAnimTimer = 0;
    this.speedTimer = 0; this.invisibilityTimer = 0; this.magnetTimer = 0; this.powerupCharges = [1, 1, 1]; this.extraLifeAvailable = false; this.refillChoicePending = false; this.refillChoiceMenu?.classList.remove('is-visible'); this.settingsOpen = false;
    this.guards.forEach(guard => { guard.x = guard.spawnX; guard.y = guard.spawnY; guard.direction = guard.spawnDirection; guard.velocity = guard.direction * 76; guard.mode = 'patrol'; guard.timer = 0; guard.turning = false; guard.lastSeenX = guard.x; guard.anim = 0; guard.gait = 0; });
    this.state = 'playing';
    this.hudRefreshTimer = 0;
    this.guardLightRefreshTimer = 0;
    this.gameTopControls?.classList.add('is-visible');
    this.touchControlMenu?.classList.toggle('is-visible', this.touchControlsVisible);
    this.pauseMenu?.classList.remove('is-visible');
    this.settingsMenu?.classList.remove('is-visible');
    this.startBackgroundMusic();
    this.updateMusicMix();
    const gameSurface = document.getElementById('game');
    if (gameSurface) gameSurface.style.backgroundImage = `url('${LEVEL_BACKGROUNDS[this.levelIndex]}')`;
    // The level and landing menus are DOM siblings of Phaser's transparent
    // canvas. Keep the canvas explicitly above the page artwork so gameplay
    // objects cannot be covered by the scenery layer.
    const canvas = this.game.canvas;
    canvas.style.visibility = 'visible';
    canvas.style.opacity = '1';
    canvas.style.zIndex = '2';
    this.titleImage?.setActive(false).setVisible(false);
    this.titleLayer?.setActive(false).setVisible(false);
    this.titleStartZone?.disableInteractive();
    this.signText.setVisible(true);
    // Keep the scene artwork on the game surface behind the transparent canvas.
    // Phaser's camera background image is hidden because this game uses a
    // viewport-cover CSS background for the level scenery.
    this.backgroundArt.forEach(layer => layer.setVisible(false));
    this.platformSprites.forEach(sprite => sprite.setVisible(false));
    this.activePlatforms.forEach((platform, activeIndex) => {
      const sourceIndex = this.activePlatformIndices[activeIndex];
      const sprite = this.platformSprites[sourceIndex];
      sprite?.setTexture(`stone-platform-${this.levelIndex}-${sourceIndex}`)
        .setPosition(platform.x - 4, platform.y - 1)
        .setDisplaySize(platform.w + 8, platform.h + 15)
        .setVisible(true);
    });
    this.art.setVisible(true);
    this.worldStaticArt.setVisible(true);
    this.guardLightArt.setVisible(true);
    this.hud.setVisible(true);
    this.heroSprite.setVisible(true);
    this.heroSprite.setPosition(this.player.x, this.player.y);
    this.guardSprites.forEach(sprite => sprite.setVisible(false));
    this.guards.forEach((guard, index) => this.guardSprites[index]?.setDepth(5).setPosition(guard.x, guard.y).setVisible(true));
    this.spikeSprites.forEach(sprite => sprite.setVisible(false));
    this.spikeHazards.forEach((hazard, index) => this.spikeSprites[index]?.setPosition(hazard.x, hazard.surfaceY).setVisible(true));
    this.worldPropSprites.forEach(sprite => sprite.setVisible(false));
    this.crates.forEach((crate, index) => this.worldPropSprites[index]?.setPosition(crate.x, crate.surfaceY).setVisible(true));
    if (this.barrel.x >= 0) this.worldPropSprites[this.crates.length]?.setPosition(this.barrel.x, this.barrel.surfaceY).setVisible(true);
    this.chestSprites.forEach(sprite => sprite.setVisible(false).setTexture('prop-chest-0'));
    this.laserPostSprites.forEach(pair => pair.forEach(sprite => sprite.setVisible(false)));
    this.laserGates.forEach((gate, index) => {
      this.laserPostSprites[index]?.[0].setPosition(gate.leftPostX, LASER_POST_Y).setVisible(true);
      this.laserPostSprites[index]?.[1].setPosition(gate.rightPostX, LASER_POST_Y).setVisible(true);
    });
    this.coinSprites.forEach(sprite => sprite.setVisible(false));
    this.coins.forEach((coin, index) => this.coinSprites[index]?.setPosition(coin.x, coin.y).setVisible(!coin.taken));
    this.refillSprite?.setPosition(this.refillPickup.x, this.refillPickup.y).setVisible(true);
    this.extraLifePickupSprite?.setPosition(this.extraLifePickup.x, this.extraLifePickup.y).setVisible(true);
    this.platformSprites.forEach(sprite => sprite.setDepth(1));
    this.worldPropSprites.forEach(sprite => sprite.setDepth(2));
    this.spikeSprites.forEach(sprite => sprite.setDepth(2.5));
    this.coinSprites.forEach(sprite => sprite.setDepth(3));
    this.chestSprites.forEach(sprite => sprite.setDepth(2.5));
    this.laserPostSprites.forEach(pair => pair.forEach(sprite => sprite.setDepth(2.5)));
    this.heroSprite.setDepth(6);
    this.art.setDepth(3);
    this.guardLightArt.setDepth(4);
    this.cameras.main.stopFollow();
    this.cameras.main.setViewport(0, 0, this.scale.width, this.scale.height);
    this.cameras.main.setBounds(levelStart, 0, levelEnd - levelStart, H);
    const shortLandscapeTouch = this.isShortLandscapeTouch();
    this.cameras.main.setScroll(levelStart, 0);
    this.cameras.main.startFollow(this.heroSprite, true, 0.12, shortLandscapeTouch ? 0.12 : 0.08);
    this.setCrispOverlayActive(window.devicePixelRatio > 1.01);
    const goalX = levelEnd - 110;
    this.chestSprites[0].setPosition(goalX, FLOOR).setVisible(true).setTexture('prop-chest-0');
    this.chestSprites[1].setVisible(false);
    this.drawStaticWorld();
    this.drawWorld();
    this.drawHud(false);
  }

  private togglePause() {
    if (this.refillChoicePending) return;
    if (this.settingsOpen) { this.closeSettings(true); return; }
    if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'playing';
    this.pauseMenu?.classList.toggle('is-visible', this.state === 'paused' && !this.refillChoicePending);
    this.updateMusicMix();
    this.drawHud(this.state === 'paused');
  }

  private resizeGameView(width: number, height: number) {
    if (!width || !height) return;
    // Pull the phone-landscape camera back a little so more of the route is
    // visible at once, while keeping the scene proportional and readable.
    const shortLandscapeTouch = this.isShortLandscapeTouch(width, height);
    const zoomX = shortLandscapeTouch
      ? Math.min(0.82, Math.min(width / 1280, height / 700) * 1.1)
      : Math.min(1, width / W, height / H);
    const zoomY = zoomX;
    const viewWidth = width / zoomX;
    const viewHeight = height / zoomY;
    // The camera viewport is measured in canvas pixels, not world units.
    // Using the expanded world-view dimensions here applies the mobile fit
    // scale twice, making the level and its sprites look unusually small.
    this.cameras.main.setViewport(0, 0, width, height);
    this.viewOffsetX = Math.max(0, (viewWidth - W) / 2);
    this.viewOffsetY = Math.max(0, (viewHeight - H) / 2);
    this.cameras.main.setZoom(zoomX, zoomY);
    this.applyGameplayTextResolution(shortLandscapeTouch ? 2 : 1);

    // Keep ground platforms visually connected to the bottom of a taller
    // browser viewport while preserving their collision tops and jump layout.
    this.activePlatforms.forEach((platform, activeIndex) => {
      if (platform.y !== FLOOR) return;
      const sprite = this.platformSprites[this.activePlatformIndices[activeIndex]];
      if (!sprite) return;
      sprite.setDisplaySize(platform.w + 8, Math.max(platform.h + 15, viewHeight - platform.y));
    });

    const fitCover = (image: Phaser.GameObjects.Image) => {
      // Use the texture's native dimensions: the Game Object's display size can
      // be changed during a previous resize and must not feed back into sizing.
      const source = image.texture.getSourceImage() as { width?: number; height?: number };
      const sourceWidth = source.width || W;
      const sourceHeight = source.height || H;
      const coverScale = Math.max(viewWidth / sourceWidth, viewHeight / sourceHeight);
      const displayWidth = sourceWidth * coverScale;
      const displayHeight = sourceHeight * coverScale;
      image.setOrigin(0.5).setPosition(viewWidth / 2, viewHeight / 2).setDisplaySize(displayWidth, displayHeight);
    };
    if (this.titleImage) fitCover(this.titleImage);
    this.backgroundArt.forEach(image => image
      .setOrigin(0, 0)
      .setPosition(0, 0)
      .setDisplaySize(viewWidth, viewHeight));
    this.titleLayer?.setPosition(this.viewOffsetX, this.viewOffsetY);
    this.titleStartZone?.setPosition(543 + this.viewOffsetX, 640 + this.viewOffsetY);
    this.levelBanner?.setPosition(viewWidth / 2, 145 + this.viewOffsetY);
    this.modalButtonZone?.setPosition(viewWidth / 2, viewHeight / 2 + 142);
    if (this.state === 'title') this.setLandingBackdrop();
    const crispModeChanged = this.setCrispOverlayActive(this.state !== 'title' && window.devicePixelRatio > 1.01);
    if (crispModeChanged && this.state !== 'title') {
      this.drawStaticWorld();
      this.drawWorld();
      this.drawHud(this.state !== 'playing');
    }
  }

  private createCrispMobileOverlay() {
    const mount = document.getElementById('game');
    if (!mount) return;
    mount.querySelector('.game-crisp-overlay')?.remove();
    const layer = document.createElement('div');
    layer.className = 'game-crisp-overlay';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<div class="crisp-mobile-hud">
      <div class="crisp-readouts">
        <div class="crisp-stat"><span>SCORE</span><strong data-crisp-stat="score">00000</strong></div>
        <div class="crisp-stat"><span>TIME</span><strong data-crisp-stat="time">00:00</strong></div>
        <div class="crisp-stat"><span>BEANS</span><strong data-crisp-stat="beans">0/0</strong></div>
        <div class="crisp-stat crisp-life-stat"><span>LIVES</span><div><span class="crisp-life-pips" data-crisp-stat="life-pips"><i></i><i></i><i></i><i></i></span><strong data-crisp-stat="lives">3/4</strong></div></div>
        <div class="crisp-stat"><span>LEVEL</span><strong class="crisp-level" data-crisp-stat="level">1/3</strong></div>
      </div>
      <div class="crisp-powerups">
        <div class="crisp-powerup crisp-speed"><img src="/assets/power-speed.png" alt=""><span data-crisp-charge="0">1</span><b>SPEED</b><small data-crisp-status="0">1 CHARGE</small></div>
        <div class="crisp-powerup crisp-cloak"><img src="/assets/power-cloak.png" alt=""><span data-crisp-charge="1">1</span><b>CLOAK</b><small data-crisp-status="1">1 CHARGE</small></div>
        <div class="crisp-powerup crisp-magnet"><img src="/assets/power-magnet.png" alt=""><span data-crisp-charge="2">1</span><b>MAGNET</b><small data-crisp-status="2">1 CHARGE</small></div>
        <div class="crisp-powerup crisp-life"><img src="/assets/power-life.png" alt=""><span data-crisp-charge="3">0</span><b>EXTRA LIFE</b><small data-crisp-status="3">FIND</small></div>
      </div>
    </div>
    <div class="crisp-world-layer">
      <div class="crisp-sign-board" aria-hidden="true"></div>
      <div class="crisp-sign-instructions" aria-hidden="true">MOVE: A/D OR ARROWS<br>JUMP: W / SPACE / UP<br>BEANS = SCORE<br>CHEST = EXIT</div>
    </div>
    `;
    mount.append(layer);
    this.crispMobileLayer = layer;
    this.crispWorldLayer = layer.querySelector<HTMLDivElement>('.crisp-world-layer') ?? undefined;
    layer.querySelectorAll<HTMLElement>('[data-crisp-stat]').forEach(node => this.crispHudNodes.set(node.dataset.crispStat!, node));
    layer.querySelectorAll<HTMLElement>('[data-crisp-charge]').forEach(node => this.crispHudNodes.set(`charge-${node.dataset.crispCharge}`, node));
    layer.querySelectorAll<HTMLElement>('[data-crisp-status]').forEach(node => this.crispHudNodes.set(`status-${node.dataset.crispStatus}`, node));
    this.crispSignBoard = layer.querySelector<HTMLDivElement>('.crisp-sign-board') ?? undefined;
    this.crispSignInstructions = layer.querySelector<HTMLDivElement>('.crisp-sign-instructions') ?? undefined;

    const addSpriteNode = (key: string, className: string) => {
      const node = document.createElement('img');
      node.className = `game-crisp-sprite ${className}`;
      node.alt = '';
      node.draggable = false;
      node.setAttribute('aria-hidden', 'true');
      this.crispWorldLayer?.append(node);
      this.crispWorldNodes.set(key, node);
    };
    addSpriteNode('hero', 'crisp-hero');
    this.guardSprites.forEach((_, index) => addSpriteNode(`guard-${index}`, 'crisp-guard'));
    this.coinSprites.forEach((_, index) => addSpriteNode(`coin-${index}`, 'crisp-coin'));
    this.chestSprites.forEach((_, index) => addSpriteNode(`chest-${index}`, 'crisp-chest'));
    this.worldPropSprites.forEach((_, index) => addSpriteNode(`prop-${index}`, 'crisp-prop'));
    this.spikeSprites.forEach((_, index) => addSpriteNode(`spike-${index}`, 'crisp-spike'));
    this.laserPostSprites.forEach((pair, gateIndex) => pair.forEach((_, postIndex) => addSpriteNode(`laser-${gateIndex}-${postIndex}`, 'crisp-laser-post')));
    addSpriteNode('refill', 'crisp-refill');
    addSpriteNode('extra-life', 'crisp-extra-life');

    // DOM sprites use separate image elements from Phaser's texture cache.
    // Decode every animation frame ahead of play so the first walk cycle does
    // not hitch while the browser decodes a newly selected frame.
    const animationAssets = [
      ...Array.from({ length: 3 }, (_, frame) => `/assets/fagiolo-idle-v2-${frame}.png`),
      ...Array.from({ length: 6 }, (_, frame) => `/assets/fagiolo-walk-v2-${frame}.png`),
      ...Array.from({ length: 4 }, (_, frame) => `/assets/fagiolo-jump-v2-${frame}.png`),
      ...Array.from({ length: 6 }, (_, frame) => `/assets/guard-walk-${frame}-aligned.png`),
      '/assets/guard-idle-aligned.png', '/assets/guard-stunned-aligned.png',
    ];
    this.crispPreloadedImages = animationAssets.map(src => {
      const image = new Image();
      image.src = src;
      void image.decode?.().catch(() => undefined);
      return image;
    });
  }

  private setCrispOverlayActive(active: boolean) {
    if (this.crispOverlayActive === active) return false;
    this.crispOverlayActive = active;
    this.crispMobileLayer?.classList.toggle('is-active', active);
    if (!active) this.crispWorldNodes.forEach(node => { node.style.display = 'none'; });
    return true;
  }

  private crispAssetFor(textureKey: string) {
    const idleFrame = /^bean-idle-(\d+)$/.exec(textureKey);
    if (idleFrame) return `/assets/fagiolo-idle-v2-${idleFrame[1]}.png`;
    const walkFrame = /^bean-walk-(\d+)$/.exec(textureKey);
    if (walkFrame) return `/assets/fagiolo-walk-v2-${walkFrame[1]}.png`;
    const jumpFrame = /^bean-jump-(\d+)$/.exec(textureKey);
    if (jumpFrame) return `/assets/fagiolo-jump-v2-${jumpFrame[1]}.png`;
    if (/^guard-walk-\d+$/.test(textureKey)) return `/assets/${textureKey}-aligned.png`;
    if (textureKey === 'guard-idle') return '/assets/guard-idle-aligned.png';
    if (textureKey === 'guard-stunned') return '/assets/guard-stunned-aligned.png';
    if (/^prop-chest-[0-3]$/.test(textureKey)) return `/assets/${textureKey}.png`;
    if (textureKey === 'bean-coin') return '/assets/bean-coin-optimized.png';
    if (textureKey === 'prop-crate' || textureKey === 'prop-barrel' || textureKey === 'prop-spikes' || textureKey === 'prop-laser-post') return `/assets/${textureKey}.png`;
    if (textureKey === 'power-life') return '/assets/power-life.png';
    return undefined;
  }

  private placeCrispSprite(key: string, sprite: Phaser.GameObjects.Image, visible: boolean) {
    const node = this.crispWorldNodes.get(key);
    if (!node) return;
    const asset = this.crispAssetFor(sprite.texture.key);
    const camera = this.cameras.main;
    const cameraLeft = camera.scrollX - 220;
    const cameraRight = camera.scrollX + camera.width / camera.zoomX + 220;
    if (!visible || !asset || sprite.x + sprite.displayWidth / 2 < cameraLeft || sprite.x - sprite.displayWidth / 2 > cameraRight) {
      if (node.style.display !== 'none') node.style.display = 'none';
      return;
    }
    if (node.dataset.asset !== asset) {
      node.src = asset;
      node.dataset.asset = asset;
    }
    const worldX = sprite.x - camera.scrollX * sprite.scrollFactorX;
    const worldY = sprite.y - camera.scrollY * sprite.scrollFactorY;
    const cameraMatrix = (camera as typeof camera & { matrix: { transformPoint(x: number, y: number): { x: number; y: number } } }).matrix;
    const screen = cameraMatrix.transformPoint(worldX, worldY);
    const width = sprite.displayWidth * camera.zoomX;
    const height = sprite.displayHeight * camera.zoomY;
    if (node.style.display !== 'block') node.style.display = 'block';
    const left = `${screen.x - sprite.originX * width}px`;
    const top = `${screen.y - sprite.originY * height}px`;
    const cssWidth = `${width}px`;
    const cssHeight = `${height}px`;
    const opacity = String(sprite.alpha);
    const zIndex = String(Math.round(sprite.depth * 10));
    const transformOrigin = `${sprite.originX * 100}% ${sprite.originY * 100}%`;
    const transform = `${sprite.flipX ? 'scaleX(-1) ' : ''}rotate(${sprite.rotation}rad)`;
    if (node.style.left !== left) node.style.left = left;
    if (node.style.top !== top) node.style.top = top;
    if (node.style.width !== cssWidth) node.style.width = cssWidth;
    if (node.style.height !== cssHeight) node.style.height = cssHeight;
    if (node.style.opacity !== opacity) node.style.opacity = opacity;
    if (node.style.zIndex !== zIndex) node.style.zIndex = zIndex;
    if (node.style.transformOrigin !== transformOrigin) node.style.transformOrigin = transformOrigin;
    if (node.style.transform !== transform) node.style.transform = transform;
    const tint = (sprite as Phaser.GameObjects.Image & { tintTopLeft?: number }).tintTopLeft;
    const filter = tint === 0xffbc55
      ? 'sepia(1) saturate(3) hue-rotate(350deg)'
      : tint === 0x778393 ? 'grayscale(.72) brightness(.78)'
        : tint === 0xff5048 ? 'sepia(1) saturate(5) hue-rotate(300deg)' : '';
    if (node.style.filter !== filter) node.style.filter = filter;
  }

  private syncCrispWorldSprites() {
    if (!this.crispOverlayActive) {
      this.crispWorldNodes.forEach(node => { node.style.display = 'none'; });
      if (this.crispSignBoard) this.crispSignBoard.style.display = 'none';
      if (this.crispSignInstructions) this.crispSignInstructions.style.display = 'none';
      if (this.state !== 'title') {
        this.signText?.setVisible(true);
        this.heroSprite?.setVisible((this.hurtTimer <= 0 || Math.floor(this.animTime * 18) % 2 === 0)
          && (this.invisibilityTimer <= 0 || Math.floor(this.animTime * 12) % 2 === 0));
        this.guardSprites.forEach((sprite, index) => sprite.setVisible(index < this.guards.length));
        this.chestSprites[0]?.setVisible(true);
        this.chestSprites[1]?.setVisible(false);
        this.worldPropSprites.forEach((sprite, index) => sprite.setVisible(index < this.crates.length
          ? !this.crates[index]?.broken : this.barrel.x >= 0));
        this.laserPostSprites.forEach(pair => pair.forEach(post => post.setVisible(true)));
        this.spikeSprites.forEach((sprite, index) => sprite.setVisible(index < this.spikeHazards.length));
        this.coinSprites.forEach((sprite, index) => sprite.setVisible(!this.coins[index]?.taken && !this.coins[index]?.locked));
        this.refillSprite?.setVisible(!this.refillPickup.taken);
        this.extraLifePickupSprite?.setVisible(!this.extraLifePickup.taken);
      }
      return;
    }

    const heroVisible = (this.hurtTimer <= 0 || Math.floor(this.animTime * 18) % 2 === 0)
      && (this.invisibilityTimer <= 0 || Math.floor(this.animTime * 12) % 2 === 0);
    this.placeCrispSprite('hero', this.heroSprite, heroVisible);
    this.heroSprite.setVisible(false);
    this.guardSprites.forEach((sprite, index) => {
      this.placeCrispSprite(`guard-${index}`, sprite, index < this.guards.length);
      sprite.setVisible(false);
    });
    this.chestSprites.forEach((sprite, index) => {
      this.placeCrispSprite(`chest-${index}`, sprite, index === 0);
      sprite.setVisible(false);
    });
    this.worldPropSprites.forEach((sprite, index) => {
      const visible = index < this.crates.length ? !this.crates[index]?.broken : this.barrel.x >= 0;
      this.placeCrispSprite(`prop-${index}`, sprite, visible);
      sprite.setVisible(false);
    });
    this.spikeSprites.forEach((sprite, index) => {
      this.placeCrispSprite(`spike-${index}`, sprite, index < this.spikeHazards.length);
      sprite.setVisible(false);
    });
    this.laserPostSprites.forEach((pair, gateIndex) => pair.forEach((sprite, postIndex) => {
      this.placeCrispSprite(`laser-${gateIndex}-${postIndex}`, sprite, gateIndex < this.laserGates.length);
      sprite.setVisible(false);
    }));
    if (this.refillSprite) {
      this.placeCrispSprite('refill', this.refillSprite, !this.refillPickup.taken);
      this.refillSprite.setVisible(false);
    }
    if (this.extraLifePickupSprite) {
      this.placeCrispSprite('extra-life', this.extraLifePickupSprite, !this.extraLifePickup.taken);
      this.extraLifePickupSprite.setVisible(false);
    }
    this.coinSprites.forEach((sprite, index) => {
      const coin = this.coins[index];
      this.placeCrispSprite(`coin-${index}`, sprite, !!coin && !coin.taken && !coin.locked);
      sprite.setVisible(false);
    });
    this.signText.setVisible(false);
    const camera = this.cameras.main;
    const mobileSignScale = this.isShortLandscapeTouch() ? 0.68 : 1;
    if (this.crispWorldLayer) this.crispWorldLayer.style.clipPath = 'none';
    const cameraMatrix = (camera as typeof camera & { matrix: { transformPoint(x: number, y: number): { x: number; y: number } } }).matrix;
    const boardCenter = cameraMatrix.transformPoint(135 - camera.scrollX, 509 - camera.scrollY);
    const boardWidth = 198 * camera.zoomX * mobileSignScale;
    const boardHeight = 154 * camera.zoomY * mobileSignScale;
    const textCenter = cameraMatrix.transformPoint(this.signText.x - camera.scrollX, this.signText.y - camera.scrollY);
    const mobileBoardDrop = this.isShortLandscapeTouch()
      ? Math.max(64, 88 - (boardCenter.y - boardHeight / 2))
      : 0;
    if (this.crispSignBoard) {
      this.crispSignBoard.style.display = 'block';
      this.crispSignBoard.style.left = `${boardCenter.x - boardWidth / 2}px`;
      this.crispSignBoard.style.top = `${boardCenter.y - boardHeight / 2 + mobileBoardDrop}px`;
      this.crispSignBoard.style.width = `${boardWidth}px`;
      this.crispSignBoard.style.height = `${boardHeight}px`;
    }
    if (this.crispSignInstructions) {
      this.crispSignInstructions.style.display = 'block';
      const compactMobileText = this.isShortLandscapeTouch();
      this.crispSignInstructions.innerHTML = compactMobileText
        ? 'MOVE: ← / →<br>JUMP: ↑<br>BEANS = SCORE<br>CHEST = EXIT'
        : 'MOVE: A/D OR ARROWS<br>JUMP: W / SPACE / UP<br>BEANS = SCORE<br>CHEST = EXIT';
      this.crispSignInstructions.style.left = `${textCenter.x}px`;
      this.crispSignInstructions.style.top = `${textCenter.y + mobileBoardDrop}px`;
      this.crispSignInstructions.style.width = `${184 * camera.zoomX * mobileSignScale}px`;
      this.crispSignInstructions.style.fontSize = `${compactMobileText ? Math.max(8, 14 * camera.zoomY * mobileSignScale) : 15 * camera.zoomY}px`;
      this.crispSignInstructions.style.lineHeight = `${compactMobileText ? Math.max(9, 17 * camera.zoomY * mobileSignScale) : 19 * camera.zoomY}px`;
    }
  }

  private syncCrispHud() {
    if (!this.crispOverlayActive) return;
    const setStat = (key: string, value: string) => {
      const node = this.crispHudNodes.get(key);
      if (node) node.textContent = value;
    };
    const collected = this.coins.filter(coin => coin.taken).length;
    setStat('score', String(this.score).padStart(5, '0'));
    setStat('time', `${String(Math.floor(this.timeLeft / 60)).padStart(2, '0')}:${String(this.timeLeft % 60).padStart(2, '0')}`);
    setStat('beans', `${collected}/${this.coins.length}`);
    setStat('lives', `${this.lives}/4`);
    setStat('level', `${this.levelIndex + 1}/3`);
    this.crispHudNodes.get('time')?.classList.toggle('is-warning', this.timeLeft <= 15);
    const pips = this.crispHudNodes.get('life-pips');
    pips?.querySelectorAll('i').forEach((pip, index) => pip.classList.toggle('is-live', index < this.lives));
    [this.powerupCharges[0], this.powerupCharges[1], this.powerupCharges[2], Number(this.extraLifeAvailable)].forEach((count, index) => {
      const node = this.crispHudNodes.get(`charge-${index}`);
      if (node) node.textContent = String(count);
    });
    const compactMobile = this.isShortLandscapeTouch();
    this.crispMobileLayer?.querySelector('.crisp-mobile-hud')?.classList.toggle('is-desktop', !compactMobile);
    const activeTimes = [this.speedTimer, this.invisibilityTimer, this.magnetTimer];
    activeTimes.forEach((remaining, index) => {
      const status = this.crispHudNodes.get(`status-${index}`);
      if (status) status.textContent = remaining > 0
        ? `${Math.ceil(remaining)}s ACTIVE`
        : `${this.powerupCharges[index]} CHARGE${this.powerupCharges[index] === 1 ? '' : 'S'}`;
    });
    const lifeStatus = this.crispHudNodes.get('status-3');
    if (lifeStatus) lifeStatus.textContent = this.extraLifeAvailable ? 'READY' : 'FIND';
    const lifePowerup = this.crispMobileLayer?.querySelector<HTMLElement>('.crisp-life');
    if (lifePowerup) lifePowerup.style.opacity = this.extraLifeAvailable ? '1' : '.48';

    this.hud.setVisible(false);
    for (const key of ['scoreLabel', 'scoreText', 'timerLabel', 'timerText', 'livesLabel', 'livesCount', 'coinsLabel', 'coinsText', 'routeLabel', 'routeValue']) {
      (this as any)[key]?.setVisible(false);
    }
    for (const groupName of ['powerupLabels', 'powerupStatus']) (this as any)[groupName]?.forEach((text: Phaser.GameObjects.Text) => text.setVisible(false));
    this.powerupSprites.forEach(sprite => sprite.setVisible(false));
    this.powerupChargeTexts.forEach(text => text.setVisible(false));
  }

  private isShortLandscapeTouch(width = this.scale.width, height = this.scale.height) {
    return this.touchControlsVisible && width > height && height <= 600;
  }

  private gameplayTextResolution() {
    return this.isShortLandscapeTouch() ? 2 : 1;
  }

  private applyGameplayTextResolution(resolution: number) {
    this.children.list.forEach(child => {
      if (child instanceof Phaser.GameObjects.Text && child.style.resolution !== resolution) child.setResolution(resolution);
    });
  }

  private activatePowerup(index: number) {
    if (this.state !== 'playing') return;
    if (index < 3) {
      if (this.powerupCharges[index] <= 0) return;
      if ((index === 0 && this.speedTimer > 0) || (index === 1 && this.invisibilityTimer > 0) || (index === 2 && this.magnetTimer > 0)) return;
      this.powerupCharges[index]--;
      if (index === 0) this.speedTimer = 5;
      if (index === 1) this.invisibilityTimer = 5;
      if (index === 2) this.magnetTimer = 5;
    } else {
      if (!this.extraLifeAvailable || this.lives >= 4) return;
      this.lives++;
      this.extraLifeAvailable = false;
    }
    this.playGameSound('power');
    this.emitBurst(this.player.x, this.player.y - 42, 0xffdf74, 10);
  }

  private chooseRefill(index: number) {
    if (!this.refillChoicePending || index < 0 || index > 2 || this.powerupCharges[index] >= 2) return;
    this.powerupCharges[index]++;
    this.refillChoicePending = false;
    this.refillChoiceMenu?.classList.remove('is-visible');
    this.state = 'playing';
    this.updateMusicMix();
    this.playGameSound('power');
    this.emitBurst(this.player.x, this.player.y - 42, 0xffdf74, 10);
    this.drawHud(false);
  }

  private playGameSound(kind: 'start' | 'menu' | 'jump' | 'coin' | 'power' | 'guard' | 'hit' | 'chest' | 'win' | 'lose') {
    if (!this.soundEnabled) return;
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.audioContext ??= new AudioContextClass();
    if (this.audioContext.state === 'suspended') void this.audioContext.resume();
    if (!this.sfxBus) {
      this.sfxBus = this.audioContext.createGain();
      this.sfxBus.gain.value = 0.72 * this.soundEffectsVolume;
      this.sfxBus.connect(this.audioContext.destination);
    }
    const patterns: Record<typeof kind, { notes: number[]; wave: OscillatorType; duration: number; volume: number }> = {
      start: { notes: [523, 659, 784], wave: 'triangle', duration: 0.12, volume: 0.045 },
      menu: { notes: [659, 784], wave: 'sine', duration: 0.17, volume: 0.022 },
      jump: { notes: [360, 540], wave: 'sine', duration: 0.09, volume: 0.035 },
      coin: { notes: [880, 1320], wave: 'sine', duration: 0.075, volume: 0.035 },
      power: { notes: [440, 660, 880], wave: 'triangle', duration: 0.11, volume: 0.04 },
      guard: { notes: [500, 390], wave: 'square', duration: 0.12, volume: 0.025 },
      hit: { notes: [240, 150], wave: 'sawtooth', duration: 0.11, volume: 0.04 },
      chest: { notes: [392, 523, 659, 784], wave: 'triangle', duration: 0.14, volume: 0.045 },
      win: { notes: [523, 659, 784, 1047], wave: 'triangle', duration: 0.18, volume: 0.05 },
      lose: { notes: [392, 330, 262], wave: 'sine', duration: 0.2, volume: 0.04 },
    };
    const pattern = patterns[kind];
    const now = this.audioContext.currentTime + 0.015;
    pattern.notes.forEach((frequency, index) => {
      const start = now + index * pattern.duration * 0.72;
      const oscillator = this.audioContext!.createOscillator();
      const envelope = this.audioContext!.createGain();
      oscillator.type = pattern.wave;
      oscillator.frequency.setValueAtTime(frequency, start);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(pattern.volume, start + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + pattern.duration);
      oscillator.connect(envelope); envelope.connect(this.sfxBus!);
      oscillator.start(start); oscillator.stop(start + pattern.duration + 0.01);
    });
  }

  private emitBurst(x: number, y: number, tint: number, quantity = 8) {
    const emitter = this.add.particles(x, y, 'bean-coin', {
      emitting: false, lifespan: 460, speed: { min: 70, max: 175 }, angle: { min: 205, max: 335 },
      gravityY: 220, scale: { start: 0.42, end: 0 }, alpha: { start: 1, end: 0 }, tint, quantity,
    });
    emitter.explode(quantity, x, y);
    this.time.delayedCall(600, () => emitter.destroy());
  }

  private finishRun(result: 'won' | 'lost' | 'timeout') {
    if (this.state !== 'playing') return;
    this.leaderboardRunStatus = result === 'won'
      ? !this.online.isConfigured ? 'Connect Supabase to save scores online.'
        : !this.online.user ? 'Sign in to save this completed run.'
          : 'Saving your completed run…'
      : 'Only completed levels are submitted to the leaderboard.';
    if (result === 'won') {
      this.score += 500; // Fixed completion reward from the finish chest.
      const collected = this.coins.filter(coin => coin.taken).length;
      if (collected >= this.raidBonusTarget) {
        this.raidBonusAwarded = true;
        this.score += 500;
        this.emitBurst(this.player.x, this.player.y - 48, 0xffdf74, 34);
      }
    }
    this.state = result;
    this.updateMusicMix();
    if (result === 'won' && this.levelIndex < 2) {
      this.unlockedLevel = Math.max(this.unlockedLevel, this.levelIndex + 1);
      localStorage.setItem('fagiolo-unlocked-level', String(this.unlockedLevel));
    }
    this.playGameSound(result === 'won' ? 'win' : 'lose');
    if (result === 'won') this.emitBurst(this.player.x, this.player.y - 48, 0xffd365, 26);
    this.drawHud(false);
    if (result === 'won') void this.submitCompletedRun();
  }

  update(_time: number, delta: number) {
    if (this.state !== 'playing') {
      if (this.state === 'title') {
        this.animTime += Math.min(delta / 1000, 0.04);
        this.titleBean?.setY(618 + Math.sin(this.animTime * 2.1) * 7).setAngle(Math.sin(this.animTime * 1.2) * 2.5);
      }
      return;
    }
    const dt = Math.min(delta / 1000, 0.04);
    this.elapsed += dt;
    this.runElapsedMs += dt * 1000;
    this.animTime += dt;
    this.guardLightRefreshTimer = Math.max(0, this.guardLightRefreshTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.speedTimer = Math.max(0, this.speedTimer - dt);
    this.invisibilityTimer = Math.max(0, this.invisibilityTimer - dt);
    this.magnetTimer = Math.max(0, this.magnetTimer - dt);
    this.landingTimer = Math.max(0, this.landingTimer - dt);
    this.landingSquash = Math.max(0, this.landingSquash - dt * 5.5);
    if (this.chestOpened) this.chestAnimTimer = Math.min(1.05, this.chestAnimTimer + dt);
    this.updateGuards(dt);
    const keyboardBlocked = this.isGameplayKeyboardBlocked();
    if (!keyboardBlocked && Phaser.Input.Keyboard.JustDown((this.keys as any).power1)) this.activatePowerup(0);
    if (!keyboardBlocked && Phaser.Input.Keyboard.JustDown((this.keys as any).power2)) this.activatePowerup(1);
    if (!keyboardBlocked && Phaser.Input.Keyboard.JustDown((this.keys as any).power3)) this.activatePowerup(2);
    if (!keyboardBlocked && Phaser.Input.Keyboard.JustDown((this.keys as any).power4)) this.activatePowerup(3);
    if (this.elapsed >= 1) {
      const elapsedSeconds = Math.floor(this.elapsed);
      this.timeLeft = Math.max(0, this.timeLeft - elapsedSeconds);
      this.elapsed -= elapsedSeconds;
    }
    if (this.timeLeft <= 0) {
      this.finishRun('timeout');
      return;
    }
    const left = this.touchLeft || (!keyboardBlocked && (this.keys.left.isDown || this.keys.a.isDown || !!this.cursors?.left.isDown));
    const right = this.touchRight || (!keyboardBlocked && (this.keys.right.isDown || this.keys.d.isDown || !!this.cursors?.right.isDown));
    const jumpPressed = this.touchJumpPressed || (!keyboardBlocked && (Phaser.Input.Keyboard.JustDown(this.keys.jump) || Phaser.Input.Keyboard.JustDown(this.keys.w) || Phaser.Input.Keyboard.JustDown(this.keys.space) || !!(this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.up))));
    const jumpHeld = this.touchJumpHeld || (!keyboardBlocked && (this.keys.jump.isDown || this.keys.w.isDown || this.keys.space.isDown || !!this.cursors?.up.isDown));
    this.touchJumpPressed = false;
    const moveSpeed = this.speedTimer > 0 ? 520 : 335;
    const targetVx = left === right
      ? (!this.player.grounded && this.autoLeapForward ? (this.faceRight ? moveSpeed : -moveSpeed) : 0)
      : left ? -moveSpeed : moveSpeed;
    const acceleration = left === right ? (this.player.grounded ? 2900 : this.autoLeapForward ? 1500 : 220) : this.player.grounded ? 2300 : 1250;
    this.player.vx += Phaser.Math.Clamp(targetVx - this.player.vx, -acceleration * dt, acceleration * dt);
    if (this.player.vx) this.faceRight = this.player.vx > 0;
    if (jumpPressed) this.jumpBufferTimer = 0.16;
    else this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    if (this.player.grounded) this.coyoteTimer = 0.15;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    if (this.jumpBufferTimer > 0 && (this.player.grounded || this.coyoteTimer > 0)) {
      this.player.vy = -660;
      this.player.grounded = false;
      // A directionless jump becomes a forward leap that carries through the air.
      // If a direction is held, preserve the player's deliberate steering instead.
      this.autoLeapForward = left === right;
      if (this.autoLeapForward) this.player.vx = this.faceRight ? moveSpeed : -moveSpeed;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.playGameSound('jump');
    }
    const gravity = this.player.vy < 0 ? (jumpHeld ? 1250 : 2250) : 1850;
    this.player.vy += gravity * dt;
    const oldY = this.player.y;
    const oldX = this.player.x;
    const wasGrounded = this.player.grounded;
    // Camera bounds stop at the level edge, so keep Fagiolo's visible sprite
    // inside those bounds instead of clamping only the much narrower hitbox.
    const playerEdgeMargin = 90;
    this.player.x = Phaser.Math.Clamp(
      this.player.x + this.player.vx * dt,
      playerEdgeMargin,
      this.courseWidth - playerEdgeMargin,
    );
    this.player.y += this.player.vy * dt;
    this.player.grounded = false;

      // Crates break only when Fagiolo lands on top; side and underside hits block him.
    for (let i = 0; i < this.crates.length; i++) {
      const crate = this.crates[i];
      if (crate.broken) continue;
      const leftEdge = crate.x - crate.width / 2, rightEdge = crate.x + crate.width / 2;
      const top = crate.surfaceY - crate.height;
      const overlapsX = this.player.x + 22 > leftEdge && this.player.x - 22 < rightEdge;
      const landedOnTop = overlapsX && oldY + 34 <= top && this.player.y + 34 >= top && this.player.vy >= 0;
      if (landedOnTop) { this.breakCrate(i); continue; }

      const overlapsBody = overlapsX && this.player.y + 30 > top && this.player.y - 30 < crate.surfaceY;
      if (!overlapsBody) continue;
      if (oldX <= leftEdge - 22 && this.player.x > oldX) this.player.x = leftEdge - 22;
      else if (oldX >= rightEdge + 22 && this.player.x < oldX) this.player.x = rightEdge + 22;
      this.player.vx = 0;
    }

    // The barrel is a climbable solid platform and a visual cover point.
    const barrelTop = this.barrel.surfaceY - this.barrel.height;
    const barrelLeft = this.barrel.x - this.barrel.width / 2, barrelRight = this.barrel.x + this.barrel.width / 2;
    const overlapsBarrelX = this.player.x + 22 > barrelLeft && this.player.x - 22 < barrelRight;
    if (overlapsBarrelX && oldY + 34 <= barrelTop && this.player.y + 34 >= barrelTop && this.player.vy >= 0) {
      this.player.y = barrelTop - 34; this.player.vy = 0; this.player.grounded = true;
    } else if (overlapsBarrelX && this.player.y + 30 > barrelTop && this.player.y - 30 < this.barrel.surfaceY) {
      if (oldX <= barrelLeft - 22 && this.player.x > oldX) this.player.x = barrelLeft - 22;
      else if (oldX >= barrelRight + 22 && this.player.x < oldX) this.player.x = barrelRight + 22;
      this.player.vx = 0;
    }

    for (const p of this.activePlatforms) {
      const overlapsX = this.player.x + 22 > p.x && this.player.x - 22 < p.x + p.w;
      if (overlapsX && oldY + 34 <= p.y && this.player.y + 34 >= p.y && this.player.vy >= 0) {
        this.player.y = p.y - 34; this.player.vy = 0; this.player.grounded = true;
      }
    }
    if (!wasGrounded && this.player.grounded) { this.landingTimer = 0.14; this.landingSquash = 1; this.autoLeapForward = false; }
    if (this.player.grounded && this.nextCheckpointIndex < this.checkpoints.length && this.player.x >= this.checkpoints[this.nextCheckpointIndex]) {
      this.checkpointX = this.checkpoints[this.nextCheckpointIndex];
      this.checkpointY = this.player.y;
      this.nextCheckpointIndex++;
      this.emitBurst(this.checkpointX, this.player.y - 34, 0x76e0a5, 12);
      const checkpointLabel = this.add.text(this.checkpointX, this.player.y - 76, 'CHECKPOINT', { fontFamily: 'Lilita One, Arial Black, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#bfffd2', stroke: '#173b2b', strokeThickness: 5 }).setResolution(this.gameplayTextResolution()).setOrigin(0.5).setDepth(4);
      this.tweens.add({ targets: checkpointLabel, y: checkpointLabel.y - 35, alpha: 0, duration: 900, ease: 'Cubic.Out', onComplete: () => checkpointLabel.destroy() });
    }
    if (this.player.grounded && Math.abs(this.player.vx) > 0) {
      this.heroGait += Math.min(Math.abs(this.player.vx), 420) * dt / 180;
    }
    if (this.player.y > H + 100) this.takeHit();
    for (const hazard of this.spikeHazards) {
      const intersectsSpikes = Math.abs(this.player.x - hazard.x) < 60
        && this.player.y + 27 > hazard.surfaceY - 48
        && this.player.y - 27 < hazard.surfaceY;
      if (this.isSpikeHazardActive(hazard) && intersectsSpikes) this.takeHit();
    }
    for (const gate of this.laserGates) {
      const laserActive = this.getLaserMode(gate) === 'active';
      const leftEmitterX = gate.leftPostX + LASER_EMITTER_X_OFFSET;
      const rightEmitterX = gate.rightPostX - LASER_EMITTER_X_OFFSET;
      if (laserActive && this.player.x > leftEmitterX && this.player.x < rightEmitterX && Math.abs(this.player.y - LASER_Y) < 48) this.takeHit();
    }
    if (!this.refillPickup.taken && this.powerupCharges.some(charge => charge < 2)
      && Math.abs(this.player.x - this.refillPickup.x) < 52 && Math.abs(this.player.y - this.refillPickup.y) < 72) {
      this.refillPickup.taken = true;
      this.refillChoicePending = true;
      this.state = 'paused';
      this.pauseMenu?.classList.remove('is-visible');
      this.refillChoiceMenu?.classList.add('is-visible');
      this.updateMusicMix();
      this.refillChoiceMenu?.querySelectorAll<HTMLButtonElement>('[data-refill]').forEach(button => {
        const gadget = Number(button.dataset.refill);
        button.disabled = this.powerupCharges[gadget] >= 2;
        button.querySelector<HTMLElement>('[data-refill-count]')!.textContent = String(this.powerupCharges[gadget]) + ' / 2 CHARGES';
      });
      this.refillSprite?.setVisible(false);
      this.drawHud(true);
      return;
    }
    if (!this.extraLifePickup.taken && !this.extraLifeAvailable && this.lives < 4
      && Math.abs(this.player.x - this.extraLifePickup.x) < 48 && Math.abs(this.player.y - this.extraLifePickup.y) < 70) {
      this.extraLifePickup.taken = true;
      this.extraLifeAvailable = true;
      this.extraLifePickupSprite?.setVisible(false);
      this.playGameSound('power');
      this.emitBurst(this.extraLifePickup.x, this.extraLifePickup.y, 0xff536d, 14);
      this.drawHud(false);
    }
    for (const c of this.coins) {
      if (c.taken || c.locked) continue;
      let dx = this.player.x - c.x;
      let dy = this.player.y - 4 - c.y;
      let distance = Math.hypot(dx, dy);

      // The magnet pulls visible, unlocked beans toward Fagiolo instead of
      // merely awarding them from a larger invisible pickup radius.
      if (this.magnetTimer > 0 && distance < 560 && distance > 2) {
        const pull = Math.min(1, 760 * dt / distance);
        c.x += dx * pull;
        c.y += dy * pull;
        dx = this.player.x - c.x;
        dy = this.player.y - 4 - c.y;
        distance = Math.hypot(dx, dy);
      }

      // Use a body-sized pickup area: low beans can be collected while
      // running past them, while beans on higher ledges still need a leap.
      const inReach = (dx / 58) ** 2 + (dy / 78) ** 2 <= 1;
      if (inReach || (this.magnetTimer > 0 && distance < 38)) {
        c.taken = true;
        this.score += 100;
        this.playGameSound('coin');
        this.emitBurst(c.x, c.y, 0xffdd4d, 7);
        const popup = this.add.text(c.x, c.y - 20, '+100', { fontFamily: 'Lilita One, Arial Black, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#fff1a4', stroke: '#58330c', strokeThickness: 4 }).setResolution(this.gameplayTextResolution()).setOrigin(0.5).setDepth(3);
        this.tweens.add({ targets: popup, y: popup.y - 46, alpha: 0, duration: 620, ease: 'Cubic.Out', onComplete: () => popup.destroy() });
      }
    }
    const coinScale = this.isShortLandscapeTouch() ? 1.15 : 1;
    this.coins.forEach((coin, i) => {
      const sprite = this.coinSprites[i];
      sprite.setVisible(!coin.taken && !coin.locked);
      if (sprite.displayWidth !== 48 * coinScale) sprite.setDisplaySize(48 * coinScale, 36 * coinScale);
      sprite.setPosition(coin.x, coin.y + Math.sin(this.animTime * 5 + coin.x) * 4);
      sprite.setAngle(Math.sin(this.animTime * 2.2 + coin.x) * 12);
    });
    this.refillSprite?.setPosition(this.refillPickup.x, this.refillPickup.y + Math.sin(this.animTime * 3.2) * 4)
      .setAngle(Math.sin(this.animTime * 1.7) * 4).setVisible(!this.refillPickup.taken);
    this.extraLifePickupSprite?.setPosition(this.extraLifePickup.x, this.extraLifePickup.y + Math.sin(this.animTime * 3.5 + 1) * 5)
      .setAngle(Math.sin(this.animTime * 2) * 6).setVisible(!this.extraLifePickup.taken);
    const levelEnd = this.courseWidth;
    if (!this.chestOpened && this.player.x >= levelEnd - 220) {
      this.chestOpened = true; this.chestAnimTimer = 0; this.playGameSound('chest'); this.emitBurst(levelEnd - 110, 690, 0xffd365, 18);
    }
    if (this.player.x >= levelEnd - 180 && this.chestOpened && this.chestAnimTimer >= 1.05) this.finishRun('won');
    if (this.timeLeft <= 0 && this.state === 'playing') this.finishRun('timeout');
    this.drawWorld();
    this.hudRefreshTimer += dt;
    if (this.hudRefreshTimer >= 0.05) {
      this.hudRefreshTimer %= 0.05;
      this.drawHud(false);
    }
  }

  private breakCrate(index: number) {
    const crate = this.crates[index];
    if (!crate || crate.broken) return;
    crate.broken = true;
    this.worldPropSprites[index]?.setVisible(false);
    const reward = this.coins.find(coin => coin.crateIndex === index);
    if (reward) reward.locked = false;
    this.playGameSound('chest');
    this.emitBurst(crate.x, crate.surfaceY - crate.height / 2, 0xc47a35, 14);
    this.emitBurst(crate.x, crate.surfaceY - crate.height, 0xffd365, 7);
  }

  private updateGuards(dt: number) {
    for (const guard of this.guards) {
      guard.anim += dt;
      const dx = this.player.x - guard.x;
      const dy = this.player.y - guard.y;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, guard.x, guard.y);
      const barrelCovered = this.isPlayerCoveredByBarrel(guard);
      const playerInFacingArc = dx * guard.direction > -28
        && (Math.abs(dx) < 72 || Math.abs(dy) < Math.max(48, Math.abs(dx) * 0.28));
      const canSeePlayer = this.invisibilityTimer <= 0 && Math.abs(dy) < 145 && !barrelCovered && playerInFacingArc;
      if (guard.mode === 'patrol') {
        if (guard.x <= guard.minX + 3) guard.direction = 1;
        if (guard.x >= guard.maxX - 3) guard.direction = -1;
        this.moveGuard(guard, guard.direction * LEVEL_GUARD_PATROL_SPEEDS[this.levelIndex], 420, dt);
        guard.x = Phaser.Math.Clamp(guard.x, guard.minX, guard.maxX);
        if (canSeePlayer && distance < 345) {
          guard.mode = 'alert'; guard.timer = 0.9; guard.lastSeenX = this.player.x; guard.velocity = 0;
          this.playGameSound('guard');
        }
      } else if (guard.mode === 'alert') {
        guard.timer -= dt;
        guard.direction = dx < 0 ? -1 : 1;
        guard.velocity = 0;
        guard.lastSeenX = this.player.x;
        if (this.invisibilityTimer > 0) { guard.mode = 'search'; guard.timer = 2.4; }
        else if (guard.timer <= 0) { guard.mode = 'chase'; }
      } else if (guard.mode === 'chase') {
        if (this.invisibilityTimer > 0 || distance > 650 || Math.abs(dy) > 165 || barrelCovered) {
          guard.mode = 'search'; guard.timer = 2.8; guard.lastSeenX = this.player.x;
        } else {
          const targetDirection = dx < 0 ? -1 : 1;
          guard.direction = targetDirection;
          if ((targetDirection < 0 && guard.x <= guard.minX + 3) || (targetDirection > 0 && guard.x >= guard.maxX - 3)) guard.direction = -targetDirection;
          this.moveGuard(guard, guard.direction * LEVEL_GUARD_CHASE_SPEEDS[this.levelIndex], 560, dt);
          guard.x = Phaser.Math.Clamp(guard.x, guard.minX, guard.maxX);
          if (distance < 54 && this.hurtTimer <= 0) {
            this.takeHit(); guard.mode = 'stunned'; guard.timer = 1.25;
          }
        }
      } else if (guard.mode === 'search') {
        guard.timer -= dt;
        const offset = guard.lastSeenX - guard.x;
        if (Math.abs(offset) > 12) {
          guard.direction = offset < 0 ? -1 : 1;
          this.moveGuard(guard, guard.direction * 68, 300, dt);
          guard.x = Phaser.Math.Clamp(guard.x, guard.minX, guard.maxX);
        } else {
          this.moveGuard(guard, 0, 420, dt);
          guard.direction = Math.sin(guard.anim * 3.2) < 0 ? -1 : 1;
        }
        if (guard.timer <= 0) guard.mode = 'patrol';
      } else if (guard.mode === 'stunned') {
        guard.timer -= dt;
        if (guard.timer <= 0) guard.mode = 'patrol';
      }
    }
  }

  private isPlayerCoveredByBarrel(guard: GuardAgent) {
    const left = this.barrel.x - this.barrel.width / 2;
    const right = this.barrel.x + this.barrel.width / 2;
    const oppositeSides = (guard.x < left && this.player.x > right) || (guard.x > right && this.player.x < left);
    if (!oppositeSides) return false;
    const t = (this.barrel.x - guard.x) / (this.player.x - guard.x);
    const sightY = guard.y + (this.player.y - guard.y) * t;
    const barrelTop = this.barrel.surfaceY - this.barrel.height;
    return sightY >= barrelTop - 12 && sightY <= this.barrel.surfaceY + 12;
  }

  private moveGuard(guard: GuardAgent, targetVelocity: number, acceleration: number, dt: number) {
    const velocityDelta = Phaser.Math.Clamp(targetVelocity - guard.velocity, -acceleration * dt, acceleration * dt);
    guard.velocity += velocityDelta;
    if (Math.abs(guard.velocity) > 8) guard.direction = Math.sign(guard.velocity);
    guard.x += guard.velocity * dt;
    if (Math.abs(guard.velocity) > 12) {
      const strideLength = 68 + Math.max(0, Math.abs(guard.velocity) - 100) * 0.16;
      guard.gait += Math.abs(guard.velocity) * dt / strideLength;
    }
  }

  private takeHit() {
    if (this.hurtTimer > 0 || this.invisibilityTimer > 0 || this.state !== 'playing') return;
    this.lives -= 1;
    this.timeLeft = Math.max(0, this.timeLeft - 3);
    // A hit ends timed power effects immediately; remaining charges and the
    // unspent extra-life pickup stay available after the player respawns.
    this.speedTimer = 0;
    this.invisibilityTimer = 0;
    this.magnetTimer = 0;
    this.hurtTimer = 1.2;
    this.playGameSound('hit');
    this.cameras.main.flash(130, 255, 93, 72, false);
    if (this.screenShakeEnabled) this.cameras.main.shake(190, 0.008);
    this.emitBurst(this.player.x, this.player.y - 34, 0xff796a, 10);
    if (this.lives <= 0) { this.finishRun('lost'); return; }
    this.player.x = this.checkpointX; this.player.y = this.checkpointY; this.player.vx = 0; this.player.vy = 0;
    this.player.grounded = true;
    this.autoLeapForward = false;
    this.landingSquash = 0;
    this.coyoteTimer = 0.12;
    this.jumpBufferTimer = 0;
  }

  private drawWorld() {
    const g = this.art;
    g.clear();
    for (const checkpoint of this.checkpoints) {
      const secured = checkpoint <= this.checkpointX;
      const pulse = (Math.sin(this.animTime * 3.5 + checkpoint) + 1) / 2;
      g.fillStyle(secured ? 0x9bf2c0 : 0xffd47a, 0.82 + pulse * 0.18);
      g.fillTriangle(checkpoint + 2, FLOOR - 78, checkpoint + 39, FLOOR - 65, checkpoint + 2, FLOOR - 52);
      g.fillStyle(secured ? 0x7cf0b0 : 0xffe7a1, 0.35 + pulse * 0.34);
      g.fillCircle(checkpoint, FLOOR - 88, secured ? 7 : 5 + pulse * 2);
    }
    const cameraLeft = this.cameras.main.scrollX - 360;
    const cameraRight = this.cameras.main.scrollX + this.cameras.main.width + 360;
    for (let i = 0; i < this.laserGates.length; i++) {
      const gate = this.laserGates[i];
      if (gate.rightPostX < cameraLeft || gate.leftPostX > cameraRight) continue;
      const mode = this.getLaserMode(gate);
      this.drawLaser(g, gate, mode);
      this.updateLaserPosts(i, mode);
    }
    this.spikeHazards.forEach((hazard, i) => {
      const sprite = this.spikeSprites[i];
      if (hazard.x < cameraLeft - 100 || hazard.x > cameraRight + 100) {
        sprite.setVisible(false);
        return;
      }
      sprite.setVisible(true);
      this.updateSpikeVisual(sprite, hazard);
      const phase = this.getSpikePhase(hazard);
      if (phase >= 3.65 && phase < 4.15) {
        const pulse = (Math.sin(this.animTime * 20) + 1) / 2;
        g.fillStyle(0xff4b53, 0.12 + pulse * 0.16);
        g.fillEllipse(hazard.x, hazard.surfaceY - 2, 92, 12);
        g.lineStyle(2, 0xff7575, 0.42 + pulse * 0.38);
        g.lineBetween(hazard.x - 42, hazard.surfaceY - 9, hazard.x + 42, hazard.surfaceY - 9);
      }
    });
    const chestFrame = `prop-chest-${this.getChestFrame()}`;
    if (this.chestSprites[0].texture.key !== chestFrame) this.chestSprites[0].setTexture(chestFrame);
    if (!this.isShortLandscapeTouch() || this.guardLightRefreshTimer <= 0) {
      this.drawGuardLights();
      this.guardLightRefreshTimer = this.isShortLandscapeTouch() ? 1 / 30 : 0;
    }
    // Each standalone level contains only its own guards, while guardSprites
    // is allocated once for the full original course. Iterate the active
    // guards so a missing guard cannot throw and abort drawing Fagiolo and HUD.
    this.guards.forEach((guard, i) => {
      const sprite = this.guardSprites[i];
      if (sprite) this.drawGuardSprite(sprite, guard);
    });
    for (const guard of this.guards) if (guard.mode === 'alert') {
      g.fillStyle(0xffdc39, 1); g.fillCircle(guard.x, guard.y - 140, 18);
      g.fillStyle(0x173260, 1); g.fillRoundedRect(guard.x - 2, guard.y - 149, 4, 12, 2); g.fillCircle(guard.x, guard.y - 132, 2);
    }
    this.drawHero(g);
    this.syncCrispWorldSprites();
  }

  private drawStaticWorld() {
    const g = this.worldStaticArt;
    g.clear();
    if (!this.crispOverlayActive) this.drawWarningSign(g, 36, 432);
    for (const checkpoint of this.checkpoints) {
      g.fillStyle(0x09131a, 0.38); g.fillEllipse(checkpoint, FLOOR - 4, 48, 10);
      g.fillStyle(0xc99a45, 0.9); g.fillRoundedRect(checkpoint - 3, FLOOR - 83, 6, 80, 3);
    }
  }

  private drawStonePlatform(g: Phaser.GameObjects.Graphics, p: typeof platforms[number], index: number) {
    const top = p.y;
    const bottom = p.y + p.h;
    const materials = [
      { body: 0x46535a, face: 0x657276, cap: 0x879396, light: 0xb0b8b1, mortar: 0x303c42 },
      { body: 0x3c504e, face: 0x58706a, cap: 0x789088, light: 0xa9b69d, mortar: 0x293c39 },
      { body: 0x3d4858, face: 0x56647a, cap: 0x75849a, light: 0xa5b2bf, mortar: 0x293343 },
      { body: 0x564e43, face: 0x716758, cap: 0x96866b, light: 0xc1ae88, mortar: 0x3d352d },
    ];
    const material = materials[index % materials.length];
    const brickWidth = [64, 82, 72, 94][index % 4];
    const brickHeight = [27, 32, 29, 35][index % 4];

    // A tight contact shadow separates each block from the world behind it.
    g.fillStyle(0x080d12, 0.5); g.fillRoundedRect(p.x - 3, top + 9, p.w + 6, p.h + 5, 5);
    g.fillStyle(0x202b32, 1); g.fillRect(p.x, top + 8, p.w, Math.max(1, p.h - 8));
    g.fillStyle(material.body, 1); g.fillRect(p.x + 2, top + 12, p.w - 4, Math.max(1, p.h - 18));
    g.fillStyle(material.face, 1); g.fillRect(p.x + 3, top + 13, p.w - 6, Math.max(1, p.h - 21));

    // Irregularly shaded masonry keeps the repeated block shapes from looking flat.
    const stoneColors = [material.face, material.body, material.cap, 0x59656a, 0x626d70];
    let row = 0;
    for (let y = top + 21; y + brickHeight - 3 < bottom; y += brickHeight, row++) {
      const stagger = (row + index) % 2 === 0 ? (index * 13) % brickWidth : brickWidth / 2;
      for (let x = p.x - stagger; x < p.x + p.w; x += brickWidth) {
        const left = Math.max(p.x + 3, x + 2);
        const right = Math.min(p.x + p.w - 3, x + brickWidth - 2);
        if (right - left < 8) continue;
        const shade = Math.abs(Math.sin((index + 1) * 13.7 + row * 4.1 + Math.floor(x / brickWidth) * 2.3));
        const color = stoneColors[Math.floor(shade * stoneColors.length) % stoneColors.length];
        g.fillStyle(color, 0.38 + shade * 0.2);
        g.fillRoundedRect(left, y + 2, right - left, brickHeight - 4, 3);
        g.fillStyle(0xb3b9b3, 0.14 + shade * 0.08);
        g.fillRoundedRect(left + 7, y + 5, Math.max(8, right - left - 22), 2, 1);
      }
      g.lineStyle(2, material.mortar, 0.78);
      g.lineBetween(p.x + 2, y + brickHeight, p.x + p.w - 2, y + brickHeight);
    }

    // Broken, angled face joints and occasional worn insets give each segment
    // a distinct masonry silhouette while leaving the top collision edge clean.
    if (p.h > 85) {
      const crackX = p.x + 30 + (index * 47) % Math.max(44, p.w - 60);
      const crackY = top + 37;
      g.lineStyle(1.5, 0x263238, 0.62);
      g.lineBetween(crackX, crackY, crackX - 5, crackY + 9);
      g.lineBetween(crackX - 5, crackY + 9, crackX + 2, crackY + 17);
      g.lineBetween(crackX + 2, crackY + 17, crackX - 2, crackY + 26);
      if (index % 3 === 1) {
        g.fillStyle(material.mortar, 0.48);
        g.fillRoundedRect(p.x + p.w - 12, top + 24, 5, Math.min(30, p.h - 35), 2);
      }
    }

    // A thick, readable stone cap gives the player a clear landing surface.
    g.fillStyle(material.mortar, 1); g.fillRoundedRect(p.x - 4, top - 1, p.w + 8, 17, 4);
    g.fillStyle(material.cap, 1); g.fillRoundedRect(p.x, top - 1, p.w, 12, 3);
    g.fillStyle(material.light, 0.72); g.fillRoundedRect(p.x + 5, top, p.w - 10, 2, 1);
    g.fillStyle(material.body, 1); g.fillRect(p.x + 2, top + 10, p.w - 4, 4);

    // Fine joints across the cap read as broad paving stones on the floor.
    g.lineStyle(1, material.mortar, 0.62);
    const tileOffset = 22 + (index * 29) % 68;
    const tileWidth = [66, 88, 74, 102][index % 4];
    for (let x = p.x + tileOffset; x < p.x + p.w - 8; x += tileWidth) {
      g.lineBetween(x, top + 2, x, top + 9);
    }
    // Small chipped corners soften the silhouette without obscuring the edge.
    g.fillStyle(material.mortar, 0.78);
    if (index % 2 === 0) g.fillTriangle(p.x, top - 1, p.x + 8, top - 1, p.x + 2, top + 4);
    else g.fillTriangle(p.x + p.w, top - 1, p.x + p.w - 7, top - 1, p.x + p.w - 2, top + 4);
  }

  private drawGuardLights() {
    const g = this.guardLightArt;
    g.clear();
    const cameraLeft = this.cameras.main.scrollX - 360;
    const cameraRight = this.cameras.main.scrollX + this.cameras.main.width + 360;
    for (let i = 0; i < this.guards.length; i++) {
      const guard = this.guards[i];
      if (guard.x < cameraLeft || guard.x > cameraRight) continue;
      const direction = guard.direction || 1;
      const sprite = this.guardSprites[i];
      const frame = this.getGuardFrame(guard);
      const anchor = this.getTorchAnchor(frame);
      const flipX = this.guardFrameFacesRight(frame) !== (direction > 0);
      const footCorrection = this.getGuardFootCorrection(frame, sprite.displayHeight);
      const sourceX = guard.x + (anchor.x - 256) * (sprite.displayWidth / 512) * (flipX ? -1 : 1);
      const sourceY = guard.y + footCorrection + (anchor.y - 448 * sprite.originY) * (sprite.displayHeight / 448);
      const patrolPulse = (Math.sin(guard.anim * 3.6) + 1) / 2;
      let alpha = 0.14 + patrolPulse * 0.12;
      let tipX = sourceX + direction * (330 + Math.sin(guard.anim * 1.7) * 20);
      let tipY = sourceY + 55 + Math.sin(guard.anim * 2.1) * 50;
      let width = 43;
      if (guard.mode === 'alert' || guard.mode === 'chase') {
        const dx = this.player.x - sourceX;
        const dy = this.player.y - 34 - sourceY;
        const length = Math.max(1, Math.hypot(dx, dy));
        tipX = sourceX + (dx / length) * Math.min(length + 100, 340);
        tipY = sourceY + (dy / length) * Math.min(length + 100, 340);
        width = guard.mode === 'chase' ? 64 : 52;
        alpha = 0.32 + patrolPulse * 0.14;
      } else if (guard.mode === 'search') {
        tipX = sourceX + direction * (180 + Math.sin(guard.anim * 5) * 100);
        tipY = sourceY + 45 + Math.sin(guard.anim * 4) * 38;
        alpha = 0.2;
      } else if (guard.mode === 'stunned') {
        alpha = Math.sin(guard.anim * 18) > 0.25 ? 0.22 : 0.035;
        tipX = sourceX + direction * 140;
        tipY = sourceY + 70;
      }
      const dx = tipX - sourceX;
      const dy = tipY - sourceY;
      const length = Math.max(1, Math.hypot(dx, dy));
      const px = (-dy / length) * width;
      const py = (dx / length) * width;
      g.fillStyle(0xffd665, alpha * 0.38);
      g.fillTriangle(sourceX, sourceY, tipX - px, tipY - py, tipX + px, tipY + py);
      g.fillStyle(0xfff0a5, alpha);
      g.fillTriangle(sourceX, sourceY, tipX - px * 0.48, tipY - py * 0.48, tipX + px * 0.48, tipY + py * 0.48);
      g.fillStyle(0xfff6bf, alpha + 0.18);
      g.fillCircle(sourceX, sourceY, guard.mode === 'alert' || guard.mode === 'chase' ? 6 : 4);
    }
  }

  private getGuardFrame(guard: GuardAgent) {
    let frame = 'guard-idle';
    const walking = (guard.mode === 'patrol' || guard.mode === 'search' || guard.mode === 'chase') && Math.abs(guard.velocity) > 12;
    if (guard.mode === 'stunned') frame = 'guard-stunned';
    else if (walking) {
      frame = `guard-walk-${Math.floor((guard.gait % 1) * 6)}`;
    }
    return frame;
  }

  private getGuardFootCorrection(frame: string, displayHeight: number) {
    const frameBottom = frame === 'guard-idle' ? 438 : frame === 'guard-stunned' ? 436 : 419;
    return (438 - frameBottom) * displayHeight / 448;
  }

  private guardFrameFacesRight(frame: string) {
    return frame.startsWith('guard-walk-');
  }

  private getTorchAnchor(frame: string) {
    if (frame === 'guard-stunned') return { x: 135, y: 350 };
    if (frame === 'guard-idle') return { x: 119, y: 244 };
    const anchors = [
      { x: 359, y: 241 }, { x: 356, y: 249 }, { x: 356, y: 245 },
      { x: 359, y: 239 }, { x: 356, y: 253 }, { x: 356, y: 246 },
    ];
    const index = Number(frame.slice('guard-walk-'.length)) || 0;
    return anchors[index] ?? anchors[0];
  }

  private drawGuardSprite(sprite: Phaser.GameObjects.Image, guard: GuardAgent) {
    const frame = this.getGuardFrame(guard);
    const shouldFlip = this.guardFrameFacesRight(frame) !== (guard.direction > 0);
    const mobileScale = this.isShortLandscapeTouch() ? 1.16 : 1;
    const displayHeight = guard.spriteHeight * mobileScale;
    if (sprite.displayHeight !== displayHeight) sprite.setDisplaySize(guard.spriteHeight * 137 / 120 * mobileScale, displayHeight);
    sprite.setTexture(frame).setPosition(guard.x, guard.y + this.getGuardFootCorrection(frame, sprite.displayHeight)).setFlipX(shouldFlip);
    // Keep the sprite's feet on the platform; reactions are shown through pose and torch movement.
    sprite.setAngle(0);
  }

  private createSpriteArt() {
    const makeCanvasTexture = (key: string, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create sprite canvas');
      paint(ctx);
      this.textures.addCanvas(key, canvas);
    };
    const makeBean = (key: string, stride: number, airborne: boolean, wave: number) => makeCanvasTexture(key, 112, 128, ctx => {
      ctx.save();
      ctx.translate(56, 83);
      const lift = airborne ? -7 : 0;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#17151a'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(-10, 17 + lift); ctx.lineTo(-15 + stride, 34 + lift); ctx.moveTo(10, 17 + lift); ctx.lineTo(15 - stride, 34 + lift); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#17151a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(-35 + stride, 28 + lift, 34, 17, 8); ctx.roundRect(1 - stride, 28 + lift, 34, 17, 8); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#11120e'; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(-28, -4); ctx.lineTo(-44, 7); ctx.moveTo(27, -3); ctx.lineTo(43, -14 - wave); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-45, 9, 10, 0, Math.PI * 2); ctx.arc(44, -17 - wave, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#11120e'; ctx.beginPath(); ctx.ellipse(0, -9, 40, 45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7fe51b'; ctx.beginPath(); ctx.ellipse(0, -11, 36, 41, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(203,255,102,.72)'; ctx.beginPath(); ctx.ellipse(-13, -30, 12, 8, -.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(-12, -27, 4, 7, 0, 0, Math.PI * 2); ctx.ellipse(13, -27, 4, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-13, -29, 1.8, 0, Math.PI * 2); ctx.arc(12, -29, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(3, -10, 18, .1, 1.9); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(-3, -9, 19, 7, 3); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#191919'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(0, -55, 26, 11, 0, Math.PI, Math.PI * 2); ctx.lineTo(28, -51); ctx.quadraticCurveTo(9, -45, -23, -48); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#161616'; ctx.font = 'bold 7px Trebuchet MS'; ctx.textAlign = 'center'; ctx.fillText('FAGIOLO', 0, -52);
      ctx.restore();
    });
    makeBean('bean-idle', 0, false, 0);
    makeBean('bean-run-a', -8, false, 4);
    makeBean('bean-run-b', 8, false, 0);
    makeBean('bean-jump', -4, true, 2);
    makeCanvasTexture('bean-coin', 56, 64, ctx => {
      ctx.save(); ctx.translate(28, 32); ctx.rotate(-.18);
      ctx.fillStyle = '#984a05'; ctx.beginPath(); ctx.ellipse(0, 0, 19, 25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffc51b'; ctx.beginPath(); ctx.ellipse(-2, -1, 16, 21, 0, 0, Math.PI * 2); ctx.ellipse(7, -3, 8, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffec67'; ctx.beginPath(); ctx.ellipse(-8, -8, 4, 11, -.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff3a1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 13, 17, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    });
    makeCanvasTexture('guard', 92, 116, ctx => {
      ctx.save(); ctx.translate(46, 84);
      ctx.fillStyle = '#151b27'; ctx.beginPath(); ctx.ellipse(0, 4, 36, 30, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#174785'; ctx.beginPath(); ctx.roundRect(-30, -42, 60, 57, 15); ctx.fill();
      ctx.fillStyle = '#f3c58c'; ctx.beginPath(); ctx.ellipse(0, -49, 22, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#10151c'; ctx.beginPath(); ctx.roundRect(-25, -78, 50, 13, 5); ctx.fill();
      ctx.fillStyle = '#16417e'; ctx.beginPath(); ctx.roundRect(-17, -94, 34, 22, 8); ctx.fill();
      ctx.fillStyle = '#f5cc31'; ctx.beginPath(); ctx.arc(0, -84, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#12161d'; ctx.beginPath(); ctx.roundRect(-23, -57, 46, 9, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-14, -54, 8, 3); ctx.fillRect(6, -54, 8, 3);
      ctx.fillStyle = '#2c3745'; ctx.beginPath(); ctx.roundRect(-10, -27, 20, 17, 5); ctx.fill(); ctx.restore();
    });
  }

  private drawHero(g: Phaser.GameObjects.Graphics) {
    const moving = Math.abs(this.player.vx) > 0 && this.player.grounded;
    let frame = 'bean-idle-0';
    if (this.jumpAnticipationTimer > 0 && this.player.grounded) frame = 'bean-jump-0';
    else if (!this.player.grounded) frame = this.player.vy < -320 ? 'bean-jump-1' : this.player.vy < 120 ? 'bean-jump-2' : 'bean-jump-3';
    else if (this.landingTimer > 0) frame = 'bean-jump-0';
    else if (moving) frame = `bean-walk-${Math.floor((this.heroGait % 1) * 6)}`;
    else {
      const idlePhase = this.animTime % 4;
      if (idlePhase > 3.55) frame = 'bean-idle-2';
      else if (idlePhase > 1.3 && idlePhase < 1.52) frame = 'bean-idle-1';
    }
    const squash = this.landingSquash;
    // The aligned character sheets include transparent margins. Give Fagiolo
    // more screen area on phone landscape without changing its proportions.
    const mobileScale = this.isShortLandscapeTouch() ? 1.16 : 1;
    this.heroSprite.setTexture(frame)
      .setPosition(this.player.x, this.player.y + 6)
      .setDisplaySize(165 * mobileScale * (1 + squash * 0.07), 128 * mobileScale * (1 - squash * 0.11))
      .setFlipX(!this.faceRight);
    const visibleFromHit = this.hurtTimer <= 0 || Math.floor(this.animTime * 18) % 2 === 0;
    const visibleFromCloak = this.invisibilityTimer <= 0 || Math.floor(this.animTime * 12) % 2 === 0;
    this.heroSprite.setVisible(visibleFromHit && visibleFromCloak);
  }

  private drawCrate(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number) {
    g.fillStyle(0x7b370d, 1); g.fillRoundedRect(x, y, s, s, 5); g.fillStyle(0xc97a24, 1); g.fillRect(x + 6, y + 6, s - 12, s - 12);
    g.lineStyle(9, 0x874312, 1); g.lineBetween(x + 8, y + 8, x + s - 8, y + s - 8); g.lineBetween(x + s - 8, y + 8, x + 8, y + s - 8);
    g.lineStyle(3, 0xe5a34b, 1); g.strokeRect(x + 5, y + 5, s - 10, s - 10);
  }

  private drawChest(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x643007, 1); g.fillRoundedRect(x - 48, y - 25, 96, 59, 12); g.fillStyle(0xeaa328, 1); g.fillRoundedRect(x - 43, y - 21, 86, 50, 10);
    g.fillStyle(0x9c4c0d, 1); g.fillRoundedRect(x - 47, y - 39, 94, 29, 15); g.fillStyle(0xf4bb35, 1); g.fillRoundedRect(x - 40, y - 35, 80, 24, 12);
    g.fillStyle(0xffe66b, 1); g.fillRoundedRect(x - 6, y - 17, 13, 27, 4); g.fillCircle(x, y + 4, 4);
    g.lineStyle(4, 0xffda5b, 1); g.strokeRoundedRect(x - 48, y - 25, 96, 59, 12);
  }

  private drawWarningSign(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x603511, 1); g.fillRoundedRect(x + 61, y + 26, 16, 190, 5);
    g.fillStyle(0x7f4218, 1); g.fillRoundedRect(x, y, 198, 154, 12);
    g.fillStyle(0xc27a32, 1); g.fillRoundedRect(x + 7, y + 7, 184, 140, 9);
    g.lineStyle(4, 0x5d3015, 1); g.strokeRoundedRect(x + 2, y + 2, 194, 150, 10);
    g.fillStyle(0xe9b450, 1); g.fillCircle(x + 15, y + 15, 4); g.fillCircle(x + 183, y + 15, 4);
  }

  private drawBarrel(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x552608, 1); g.fillEllipse(x, y + 46, 82, 112);
    g.fillStyle(0x9f541a, 1); g.fillEllipse(x, y + 44, 70, 105);
    g.fillStyle(0xc1782d, 1); g.fillEllipse(x - 8, y + 42, 29, 88);
    g.fillStyle(0x543a31, 1); g.fillRoundedRect(x - 43, y + 16, 86, 15, 7); g.fillRoundedRect(x - 43, y + 77, 86, 15, 7);
    g.lineStyle(4, 0xd5a259, 1); g.strokeEllipse(x, y + 44, 70, 105);
  }

  private getSpikePhase(hazard: SpikeHazard) {
    return (this.animTime + hazard.phaseOffset) % 4.5;
  }

  private getSpikeRise(hazard: SpikeHazard) {
    const phase = this.getSpikePhase(hazard);
    if (phase < 2.5) return 1;
    if (phase < 2.8) return 1 - (phase - 2.5) / 0.3;
    if (phase < 4.15) return 0;
    return Phaser.Math.Clamp((phase - 4.15) / 0.35, 0, 1);
  }

  private isSpikeHazardActive(hazard: SpikeHazard) {
    const phase = this.getSpikePhase(hazard);
    return phase < 2.5 || this.getSpikeRise(hazard) >= 0.82;
  }

  private updateSpikeVisual(sprite: Phaser.GameObjects.Image, hazard: SpikeHazard) {
    const phase = this.getSpikePhase(hazard);
    const rise = this.getSpikeRise(hazard);
    const displayHeight = Math.max(1, 130 * rise);
    const warning = phase >= 3.65 && phase < 4.15;
    sprite
      .setDisplaySize(148, displayHeight)
      .setPosition(hazard.x, hazard.surfaceY)
      .setAlpha(rise < 0.035 ? 0 : warning ? 0.72 + (Math.sin(this.animTime * 28) + 1) * 0.14 : 1);
    if (warning) sprite.setTint(0xff5048);
    else sprite.clearTint();
  }

  private getLaserMode(gate: LaserGate): 'warning' | 'active' | 'cooldown' {
    const phase = (this.animTime + gate.phaseOffset) % 5.4;
    if (phase < 1.3) return 'warning';
    if (phase < 3.4) return 'active';
    return 'cooldown';
  }

  private updateLaserPosts(gateIndex: number, mode: 'warning' | 'active' | 'cooldown') {
    const pulse = (Math.sin(this.animTime * 22) + 1) / 2;
    for (const post of this.laserPostSprites[gateIndex] ?? []) {
      const tint = mode === 'warning' ? 0xffbc55 : mode === 'active' ? 0xffffff : 0x778393;
      const alpha = mode === 'warning' ? 0.4 + pulse * 0.5 : mode === 'active' ? 0.92 + pulse * 0.08 : 0.38;
      post
        .setPosition(post.x, LASER_POST_Y)
        .setDisplaySize(62, 48)
        .setAlpha(alpha)
        .setTint(tint);
    }
  }

  private getChestFrame() {
    if (!this.chestOpened || this.chestAnimTimer < 0.16) return 0;
    if (this.chestAnimTimer < 0.4) return 1;
    if (this.chestAnimTimer < 0.72) return 2;
    return 3;
  }

  private drawLaser(g: Phaser.GameObjects.Graphics, gate: LaserGate, mode: 'warning' | 'active' | 'cooldown') {
    const beamLeft = gate.leftPostX + LASER_EMITTER_X_OFFSET;
    const beamRight = gate.rightPostX - LASER_EMITTER_X_OFFSET;
    if (mode === 'warning') {
      const pulse = (Math.sin(this.animTime * 12) + 1) / 2;
      g.lineStyle(14, 0xffad3d, 0.09 + pulse * 0.1); g.lineBetween(beamLeft, LASER_Y, beamRight, LASER_Y);
      g.lineStyle(3, 0xffd47a, 0.62 + pulse * 0.35); g.lineBetween(beamLeft, LASER_Y, beamRight, LASER_Y);
      for (let x = beamLeft + 10; x < beamRight; x += 26) {
        g.fillStyle(0xfff0a6, 0.65 + pulse * 0.3); g.fillCircle(x, LASER_Y, 2.4);
      }
      return;
    }
    if (mode === 'active') {
      const pulse = (Math.sin(this.animTime * 22) + 1) / 2;
      g.lineStyle(20, 0xff1938, 0.16 + pulse * 0.12); g.lineBetween(beamLeft, LASER_Y, beamRight, LASER_Y);
      g.lineStyle(8, 0xff263e, 0.78 + pulse * 0.22); g.lineBetween(beamLeft, LASER_Y, beamRight, LASER_Y);
      g.lineStyle(2, 0xffdbe1, 0.85 + pulse * 0.15); g.lineBetween(beamLeft, LASER_Y, beamRight, LASER_Y);
      g.fillStyle(0xff4752, 0.72); g.fillCircle(beamLeft, LASER_Y, 4); g.fillCircle(beamRight, LASER_Y, 4);
      g.fillStyle(0xffe4e7, 0.96); g.fillCircle(beamLeft, LASER_Y, 1.8); g.fillCircle(beamRight, LASER_Y, 1.8);
    }
  }

  private drawHud(_paused: boolean) {
    const g = this.hud;
    g.setVisible(this.state !== 'title' && !this.crispOverlayActive);
    g.clear();
    const hudScale = 1 / this.cameras.main.zoomX;
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    const uiX = (x: number) => centerX + (x - centerX) * hudScale;
    const uiY = (y: number) => centerY + (y - centerY) * hudScale;
    // Phaser zooms around the camera center. Offset the fixed HUD layers so
    // their screen-space coordinates stay pinned to the viewport edges.
    g.setPosition(centerX * (1 - hudScale), centerY * (1 - hudScale)).setScale(hudScale);
    // HUD layout is authored in screen pixels; counter-scale its game objects
    // so the camera's world zoom does not shrink the text or touch gadgets.
    const viewWidth = this.scale.width;
    const viewHeight = this.scale.height;
    const extraWidth = Math.max(0, viewWidth - W);
    const compactTouchHud = viewWidth < 700 || (viewWidth < 1100 && this.scale.height < 600);
    const ensureText = (key: string, x: number, y: number, style: any) => {
      const owner = this as any;
      if (!owner[key]) owner[key] = this.add.text(x, y, '', style).setResolution(this.gameplayTextResolution()).setDepth(9).setScrollFactor(0);
      return (owner[key] as Phaser.GameObjects.Text).setPosition(uiX(x), uiY(y)).setScale(hudScale);
    };
    const labelStyle = { fontFamily: 'Nunito Sans, Arial, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#f0f5f7', letterSpacing: 1.2, stroke: '#071625', strokeThickness: 1 };
    const valueStyle = { fontFamily: 'Lilita One, Arial Black, sans-serif', fontSize: '27px', color: '#fffdf5', stroke: '#071625', strokeThickness: 2 };
    // Floating instrument readouts sit directly over the scene, without a shared rail.

    if (compactTouchHud) {
      // Keep all five readouts on one baseline and stop the rail before the
      // pause/settings/exit buttons at the upper-right corner.
      const left = 8, top = 8, rightReserve = 178;
      const panelWidth = Math.max(0, viewWidth - left * 2 - rightReserve);
      const slotWidth = panelWidth / 5;
      const slotX = (index: number) => left + slotWidth * index + 8;
      const labelY = top + 6, valueY = top + 21;
      g.fillStyle(0x041321, 0.94); g.fillRoundedRect(left, top, panelWidth, 56, 10);
      g.lineStyle(1.4, 0xc0def4, 0.72); g.strokeRoundedRect(left, top, panelWidth, 56, 10);
      ensureText('scoreLabel', slotX(0), labelY, { ...labelStyle, fontSize: '10px', letterSpacing: 0.7 }).setText('SCORE');
      ensureText('scoreText', slotX(0), valueY, { ...valueStyle, fontSize: '20px', strokeThickness: 2.5 }).setText(String(this.score).padStart(5, '0'));
      ensureText('timerLabel', slotX(1), labelY, { ...labelStyle, fontSize: '10px', letterSpacing: 0.7 }).setText('TIME');
      const timerText = ensureText('timerText', slotX(1), valueY, { ...valueStyle, fontSize: '20px', strokeThickness: 2.5 });
      timerText.setText(`${String(Math.floor(this.timeLeft / 60)).padStart(2, '0')}:${String(this.timeLeft % 60).padStart(2, '0')}`);
      timerText.setColor(this.timeLeft <= 15 ? '#ff707c' : '#ffffff');
      ensureText('coinsLabel', slotX(2), labelY, { ...labelStyle, fontSize: '10px', letterSpacing: 0.5 }).setText('BEANS');
      const collected = this.coins.filter(coin => coin.taken).length;
      ensureText('coinsText', slotX(2), valueY, { ...valueStyle, fontSize: '19px', strokeThickness: 2.5 }).setText(`${collected}/${this.coins.length}`);
      ensureText('livesLabel', slotX(3), labelY, { ...labelStyle, fontSize: '10px', letterSpacing: 0.5 }).setText('LIVES');
      for (let i = 0; i < 4; i++) {
        const x = slotX(3) + 4 + i * 9, y = top + 37;
        g.fillStyle(i < this.lives ? 0xff4e6d : 0x485b78, 1);
        g.fillCircle(x - 2.6, y - 1.2, 3); g.fillCircle(x + 2.6, y - 1.2, 3); g.fillTriangle(x - 5.3, y, x + 5.3, y, x, y + 6);
      }
      ensureText('livesCount', slotX(3) + 45, valueY + 2, { ...labelStyle, fontSize: '11px', fontStyle: 'bold', color: '#ffffff', stroke: '#041321', strokeThickness: 2, letterSpacing: 0 }).setText(`${this.lives}/4`);
      ensureText('routeLabel', slotX(4), labelY, { ...labelStyle, fontSize: '10px', letterSpacing: 0.5 }).setText('LEVEL');
      ensureText('routeValue', slotX(4), valueY, { ...valueStyle, fontSize: '18px', color: '#fff1b2', strokeThickness: 2.5 }).setText(`${this.levelIndex + 1}/3`);
    } else {

    // Score
    g.fillStyle(0xe7b858, 1); g.fillCircle(67, 65, 19);
    g.lineStyle(1.5, 0xffedbd, 0.9); g.strokeCircle(67, 65, 15);
    g.fillStyle(0xffedbd, 1); g.fillEllipse(62, 59, 7, 12);
    ensureText('scoreLabel', 96, 39, labelStyle).setText('SCORE');
    ensureText('scoreText', 96, 57, valueStyle).setText(String(this.score).padStart(5, '0'));

    // Timer
    g.fillStyle(this.timeLeft <= 15 ? 0xff7180 : 0x75d7bd, 1); g.fillCircle(319, 63, 16);
    g.lineStyle(2.5, 0x10202b, 1); g.strokeCircle(319, 63, 12);
    g.lineStyle(2.5, 0x10202b, 1); g.lineBetween(319, 63, 319, 55); g.lineBetween(319, 63, 326, 67);
    ensureText('timerLabel', 349, 39, labelStyle).setText('TIME LEFT');
    const timerText = ensureText('timerText', 349, 55, { ...valueStyle, fontSize: '29px' });
    timerText.setText(`${String(Math.floor(this.timeLeft / 60)).padStart(2, '0')}:${String(this.timeLeft % 60).padStart(2, '0')}`);
    timerText.setColor(this.timeLeft <= 15 ? '#ff707c' : '#ffffff');
    g.fillStyle(0x10252a, 0.72); g.fillRoundedRect(349, 91, 144, 3, 2);
    g.fillStyle(this.timeLeft <= 15 ? 0xff7180 : 0x75d7bd, 1);
    g.fillRoundedRect(349, 91, 144 * Phaser.Math.Clamp(this.timeLeft / RUN_TIME_SECONDS, 0, 1), 4, 2);

    // Lives
    ensureText('livesLabel', 544, 39, labelStyle).setText('LIVES');
    for (let i = 0; i < 4; i++) {
      const x = 644 + i * 27, y = 69;
      g.fillStyle(i < this.lives ? 0xff4e6d : 0x485b78, 1);
      g.fillCircle(x - 5, y - 3, 6); g.fillCircle(x + 5, y - 3, 6); g.fillTriangle(x - 11, y, x + 11, y, x, y + 13);
    }
    ensureText('livesCount', 746, 57, { ...labelStyle, fontSize: '14px', color: '#ffffff', letterSpacing: 0 }).setText(`${this.lives} / 4`);

    // Bean coin count and collection progress
    g.fillStyle(0xe7b858, 1); g.fillEllipse(822, 65, 17, 22);
    g.lineStyle(1.2, 0xffedbd, 0.9); g.strokeEllipse(822, 65, 13, 17);
    g.fillStyle(0xffedbd, 1); g.fillEllipse(818, 60, 5, 11);
    ensureText('coinsLabel', 848, 39, labelStyle).setText('BEAN COINS');
    const collected = this.coins.filter(c => c.taken).length;
    ensureText('coinsText', 848, 59, { ...valueStyle, fontSize: '21px' }).setText(`${collected} / ${this.coins.length}`);
    g.fillStyle(0x10252a, 0.72); g.fillRoundedRect(940, 62, 112, 5, 3);
    g.fillStyle(0xe7b858, 1); g.fillRoundedRect(940, 62, 112 * collected / this.coins.length, 8, 4);

    // Route progress
    ensureText('routeLabel', 1108 + extraWidth, 39, labelStyle).setText(`LEVEL ${this.levelIndex + 1} / 3`);
    ensureText('routeValue', 1108 + extraWidth, 59, { ...valueStyle, fontSize: '17px', color: '#fff1b2' }).setText(LEVEL_NAMES[Math.max(0, this.levelIndex)]);
    g.fillStyle(0x10252a, 0.72); g.fillRoundedRect(1261 + extraWidth, 62, 130, 5, 3);
    g.fillStyle(0x75d7bd, 1); g.fillRoundedRect(1261 + extraWidth, 62, 130 * Phaser.Math.Clamp(this.player.x / this.courseWidth, 0, 1), 8, 4);
    }

    // Individual gadget controls use the same refined language as pause and settings.
    const compactHud = viewWidth < 1100;
    const gadgetSize = compactTouchHud
      ? Phaser.Math.Clamp((viewWidth - 180) / 4, 54, 62)
      : Phaser.Math.Clamp((viewWidth - 266) / 4, 30, 48);
    const cardWidth = compactTouchHud ? gadgetSize : compactHud ? 112 : 132;
    const cardHeight = compactTouchHud ? gadgetSize : 86;
    const gadgetGap = compactTouchHud ? 8 : compactHud ? 12 : 16;
    const gadgetStep = cardWidth + gadgetGap;
    const totalGadgetWidth = cardWidth * 4 + gadgetGap * 3;
    const firstGadgetCenter = (viewWidth - totalGadgetWidth) / 2 + cardWidth / 2;
    const powerupXs = [0, 1, 2, 3].map(index => firstGadgetCenter + index * gadgetStep);
    const powerups = [
      { x: powerupXs[0], title: 'SPEED', color: 0xffcf22, status: this.speedTimer > 0 ? `${Math.ceil(this.speedTimer)}s` : `${this.powerupCharges[0]} CHARGE${this.powerupCharges[0] === 1 ? '' : 'S'}` },
      { x: powerupXs[1], title: 'CLOAK', color: 0x88e9ff, status: this.invisibilityTimer > 0 ? `${Math.ceil(this.invisibilityTimer)}s` : `${this.powerupCharges[1]} CHARGE${this.powerupCharges[1] === 1 ? '' : 'S'}` },
      { x: powerupXs[2], title: 'MAGNET', color: 0xff3b8b, status: this.magnetTimer > 0 ? `${Math.ceil(this.magnetTimer)}s` : `${this.powerupCharges[2]} CHARGE${this.powerupCharges[2] === 1 ? '' : 'S'}` },
      { x: powerupXs[3], title: 'EXTRA LIFE', color: this.extraLifeAvailable ? 0xff536d : 0x65708a, status: this.extraLifeAvailable ? 'READY' : 'FIND' },
    ];
    const cardY = viewHeight - cardHeight - 12;
    for (const [i, power] of powerups.entries()) {
      const activePowerup = i === 0 ? this.speedTimer > 0 : i === 1 ? this.invisibilityTimer > 0 : i === 2 ? this.magnetTimer > 0 : this.extraLifeAvailable;
      const pulse = (Math.sin(this.animTime * (activePowerup ? 8 : 3) + i * 1.4) + 1) / 2;
      const iconScale = 1;
      const hovered = this.gadgetHover[i];
      const controlX = power.x;
      const cardTop = cardY;
      this.powerupZones[i]?.setPosition(uiX(controlX), uiY(cardTop + cardHeight / 2)).setSize(cardWidth * hudScale, cardHeight * hudScale);
      const cardLit = activePowerup || hovered;
      g.fillStyle(0x03172b, hovered ? 0.98 : 0.94); g.fillRoundedRect(controlX - cardWidth / 2, cardTop + 5, cardWidth, cardHeight, 16);
      g.fillStyle(cardLit ? 0x1878d0 : 0x0b559f, 1); g.fillRoundedRect(controlX - cardWidth / 2, cardTop, cardWidth, cardHeight, 16);
      g.fillStyle(0xffffff, cardLit ? 0.16 : 0.1); g.fillRoundedRect(controlX - cardWidth / 2 + 5, cardTop + 4, cardWidth - 10, 7, 4);
      g.lineStyle(cardLit ? 2.4 : 2, cardLit ? power.color : 0xffdf88, cardLit ? (hovered ? 1 : 0.9 + pulse * 0.1) : 0.98);
      g.strokeRoundedRect(controlX - cardWidth / 2, cardTop, cardWidth, cardHeight, 16);
      if (!compactTouchHud) {
        g.lineStyle(1, 0xffffff, hovered ? 0.3 : 0.18); g.lineBetween(controlX - 34, cardTop + 5, controlX + 34, cardTop + 5);
        g.fillStyle(power.color, activePowerup ? 0.94 : 0.58); g.fillRoundedRect(controlX - 42, cardTop + cardHeight - 4, 84, 2.5, 2);
      }
      this.powerupSprites[i]
        .setPosition(uiX(controlX), uiY(cardTop + (compactTouchHud ? cardHeight * 0.42 : 24)))
        .setDisplaySize((compactTouchHud ? Math.min(30, gadgetSize * 0.52) : 34) * iconScale * hudScale, (compactTouchHud ? Math.min(30, gadgetSize * 0.52) : 34) * iconScale * hudScale)
        .setDepth(9)
        .setVisible(true)
        .setAlpha(i === 3 && !this.extraLifeAvailable ? 0.42 : 1);
      if (compactTouchHud) {
        const badgeRadius = 10;
        const badgeX = controlX + cardWidth / 2 - badgeRadius;
        const badgeY = cardTop + badgeRadius;
        g.fillStyle(0x062d63, 1); g.fillCircle(badgeX, badgeY, badgeRadius);
        g.lineStyle(1.3, power.color, hovered || activePowerup ? 1 : 0.92); g.strokeCircle(badgeX, badgeY, badgeRadius);
      } else {
        g.fillStyle(0x062d63, 1); g.fillCircle(controlX + cardWidth / 2 - 14, cardTop + 14, 12);
        g.lineStyle(1.8, power.color, hovered || activePowerup ? 1 : 0.86); g.strokeCircle(controlX + cardWidth / 2 - 14, cardTop + 14, 12);
      }
      if (!this.powerupChargeTexts[i]) this.powerupChargeTexts[i] = this.add.text(0, 0, '', { fontFamily: 'Lilita One, Arial Black, sans-serif', fontSize: '11px', color: '#fffdf5', stroke: '#06121b', strokeThickness: 2 }).setResolution(this.gameplayTextResolution()).setOrigin(0.5).setDepth(10).setScrollFactor(0);
      const charges = i < 3 ? this.powerupCharges[i] : Number(this.extraLifeAvailable);
      this.powerupChargeTexts[i].setPosition(uiX(controlX + cardWidth / 2 - (compactTouchHud ? 8 : 14)), uiY(cardTop + (compactTouchHud ? 8 : 14)))
        .setScale(hudScale).setFontSize(12).setText(String(charges)).setVisible(true);
      if (!(this as any).powerupLabels) (this as any).powerupLabels = powerups.map(p => this.add.text(p.x, cardY + 48, p.title, { fontFamily: 'Nunito Sans, Arial, sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#f4f7f2', letterSpacing: 0.8, stroke: '#061525', strokeThickness: 1 }).setResolution(this.gameplayTextResolution()).setOrigin(0.5).setDepth(9).setScrollFactor(0));
      ((this as any).powerupLabels as Phaser.GameObjects.Text[])[i].setPosition(uiX(controlX), uiY(cardTop + 48)).setScale(hudScale).setText(power.title).setVisible(!compactTouchHud);
      if (!(this as any).powerupStatus) (this as any).powerupStatus = powerups.map(p => this.add.text(p.x, cardY + 68, p.status, { fontFamily: 'Nunito Sans, Arial, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#fffdf5', stroke: '#061525', strokeThickness: 1 }).setResolution(this.gameplayTextResolution()).setOrigin(0.5).setDepth(9).setScrollFactor(0));
      ((this as any).powerupStatus as Phaser.GameObjects.Text[])[i].setPosition(uiX(controlX), uiY(cardTop + 67)).setScale(hudScale).setText(power.status).setFontSize(10).setColor(activePowerup ? '#ffe28a' : '#ffffff').setVisible(!compactTouchHud);
    }

    const endState = this.state === 'won' || this.state === 'lost' || this.state === 'timeout';
    const modalOpen = endState;
    const runFailed = this.state === 'lost' || this.state === 'timeout';
    const report = this.gameResultActions;
    report?.classList.toggle('is-visible', endState);
    report?.classList.toggle('is-won', this.state === 'won');
    report?.classList.toggle('is-timeout', this.state === 'timeout');
    report?.classList.toggle('is-lost', this.state === 'lost');
    report?.setAttribute('aria-hidden', String(!endState));
    if (endState && report) {
      const complete = this.state === 'won';
      const timedOut = this.state === 'timeout';
      const collected = this.coins.filter(coin => coin.taken).length;
      const text = (selector: string, value: string) => {
        const element = report.querySelector<HTMLElement>(selector);
        if (element) element.textContent = value;
      };
      text('[data-report-level]', String(this.levelIndex + 1));
      text('[data-report-status]', complete ? 'ESCAPE MADE' : timedOut ? 'TIME EXPIRED' : 'BUSTED');
      text('[data-report-title]', complete ? `LEVEL ${this.levelIndex + 1} COMPLETE` : timedOut ? "TIME'S UP" : 'OUT OF LIVES');
      text('[data-report-subtitle]', complete ? 'Fagiolo got away with the goods.' : timedOut ? 'The escape window closed. Plan a quicker route.' : 'The guards caught up. Take another shot.');
      text('[data-report-emblem]', complete ? '★' : timedOut ? '!' : '×');
      text('[data-report-score]', String(this.score).padStart(5, '0'));
      text('[data-report-beans]', `${String(collected).padStart(2, '0')} / ${String(this.coins.length).padStart(2, '0')}`);
      text('[data-report-time]', `${String(Math.floor(this.timeLeft / 60)).padStart(2, '0')}:${String(this.timeLeft % 60).padStart(2, '0')}`);
      text('[data-report-lives]', `${this.lives} / 4`);
      text('[data-report-reward-kicker]', complete ? 'TREASURE CLAIMED' : 'LEVEL REWARD');
      text('[data-report-reward]', complete ? 'CHEST +500' : 'CHEST BONUS LOCKED');
      text('[data-report-extra]', complete
        ? this.raidBonusAwarded ? 'BEAN RAID +500' : `COLLECT ${this.raidBonusTarget}+ FOR +500`
        : 'CLEAR THE LEVEL TO CLAIM IT');
      text('[data-result="primary"]', complete ? this.levelIndex < 2 ? 'PLAY NEXT LEVEL' : 'REPLAY LEVEL' : 'RETRY LEVEL');
      text('[data-result="levels"]', complete ? 'LEVEL SELECT' : 'RETURN TO LEVELS');
      text('[data-report-footnote]', complete ? 'Every bean brings you closer to the perfect escape.' : 'Your collected beans and score are shown above.');
      text('[data-report-online-status]', this.leaderboardRunStatus);
      text('[data-result="leaderboard"]', complete && !this.online.user ? 'SIGN IN TO SAVE SCORE' : 'LEADERBOARD');
    }
    if (endState) this.modalButtonZone?.disableInteractive();
    this.pauseMenu?.classList.toggle('is-visible', this.state === 'paused' && !this.settingsOpen && !this.refillChoicePending);
    this.settingsMenu?.classList.toggle('is-visible', this.settingsOpen);
    const modal = this.modalArt;
    modal.setPosition(centerX * (1 - hudScale), centerY * (1 - hudScale)).setScale(hudScale);
    modal.clear().setVisible(false);
    for (const key of ['scoreLabel', 'scoreText', 'timerLabel', 'timerText', 'livesLabel', 'livesCount', 'coinsLabel', 'coinsText', 'routeLabel', 'routeValue']) {
      const item = (this as any)[key] as Phaser.GameObjects.Text | undefined;
      item?.setVisible(!modalOpen);
    }
    for (const groupName of ['powerupLabels', 'powerupStatus']) {
      ((this as any)[groupName] as Phaser.GameObjects.Text[] | undefined)?.forEach(text =>
        text.setVisible(!modalOpen && !compactTouchHud));
    }
    this.powerupSprites.forEach(sprite => sprite.setVisible(!modalOpen));
    this.powerupChargeTexts.forEach(text => text.setVisible(!modalOpen));
    if (endState && !this.gameResultActions) {
      modal.fillStyle(0x020918, 0.8); modal.fillRect(0, 0, viewWidth, viewHeight);
      const panelW = Math.max(280, Math.min(680, viewWidth - 24));
      const panelH = Math.min(430, Math.max(310, viewHeight - 28));
      const panelX = viewWidth / 2 - panelW / 2;
      const panelY = viewHeight / 2 - panelH / 2;
      const settings = false;
      modal.fillStyle(0x020b20, 0.88); modal.fillRoundedRect(panelX + 7, panelY + 10, panelW, panelH, 22);
      modal.fillStyle(0x071d3b, 0.99); modal.fillRoundedRect(panelX, panelY, panelW, panelH, 22);
      modal.lineStyle(2.5, 0x1c4775, 1); modal.strokeRoundedRect(panelX, panelY, panelW, panelH, 22);
      modal.lineStyle(1, 0xf0c865, 0.9); modal.strokeRoundedRect(panelX + 4, panelY + 4, panelW - 8, panelH - 8, 18);
      modal.fillStyle(0x0c315c, 1); modal.fillRoundedRect(panelX + 5, panelY + 5, panelW - 10, 101, 18);
      modal.fillStyle(0xffd15b, 1); modal.fillRoundedRect(panelX + 24, panelY + 15, panelW - 48, 2, 1);
      const complete = this.state === 'won';
      const isTimeout = this.state === 'timeout';
      const title = complete ? `LEVEL ${this.levelIndex + 1} COMPLETE` : isTimeout ? 'TIME IS UP' : 'OUT OF LIVES';
      const subtitle = complete ? 'TREASURE SECURED · ESCAPE COMPLETE'
        : isTimeout ? 'The escape window closed. Take a quicker route next run.'
          : 'Fagiolo ran out of lives. Try another run.';
      const accent = complete ? 0x4ecf9b : isTimeout ? 0xf0bb55 : 0xff6b75;
      modal.fillStyle(accent, 1); modal.fillCircle(panelX + 42, panelY + 54, 20);
      modal.lineStyle(2, 0xfff2cf, 0.9); modal.strokeCircle(panelX + 42, panelY + 54, 20);
      const seal = ensureText('resultSeal', panelX + 42, panelY + 54, { fontFamily: 'Lilita One, Arial Black, sans-serif', fontSize: '22px', color: '#fff8e8', align: 'center' }).setDepth(13).setOrigin(0.5).setText(complete ? '★' : isTimeout ? '!' : '×').setVisible(true);
      seal.setPosition(uiX(panelX + 42), uiY(panelY + 54)).setScale(hudScale);
      const kicker = ensureText('resultKicker', viewWidth / 2, panelY + 20, { fontFamily: 'Nunito Sans, Arial, sans-serif', fontSize: '9px', fontStyle: 'bold', color: '#ffe08a', align: 'center', letterSpacing: 2 }).setDepth(13).setOrigin(0.5).setText(`HEIST REPORT  ·  LEVEL ${this.levelIndex + 1}`).setVisible(true);
      kicker.setPosition(uiX(viewWidth / 2), uiY(panelY + 20)).setScale(hudScale);
      const modalTitleText = ensureText('modalTitle', viewWidth / 2, panelY + 47, { fontFamily: 'Lilita One, Arial Black, sans-serif', fontSize: '31px', fontStyle: 'bold', color: '#fff8e8', align: 'center', letterSpacing: 0.7 }).setDepth(13).setOrigin(0.5).setText(title).setVisible(true);
      modalTitleText.setFontSize(viewWidth < 600 ? 18 : 31).setPosition(uiX(viewWidth / 2), uiY(panelY + 47)).setScale(hudScale);
      const modalBodyText = ensureText('modalBody', viewWidth / 2, panelY + 83, { fontFamily: 'Nunito Sans, Arial, sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#c7d9ec', align: 'center', letterSpacing: 0.5 }).setDepth(13).setOrigin(0.5).setText(subtitle).setVisible(true);
      modalBodyText.setFontSize(viewWidth < 600 ? 9 : 11).setWordWrapWidth(panelW - 70).setPosition(uiX(viewWidth / 2), uiY(panelY + 83)).setScale(hudScale);
      if (settings) {
        const rows = [
          ['MOVE', 'A / D   or   LEFT / RIGHT'],
          ['JUMP', 'W   /   SPACE   /   UP'],
          ['POWER-UPS', 'KEYS   1   TO   4'],
          ['SOUND', `M  OR  TAP  ·  ${this.soundEnabled ? 'ON' : 'OFF'}`],
        ];
        for (let i = 0; i < rows.length; i++) {
          const rowY = panelY + 150 + i * 50;
          modal.fillStyle(0x082e63, 1); modal.fillRoundedRect(panelX + 86, rowY + 2, panelW - 172, 46, 11);
          modal.fillStyle(0x0e579f, 1); modal.fillRoundedRect(panelX + 86, rowY, panelW - 172, 46, 11);
          modal.lineStyle(1.4, 0xa9d8ff, 0.48); modal.strokeRoundedRect(panelX + 86, rowY, panelW - 172, 46, 11);
          if (!(this as any).settingRows) (this as any).settingRows = rows.map((_, row) => ({
            label: this.add.text(uiX(panelX + 112), uiY(panelY + 150 + row * 50 + 12), '', { fontFamily: 'Nunito Sans, Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#d6b972', letterSpacing: 1 }).setDepth(13).setScrollFactor(0).setScale(hudScale),
            value: this.add.text(uiX(panelX + 335), uiY(panelY + 150 + row * 50 + 10), '', { fontFamily: 'Nunito Sans, Arial, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#fff8e8' }).setDepth(13).setScrollFactor(0).setScale(hudScale),
          }));
          const pair = ((this as any).settingRows as { label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text }[])[i];
          pair.label.setPosition(uiX(panelX + 112), uiY(panelY + 150 + i * 50 + 12)).setScale(hudScale).setText(rows[i][0]).setVisible(true);
          pair.value.setPosition(uiX(panelX + 335), uiY(panelY + 150 + i * 50 + 10)).setScale(hudScale).setText(rows[i][1]).setVisible(true);
        }
      }
      if ((this as any).settingRows) ((this as any).settingRows as { label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text }[]).forEach(row => { if (!settings) { row.label.setVisible(false); row.value.setVisible(false); } });
      const collected = this.coins.filter(coin => coin.taken).length;
      const timerValue = `${String(Math.floor(this.timeLeft / 60)).padStart(2, '0')}:${String(this.timeLeft % 60).padStart(2, '0')}`;
      const stats = [
        { label: 'SCORE', value: String(this.score).padStart(5, '0'), color: '#ffdf70', tint: 0xffdf70 },
        { label: 'BEANS', value: `${collected}/${this.coins.length}`, color: '#ffd66d', tint: 0xffd66d },
        { label: 'TIME LEFT', value: timerValue, color: this.timeLeft > 0 ? '#74dfbd' : '#ff8790', tint: this.timeLeft > 0 ? 0x74dfbd : 0xff8790 },
        { label: 'LIVES', value: `${this.lives}/4`, color: '#ff8290', tint: 0xff8290 },
      ];
      const statsTop = panelY + 123;
      const statsGap = 8;
      const statWidth = (panelW - 40 - statsGap * 3) / 4;
      for (const [index, item] of stats.entries()) {
        const statX = panelX + 20 + index * (statWidth + statsGap);
        modal.fillStyle(0x0b2b50, 1); modal.fillRoundedRect(statX, statsTop + 3, statWidth, 66, 11);
        modal.fillStyle(0x103b69, 1); modal.fillRoundedRect(statX, statsTop, statWidth, 66, 11);
        modal.lineStyle(1, item.tint, 0.48); modal.strokeRoundedRect(statX, statsTop, statWidth, 66, 11);
        const label = ensureText(`resultStatLabel${index}`, statX + statWidth / 2, statsTop + 11, { fontFamily: 'Nunito Sans, Arial, sans-serif', fontSize: '8px', fontStyle: 'bold', color: '#b8cce0', align: 'center', letterSpacing: 0.8 }).setDepth(13).setOrigin(0.5).setText(item.label).setVisible(true);
        label.setPosition(uiX(statX + statWidth / 2), uiY(statsTop + 11)).setScale(hudScale);
        const value = ensureText(`resultStatValue${index}`, statX + statWidth / 2, statsTop + 34, { fontFamily: 'Lilita One, Arial Black, sans-serif', fontSize: '19px', color: item.color, align: 'center' }).setDepth(13).setOrigin(0.5).setText(item.value).setVisible(true);
        value.setFontSize(viewWidth < 600 ? 15 : 19).setPosition(uiX(statX + statWidth / 2), uiY(statsTop + 34)).setScale(hudScale);
      }
      const rewardTop = panelY + 198;
      modal.fillStyle(complete ? 0x173f57 : 0x102c4b, 1); modal.fillRoundedRect(panelX + 20, rewardTop, panelW - 40, 38, 10);
      modal.lineStyle(1, complete ? 0x66d5ad : 0x6185a7, 0.55); modal.strokeRoundedRect(panelX + 20, rewardTop, panelW - 40, 38, 10);
      const rewardText = complete
        ? this.raidBonusAwarded ? 'CHEST +500     ·     BEAN RAID BONUS +500' : `CHEST +500     ·     COLLECT ${this.raidBonusTarget}+ BEANS FOR +500`
        : isTimeout ? 'RETRY TO BEAT THE CLOCK' : 'RETRY TO KEEP YOUR BEANS';
      const rewards = ensureText('resultRewards', viewWidth / 2, rewardTop + 12, { fontFamily: 'Lilita One, Arial Black, sans-serif', fontSize: '12px', color: complete ? '#ffe89d' : '#c9d9eb', align: 'center', letterSpacing: 0.3 }).setDepth(13).setOrigin(0.5).setText(rewardText).setVisible(true);
      rewards.setFontSize(viewWidth < 600 ? 9 : 12).setWordWrapWidth(panelW - 50).setPosition(uiX(viewWidth / 2), uiY(rewardTop + 12)).setScale(hudScale);
      const buttonY = panelY + panelH - 37;
      const retryButtonText = ensureText('modalButtonText', viewWidth / 2, buttonY - 13, { fontFamily: 'Lilita One, Arial Black, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#173766', align: 'center', letterSpacing: 0.7 }).setDepth(13).setOrigin(0.5);
      const secondaryButtonText = ensureText('modalSecondaryButtonText', viewWidth / 2, buttonY - 13, { fontFamily: 'Lilita One, Arial Black, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#fff4d2', align: 'center', letterSpacing: 0.45 }).setDepth(13).setOrigin(0.5);
      if (runFailed) {
        this.modalButtonZone?.disableInteractive();
        retryButtonText.setVisible(false);
        secondaryButtonText.setVisible(false);
      } else {
        const buttonWidth = Math.min(270, panelW - 32);
        modal.fillStyle(0x815013, 1); modal.fillRoundedRect(viewWidth / 2 - buttonWidth / 2, buttonY - 23, buttonWidth, 52, 13);
        modal.fillStyle(0xffd763, 1); modal.fillRoundedRect(viewWidth / 2 - buttonWidth / 2, buttonY - 27, buttonWidth, 52, 13);
        modal.lineStyle(1.5, 0xfff1b4, 1); modal.strokeRoundedRect(viewWidth / 2 - buttonWidth / 2, buttonY - 27, buttonWidth, 52, 13);
        this.modalButtonZone?.setPosition(uiX(viewWidth / 2), uiY(buttonY)).setSize(buttonWidth * hudScale, 60 * hudScale).setInteractive();
        retryButtonText.setPosition(uiX(viewWidth / 2), uiY(buttonY - 13)).setScale(hudScale).setFontSize(viewWidth < 600 ? 12 : 16).setText(this.levelIndex < 2 ? 'CHOOSE NEXT LEVEL' : 'LEVEL SELECT').setVisible(true);
        secondaryButtonText.setVisible(false);
      }
    } else {
      for (const key of ['modalTitle', 'modalBody', 'modalButtonText', 'modalSecondaryButtonText', 'resultSeal', 'resultKicker', 'resultRewards', 'resultStatLabel0', 'resultStatLabel1', 'resultStatLabel2', 'resultStatLabel3', 'resultStatValue0', 'resultStatValue1', 'resultStatValue2', 'resultStatValue3']) ((this as any)[key] as Phaser.GameObjects.Text | undefined)?.setVisible(false);
      if (!endState) this.gameResultActions?.classList.remove('is-visible');
      if ((this as any).settingRows) ((this as any).settingRows as { label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text }[]).forEach(row => { row.label.setVisible(false); row.value.setVisible(false); });
    }
    this.syncCrispHud();
  }
}

const gameHost = window as Window & { __fagioloHeistGame?: Phaser.Game };
const syncVisibleGameArea = () => {
  const mount = document.getElementById('game');
  if (!mount) return;
  const viewport = window.visualViewport;
  const visualViewportIsUsable = viewport && Math.abs(viewport.scale - 1) < 0.01;
  const width = visualViewportIsUsable ? viewport.width : window.innerWidth;
  const height = visualViewportIsUsable ? viewport.height : window.innerHeight;
  const left = visualViewportIsUsable ? viewport.offsetLeft : 0;
  const top = visualViewportIsUsable ? viewport.offsetTop : 0;
  mount.style.setProperty('--game-visible-width', `${width}px`);
  mount.style.setProperty('--game-visible-height', `${height}px`);
  mount.style.setProperty('--game-visible-left', `${left}px`);
  mount.style.setProperty('--game-visible-top', `${top}px`);
};
syncVisibleGameArea();
window.addEventListener('resize', syncVisibleGameArea, { passive: true });
window.visualViewport?.addEventListener('resize', syncVisibleGameArea, { passive: true });
gameHost.__fagioloHeistGame?.destroy(true);
document.querySelectorAll('#game > .game-preloader, #game > .landing-menu, #game > .level-menu, #game > .game-top-controls, #game > .game-result-actions, #game > .game-settings-overlay, #game > .game-pause-overlay, #game > .game-touch-controls, #game > .orientation-gate, #game > .online-overlay, #game > .game-crisp-overlay').forEach(element => element.remove());
gameHost.__fagioloHeistGame = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  fullscreenTarget: 'game',
  backgroundColor: '#102744',
  transparent: true,
  scale: { mode: Phaser.Scale.RESIZE },
  scene: [HeistScene],
  render: { antialias: true, pixelArt: false },
});
