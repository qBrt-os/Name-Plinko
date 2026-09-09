/**
 * Plinko Name Picker
 * - Rectangular board with staggered peg rows
 * - Converging ramps funnel all balls to a single exit
 * - First ball to reach the exit wins the round
 * - Stake.com-inspired color palette & glossy ball rendering
 * - Deterministic fixed-timestep physics (FPS-independent)
 * - All balls spawn from center top for fairness
 * - Balls show player initials; sidebar shows color-coded roster
 */

(function () {
    'use strict';

    /* ========================================
       1. PALETTE & CONSTANTS
       ======================================== */
    var COLORS = [
        '#ff0055', '#00f5d4', '#ffbe0b', '#3a86ff', '#8338ec',
        '#fb5607', '#ff007f', '#00e701', '#00b4d8', '#9b5de5',
        '#f15bb5', '#fee440', '#70d6ff', '#52b788', '#ff9770'
    ];

    function hexToRgb(hex) {
        if (!hex || typeof hex !== 'string') return { r: 255, g: 255, b: 255 };
        var clean = hex.replace('#', '');
        if (clean.length === 3) clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
        var num = parseInt(clean, 16);
        if (isNaN(num)) return { r: 255, g: 255, b: 255 };
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }

    function hexToRgba(hex, a) {
        var rgb = hexToRgb(hex);
        return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + Math.max(0, Math.min(1, a)) + ')';
    }

    function lerpColor(c1, c2, t) {
        var rgb1 = hexToRgb(c1);
        var rgb2 = hexToRgb(c2);
        var r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * t);
        var g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * t);
        var b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * t);
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    var PHASES = {
        IDLE: 'idle',
        READY: 'ready',
        DROPPING: 'dropping',
        WINNER_FOUND: 'winner-found',
        COMPLETE: 'complete'
    };

    /* ========================================
       2. STATE
       ======================================== */
    var state = {
        phase: PHASES.IDLE,
        players: [],
        results: [],
        currentWinner: null,
        settings: {
            soundEnabled: true,
            volume: 0.7,
            gravityMultiplier: 0.6,
            bounciness: 0.55
        }
    };

    var listeners = [];
    function subscribe(fn) { listeners.push(fn); }
    function notify() {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](state); } catch (e) { console.error(e); }
        }
    }
    function setState(patch) {
        for (var k in patch) { if (patch.hasOwnProperty(k)) state[k] = patch[k]; }
        notify();
    }

    function getInitials(name) {
        var parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }

    function initPlayers(names) {
        state.players = names.map(function (raw, i) {
            return {
                id: 'p-' + i + '-' + Date.now(),
                name: raw.trim(),
                initials: getInitials(raw),
                color: COLORS[i % COLORS.length],
                body: null,
                picked: false
            };
        });
        state.results = [];
        state.currentWinner = null;
        state.phase = PHASES.READY;
        notify();
    }

    function getUnpicked() { return state.players.filter(function (p) { return !p.picked; }); }

    function markPicked(player) {
        player.picked = true;
        state.results.push({
            id: player.id,
            name: player.name,
            initials: player.initials,
            color: player.color,
            position: state.results.length + 1
        });
        state.currentWinner = player.body;
        state.phase = PHASES.WINNER_FOUND;
        notify();
    }

    function undoLast() {
        if (state.results.length === 0) return null;
        var last = state.results.pop();
        var player = state.players.find(function (p) { return p.id === last.id; });
        if (player) { player.picked = false; player.body = null; }
        state.currentWinner = null;
        state.phase = PHASES.READY;
        notify();
        return last;
    }

    function resetAll() {
        state.results = [];
        state.currentWinner = null;
        if (state.players.length > 0) {
            state.players.forEach(function (p) {
                p.picked = false;
                p.body = null;
            });
            state.phase = PHASES.READY;
        } else {
            state.phase = PHASES.IDLE;
        }
        notify();
    }

    function clearAll() {
        state.phase = PHASES.IDLE;
        state.players = [];
        state.results = [];
        state.currentWinner = null;
        notify();
    }

    /* ========================================
       3. AUDIO SYNTHESIS
       ======================================== */
    var audioCtx = null;
    var masterGain = null;

    function ensureAudio() {
        if (!audioCtx) {
            var Cls = window.AudioContext || window.webkitAudioContext;
            if (!Cls) return null;
            audioCtx = new Cls();
            masterGain = audioCtx.createGain();
            masterGain.connect(audioCtx.destination);
            syncGain();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    function syncGain() {
        if (!masterGain || !audioCtx) return;
        var v = state.settings.soundEnabled ? Math.max(0, Math.min(1, state.settings.volume)) : 0;
        masterGain.gain.setValueAtTime(v, audioCtx.currentTime);
    }

    function playTick() {
        var ctx = ensureAudio();
        if (!ctx || !state.settings.soundEnabled) return;
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(950 + (Math.random() - 0.5) * 180, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.015);
        g.gain.setValueAtTime(0.18, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);
        osc.connect(g); g.connect(masterGain);
        osc.start(now); osc.stop(now + 0.02);
    }

    function playExitHit() {
        var ctx = ensureAudio();
        if (!ctx || !state.settings.soundEnabled) return;
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
        g.gain.setValueAtTime(0.25, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
        osc.connect(g); g.connect(masterGain);
        osc.start(now); osc.stop(now + 0.12);
    }

    function playFanfare() {
        var ctx = ensureAudio();
        if (!ctx || !state.settings.soundEnabled) return;
        var now = ctx.currentTime;
        var notes = [
            { f: 587.33, t: 0, d: 0.12 },
            { f: 783.99, t: 0.10, d: 0.12 },
            { f: 880.00, t: 0.20, d: 0.15 },
            { f: 1174.66, t: 0.32, d: 0.55 }
        ];
        notes.forEach(function (n) {
            var start = now + n.t;
            var osc = ctx.createOscillator();
            var g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(n.f, start);
            g.gain.setValueAtTime(0, start);
            g.gain.linearRampToValueAtTime(0.24, start + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, start + n.d);
            osc.connect(g); g.connect(masterGain);
            osc.start(start); osc.stop(start + n.d);
        });
    }

    /* ========================================
       4. CONFETTI & SPARKS
       ======================================== */
    var confettiList = [];
    var sparkList = [];
    var wallGlowList = [];
    var pegPulses = [];

    var finishGate = {
        hitTime: 0,
        hitColor: null,
        hitX: 400
    };

    function triggerFinishGate(color, hitX) {
        finishGate.hitTime = performance.now();
        finishGate.hitColor = color || '#ffffff';
        finishGate.hitX = (hitX !== undefined) ? hitX : (BOARD.W / 2);
    }

    function triggerPegPulse(peg, color) {
        var now = performance.now();
        var c = color || '#ffffff';
        if (peg && peg.pegData) {
            peg.pegData.hitTime = now;
            peg.pegData.hitColor = c;
        }
        pegPulses.push({
            x: peg.position.x,
            y: peg.position.y,
            color: c,
            startTime: now,
            duration: 550
        });
        if (pegPulses.length > 80) pegPulses.shift();
    }

    function addWallGlow(x, y) {
        if (wallGlowList.length > 20) wallGlowList.shift();
        wallGlowList.push({ x: x, y: y, life: 1.0 });
    }

    function fireConfetti(ox, oy) {
        for (var i = 0; i < 100; i++) {
            var angle = (Math.PI * 2 * i) / 100 + (Math.random() - 0.5) * 0.5;
            var speed = 4.5 + Math.random() * 10;
            confettiList.push({
                x: ox, y: oy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 6 - Math.random() * 5,
                size: 5 + Math.random() * 6,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                rot: Math.random() * 360,
                vRot: (Math.random() - 0.5) * 14,
                tilt: Math.random() * Math.PI,
                vTilt: 0.09 + Math.random() * 0.1,
                life: 1,
                shape: Math.random() > 0.3 ? 'rect' : 'circle'
            });
        }
    }

    function addSparks(x, y, color) {
        for (var i = 0; i < 4; i++) {
            var a = Math.random() * Math.PI * 2;
            var sp = 1.5 + Math.random() * 3;
            sparkList.push({
                x: x, y: y,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                r: 1.5 + Math.random() * 1.5,
                color: color || '#ffffff',
                alpha: 1,
                decay: 0.05 + Math.random() * 0.04
            });
        }
    }

    function updateEffects() {
        var now = performance.now();
        for (var pIdx = pegPulses.length - 1; pIdx >= 0; pIdx--) {
            if (now - pegPulses[pIdx].startTime >= pegPulses[pIdx].duration) {
                pegPulses.splice(pIdx, 1);
            }
        }
        for (var i = confettiList.length - 1; i >= 0; i--) {
            var p = confettiList[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.22; p.vx *= 0.98;
            p.rot += p.vRot; p.tilt += p.vTilt;
            p.life -= 0.007;
            if (p.life <= 0 || p.y > 2000) confettiList.splice(i, 1);
        }
        for (var j = sparkList.length - 1; j >= 0; j--) {
            var s = sparkList[j];
            s.x += s.vx; s.y += s.vy;
            s.alpha -= s.decay;
            if (s.alpha <= 0) sparkList.splice(j, 1);
        }
        for (var k = wallGlowList.length - 1; k >= 0; k--) {
            var g = wallGlowList[k];
            g.life -= 0.05;
            if (g.life <= 0) wallGlowList.splice(k, 1);
        }
    }

    function drawEffects(c) {
        wallGlowList.forEach(function (g) {
            c.save();
            var radius = 16 + (1 - g.life) * 12;
            var wGlow = c.createRadialGradient(g.x, g.y, 1, g.x, g.y, radius);
            wGlow.addColorStop(0, 'rgba(255, 255, 255, ' + (0.8 * g.life) + ')');
            wGlow.addColorStop(0.5, 'rgba(255, 255, 255, ' + (0.3 * g.life) + ')');
            wGlow.addColorStop(1, 'transparent');
            c.fillStyle = wGlow;
            c.beginPath(); c.arc(g.x, g.y, radius, 0, Math.PI * 2); c.fill();
            c.restore();
        });
        sparkList.forEach(function (s) {
            c.save(); c.globalAlpha = Math.max(0, s.alpha);
            c.fillStyle = s.color;
            c.beginPath(); c.arc(s.x, s.y, s.r, 0, Math.PI * 2); c.fill();
            c.restore();
        });
        confettiList.forEach(function (p) {
            c.save();
            c.translate(p.x, p.y);
            c.rotate(p.rot * Math.PI / 180);
            c.scale(1, Math.cos(p.tilt));
            c.fillStyle = p.color;
            c.globalAlpha = Math.max(0, p.life);
            if (p.shape === 'circle') {
                c.beginPath(); c.arc(0, 0, p.size * 0.5, 0, Math.PI * 2); c.fill();
            } else {
                c.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.65);
            }
            c.restore();
        });
    }

    /* ========================================
       5. MATTER.JS PHYSICS (FIXED 60HZ)
       ======================================== */
    var Matter = window.Matter;
    var engine = null;
    var world = null;
    var collisionHandlers = [];

    var FIXED_DT = 1000 / 60;
    var MAX_DELTA = 100;
    var MAX_SUBSTEPS = 5;
    var lastFrameTime = 0;
    var accumulator = 0;
    var simRunning = false;

    function initPhysics() {
        if (!Matter) return;
        if (Matter.Resolver) Matter.Resolver._restingThresh = 0.05;
        engine = Matter.Engine.create({
            positionIterations: 12,
            velocityIterations: 10,
            enableSleeping: false
        });
        world = engine.world;
        engine.gravity.y = BOARD.baseGravity * (state.settings.gravityMultiplier || 0.6);

        Matter.Events.on(engine, 'collisionStart', function (ev) {
            ev.pairs.forEach(function (pair) {
                var a = pair.bodyA, b = pair.bodyB;
                var peg = null, ball = null, boundary = null;
                if (a.label === 'peg' && b.label === 'ball') { peg = a; ball = b; }
                else if (b.label === 'peg' && a.label === 'ball') { peg = b; ball = a; }
                else if (a.label === 'boundary' && b.label === 'ball') { boundary = a; ball = b; }
                else if (b.label === 'boundary' && a.label === 'ball') { boundary = b; ball = a; }

                if (peg && ball) {
                    playTick();
                    triggerPegPulse(peg, ball.playerColor);
                }

                if (boundary && ball) {
                    var botY = (funnelPoints && funnelPoints.botBL) ? funnelPoints.botBL.y : 600;
                    if (ball.position.y <= botY + 4) {
                        addWallGlow(ball.position.x, ball.position.y);
                        playTick();
                        // Moderate inward deflection so balls bounce into the peg field instead of sliding
                        var isLeft = ball.position.x < (BOARD.W / 2);
                        var pushX = isLeft ? 3.2 : -3.2;
                        Matter.Body.setVelocity(ball, {
                            x: pushX,
                            y: Math.max(0.6, Math.min(ball.velocity.y * 0.65, 2.2))
                        });
                    }
                }
            });
            collisionHandlers.forEach(function (h) { h(ev); });
        });

        startPhysicsLoop();
    }

    function clampBallVelocities() {
        var maxVel = 12.0;
        var now = performance.now();
        var fp = funnelPoints;
        var topBL_x = (fp && fp.topBL) ? fp.topBL.x : 93;
        var midY = (fp && fp.midBL) ? fp.midBL.y : 90;
        var botY = (fp && fp.botBL) ? fp.botBL.y : 600;
        var topY = (fp && fp.topY !== undefined) ? fp.topY : 20;
        var slope_dx = (fp && fp.slope_dx) ? fp.slope_dx : 0.484;
        var ballR = BOARD.ballRadius;

        state.players.forEach(function (s) {
            if (!s.body || s.body.isStatic || s.body.hasFinished || s.picked) return;
            var bx = s.body.position.x;
            var by = s.body.position.y;
            var vx = s.body.velocity.x;
            var vy = s.body.velocity.y;

            // Once winner is found, smoothly damp non-winner balls
            if (state.phase === PHASES.WINNER_FOUND && s.body !== state.currentWinner) {
                Matter.Body.setVelocity(s.body, { x: vx * 0.95, y: vy * 0.95 });
                return;
            }

            // Anti-wedging wall separation in the peg / funnel field
            if (by >= topY && by <= botY + 4) {
                var wallL = (by < midY) ? topBL_x : (topBL_x + slope_dx * (by - midY));
                var wallR = BOARD.W - wallL;

                // Left wall contact / sliding - prevent sliding along wall, deflect inward moderately
                if (bx - ballR <= wallL + 2.0) {
                    Matter.Body.setPosition(s.body, { x: wallL + ballR + 2.0, y: by });
                    if (vx < 1.0) {
                        Matter.Body.setVelocity(s.body, { x: 3.0, y: Math.min(vy * 0.65, 2.4) });
                        addWallGlow(wallL, by);
                        if (now - (s.body.lastWallTick || 0) > 120) {
                            playTick();
                            s.body.lastWallTick = now;
                        }
                    }
                }
                // Right wall contact / sliding - prevent sliding along wall, deflect inward moderately
                else if (bx + ballR >= wallR - 2.0) {
                    Matter.Body.setPosition(s.body, { x: wallR - ballR - 2.0, y: by });
                    if (vx > -1.0) {
                        Matter.Body.setVelocity(s.body, { x: -3.0, y: Math.min(vy * 0.65, 2.4) });
                        addWallGlow(wallR, by);
                        if (now - (s.body.lastWallTick || 0) > 120) {
                            playTick();
                            s.body.lastWallTick = now;
                        }
                    }
                }
            }

            // High velocity clamping to prevent tunneling
            var speed = Math.hypot(s.body.velocity.x, s.body.velocity.y);
            if (speed > maxVel) {
                var scale = maxVel / speed;
                Matter.Body.setVelocity(s.body, { x: s.body.velocity.x * scale, y: s.body.velocity.y * scale });
            }
        });
    }

    function startPhysicsLoop() {
        if (simRunning) return;
        simRunning = true;
        lastFrameTime = performance.now();
        accumulator = 0;

        function step(now) {
            if (!simRunning) return;
            var delta = now - lastFrameTime;
            lastFrameTime = now;
            if (delta > MAX_DELTA) delta = MAX_DELTA;
            accumulator += delta;
            var steps = 0;
            while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
                Matter.Engine.update(engine, FIXED_DT);
                clampBallVelocities();
                accumulator -= FIXED_DT;
                steps++;
            }
            if (accumulator > FIXED_DT * 2) accumulator = 0;
            requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function clearWorld() {
        if (world) Matter.World.clear(world);
        if (engine) Matter.Engine.clear(engine);
    }

    function addBodies(b) { if (world) Matter.World.add(world, b); }
    function removeBody(b) { if (b && world) Matter.World.remove(world, b); }
    function setGravityY(v) { if (engine) engine.gravity.y = v; }

    /* ========================================
       6. FUNNEL PLINKO BOARD GEOMETRY
       ======================================== */
    var BOARD = {
        W: 800,
        H: 700,
        pegRadius: 3,
        ballRadius: 11,
        rows: 12,
        pegSpacing: 42,
        topPegY: 104,
        exitGap: 64,
        baseGravity: 0.52
    };

    var boardPegs = [];
    var boardWalls = [];
    var exitSensor = null;
    var funnelPoints = {
        topBL: { x: 0, y: 0 },
        topBR: { x: 0, y: 0 },
        midBL: { x: 0, y: 0 },
        midBR: { x: 0, y: 0 },
        botBL: { x: 0, y: 0 },
        botBR: { x: 0, y: 0 },
        exitL: { x: 0, y: 0 },
        exitR: { x: 0, y: 0 },
        topY: 20,
        rampEndY: 0,
        cupFloorY: 0,
        slope_dx: 0.484
    };

    function createBoard() {
        clearWorld();
        setGravityY(BOARD.baseGravity * (state.settings.gravityMultiplier || 0.6));

        boardPegs = [];
        boardWalls = [];

        var W = BOARD.W;
        var H = BOARD.H;
        var rows = BOARD.rows;
        var pegR = BOARD.pegRadius;
        var restitution = state.settings.bounciness || 0.55;
        var spacing = BOARD.pegSpacing;
        var exitGap = BOARD.exitGap;

        var centerX = W / 2;
        var topPegY = BOARD.topPegY;
        var scale = 1.0;

        // Visible collection cup parameters at bottom of board (entirely within canvas)
        var cupFloorY = H - 24;
        var cupDepth = 30;
        var rampEndY = cupFloorY - cupDepth;
        var rampHeight = 46;
        var botY = rampEndY - rampHeight;
        var bottomPegGap = 34;
        var bottomPegY = botY - bottomPegGap;
        var rowSpacingY = (bottomPegY - topPegY) / (rows - 1);

        // Generous wall clearance so balls never wedge against outer walls
        var wallOffset = 34;

        var topPegs = 3 + (rows - 1);
        var topRowW = (topPegs - 1) * spacing;

        var bT = 20; // top ceiling
        var midY = topPegY - 14;

        var topBL_x = centerX - topRowW / 2 - wallOffset;
        var topBR_x = centerX + topRowW / 2 + wallOffset;

        // Funnel walls contour rows down to the 4-peg penultimate row
        var penult_r = rows - 2;
        var penult_Y = topPegY + penult_r * rowSpacingY;
        var penult_W = 3 * spacing; // 4 pegs width
        var penult_wallX = centerX - penult_W / 2 - wallOffset;
        var slope_dx = (penult_wallX - topBL_x) / (penult_Y - midY);

        // Funnel walls continue sloping smoothly down to botY
        var botBL_x = penult_wallX + slope_dx * (botY - penult_Y);
        var botBR_x = (centerX + penult_W / 2 + wallOffset) - slope_dx * (botY - penult_Y);

        var exitL_x = centerX - exitGap / 2;
        var exitR_x = centerX + exitGap / 2;

        funnelPoints = {
            topBL: { x: topBL_x, y: bT },
            topBR: { x: topBR_x, y: bT },
            midBL: { x: topBL_x, y: midY },
            midBR: { x: topBR_x, y: midY },
            botBL: { x: botBL_x, y: botY },
            botBR: { x: botBR_x, y: botY },
            exitL: { x: exitL_x, y: rampEndY },
            exitR: { x: exitR_x, y: rampEndY },
            topY: bT,
            rampEndY: rampEndY,
            cupFloorY: cupFloorY,
            slope_dx: slope_dx
        };

        // Create pegs with 100% equal vertical distance across all rows (down to 3 pegs in the last row)
        for (var r = 0; r < rows; r++) {
            var count = topPegs - r;
            var rowW = (count - 1) * spacing;
            var startX = centerX - rowW / 2;
            var y = topPegY + r * rowSpacingY;

            for (var c = 0; c < count; c++) {
                var x = startX + c * spacing;
                var peg = Matter.Bodies.circle(x, y, pegR, {
                    isStatic: true,
                    label: 'peg',
                    restitution: restitution,
                    friction: 0.02
                });
                peg.pegData = { row: r, col: c, glow: 0 };
                boardPegs.push(peg);
            }
        }
        addBodies(boardPegs);

        // Thick physics walls matching visible borders exactly (zero phasing, zero clipping)
        var wallThick = 36;
        var walls = [];

        var wallRestitution = restitution;

        // 1. Top vertical side walls
        var topVertH = midY - bT;
        walls.push(Matter.Bodies.rectangle(topBL_x - wallThick / 2, bT + topVertH / 2, wallThick, topVertH + wallThick, {
            isStatic: true, label: 'boundary', restitution: wallRestitution, friction: 0.0001
        }));
        walls.push(Matter.Bodies.rectangle(topBR_x + wallThick / 2, bT + topVertH / 2, wallThick, topVertH + wallThick, {
            isStatic: true, label: 'boundary', restitution: wallRestitution, friction: 0.0001
        }));

        // 2. Top ceiling wall
        walls.push(Matter.Bodies.rectangle(centerX, bT - wallThick / 2, (topBR_x - topBL_x) + wallThick * 2, wallThick, {
            isStatic: true, label: 'boundary', friction: 0
        }));

        // 3. Angled funnel walls (bouncy to reflect balls back into the peg field)
        var lAngle = Math.atan2(botY - midY, botBL_x - topBL_x);
        var lDist = Math.hypot(botBL_x - topBL_x, botY - midY);
        var lMidX = (topBL_x + botBL_x) / 2;
        var lMidY = (midY + botY) / 2;
        walls.push(Matter.Bodies.rectangle(
            lMidX - Math.sin(lAngle) * (wallThick / 2),
            lMidY + Math.cos(lAngle) * (wallThick / 2),
            lDist + 10, wallThick,
            { isStatic: true, angle: lAngle, label: 'boundary', restitution: wallRestitution, friction: 0.0001 }
        ));

        var rAngle = Math.atan2(botY - midY, botBR_x - topBR_x);
        var rDist = Math.hypot(botBR_x - topBR_x, botY - midY);
        var rMidX = (topBR_x + botBR_x) / 2;
        var rMidY = (midY + botY) / 2;
        walls.push(Matter.Bodies.rectangle(
            rMidX + Math.sin(rAngle) * (wallThick / 2),
            rMidY - Math.cos(rAngle) * (wallThick / 2),
            rDist + 10, wallThick,
            { isStatic: true, angle: rAngle, label: 'boundary', restitution: wallRestitution, friction: 0.0001 }
        ));

        // 4. Converging bottom ramps (aligned under the visual lines)
        var rampThick = 24;
        var lRampDx = exitL_x - botBL_x;
        var lRampDy = rampEndY - botY;
        var lRampAngle = Math.atan2(lRampDy, lRampDx);
        var lRampDist = Math.hypot(lRampDx, lRampDy);
        var lRampMidX = (botBL_x + exitL_x) / 2;
        var lRampMidY = (botY + rampEndY) / 2;
        walls.push(Matter.Bodies.rectangle(
            lRampMidX - Math.sin(lRampAngle) * (rampThick / 2),
            lRampMidY + Math.cos(lRampAngle) * (rampThick / 2),
            lRampDist + 10, rampThick,
            { isStatic: true, angle: lRampAngle, label: 'ramp', friction: 0.01, restitution: 0.35 }
        ));

        var rRampDx = exitR_x - botBR_x;
        var rRampDy = rampEndY - botY;
        var rRampAngle = Math.atan2(rRampDy, rRampDx);
        var rRampDist = Math.hypot(rRampDx, rRampDy);
        var rRampMidX = (botBR_x + exitR_x) / 2;
        var rRampMidY = (botY + rampEndY) / 2;
        walls.push(Matter.Bodies.rectangle(
            rRampMidX + Math.sin(rRampAngle) * (rampThick / 2),
            rRampMidY - Math.cos(rRampAngle) * (rampThick / 2),
            rRampDist + 10, rampThick,
            { isStatic: true, angle: rRampAngle, label: 'ramp', friction: 0.01, restitution: 0.35 }
        ));

        // 5. Exit collection cup (matching visible area exactly so finished balls never clip out)
        var cupH = cupFloorY - rampEndY;
        // Cup left vertical wall
        walls.push(Matter.Bodies.rectangle(
            exitL_x - wallThick / 2, (rampEndY + cupFloorY) / 2,
            wallThick, cupH + 10,
            { isStatic: true, label: 'boundary', friction: 0.02, restitution: 0.3 }
        ));
        // Cup right vertical wall
        walls.push(Matter.Bodies.rectangle(
            exitR_x + wallThick / 2, (rampEndY + cupFloorY) / 2,
            wallThick, cupH + 10,
            { isStatic: true, label: 'boundary', friction: 0.02, restitution: 0.3 }
        ));
        // Cup bottom floor
        walls.push(Matter.Bodies.rectangle(
            centerX, cupFloorY + wallThick / 2,
            (exitR_x - exitL_x) + wallThick * 2, wallThick,
            { isStatic: true, label: 'floor', friction: 0.15, restitution: 0.2 }
        ));

        boardWalls = walls;
        addBodies(walls);

        // 6. Exit sensor (across entrance to the cup)
        exitSensor = Matter.Bodies.rectangle(centerX, rampEndY + 6, exitGap - 2, 12, {
            isStatic: true, isSensor: true, label: 'exit'
        });
        addBodies(exitSensor);
    }

    /* ========================================
       7. BALL MANAGEMENT
       ======================================== */
    function createBalls() {
        var unpicked = getUnpicked();
        if (unpicked.length === 0) return;

        var bL = funnelPoints.topBL.x;
        var bR = funnelPoints.topBR.x;
        var bW = bR - bL;
        var centerX = BOARD.W / 2;
        var ballR = BOARD.ballRadius;
        var count = unpicked.length;

        // Clean staging layout: row count based on number of players
        var numRows = count > 14 ? 3 : (count > 7 ? 2 : 1);
        var perRow = Math.ceil(count / numRows);

        unpicked.forEach(function (player, i) {
            var rowIndex = Math.floor(i / perRow);
            var colIndex = i % perRow;
            var inRow = (rowIndex === numRows - 1) ? (count - rowIndex * perRow) : perRow;

            var maxSpacing = ballR * 2.7;
            var availW = bW - 40;
            var spacing = inRow <= 1 ? 0 : Math.min(maxSpacing, availW / (inRow - 1));
            var rowW = (inRow - 1) * spacing;
            var rowStartX = centerX - rowW / 2;

            var x = inRow <= 1 ? centerX : (rowStartX + colIndex * spacing);
            var y = (funnelPoints.topY || 20) + 20 + rowIndex * (ballR * 2.2);

            var ball = Matter.Bodies.circle(x, y, ballR, {
                label: 'ball',
                frictionAir: 0.003,
                density: 0.04,
                restitution: Math.min(0.55, state.settings.bounciness || 0.55),
                friction: 0.02
            });
            ball.playerName = player.name;
            ball.playerInitials = player.initials;
            ball.playerColor = player.color;
            ball.isFaded = false;
            ball.hasFinished = false;

            Matter.Body.setStatic(ball, true);
            addBodies(ball);
            player.body = ball;
        });
    }

    function releaseBalls() {
        var unpicked = getUnpicked();
        if (unpicked.length === 0) return;

        // Reset frame time to eliminate any delta accumulation before drop
        lastFrameTime = performance.now();
        accumulator = 0;

        unpicked.forEach(function (s) {
            if (!s.body) return;
            // Drop directly from exactly where each ball is observed sitting
            Matter.Body.setStatic(s.body, false);
            Matter.Body.setVelocity(s.body, {
                x: (Math.random() - 0.5) * 0.4,
                y: 0.6
            });
        });
        playTick();
    }

    function fadeBallsExcept(winnerBody) {
        state.players.forEach(function (s) {
            if (s.body && s.body !== winnerBody && !s.picked) {
                s.body.isFaded = true;
            }
        });
    }

    function removeAllBalls() {
        state.players.forEach(function (s) {
            if (s.body) { removeBody(s.body); s.body = null; }
        });
        pegPulses.length = 0;
        wallGlowList.length = 0;
        finishGate.hitTime = 0;
        finishGate.hitColor = null;
    }

    function findPlayerByBody(b) {
        return state.players.find(function (p) { return p.body === b; });
    }

    /* ========================================
       8. ANTI-STUCK WATCHDOG
       ======================================== */
    var watchdogTimer = null;

    function startWatchdog() {
        stopWatchdog();
        watchdogTimer = setInterval(function () {
            if (state.phase !== PHASES.DROPPING) return;
            var unpicked = getUnpicked();
            unpicked.forEach(function (s) {
                if (!s.body || s.body.isStatic || s.body.hasFinished) return;
                var vel = s.body.velocity;
                var speed = Math.hypot(vel.x, vel.y);
                if (speed < 0.3) {
                    Matter.Body.setVelocity(s.body, {
                        x: (Math.random() - 0.5) * 4,
                        y: -3
                    });
                }
            });
        }, 1500);
    }

    function stopWatchdog() {
        if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
    }

    /* ========================================
       9. CANVAS RENDERER
       ======================================== */
    var canvas = null;
    var ctx = null;
    var dpr = 1;
    var renderRunning = false;

    function initRenderer(cvs) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        resizeCanvas();
        startRenderLoop();
    }

    function resizeCanvas() {
        if (!canvas) return;
        var frame = canvas.parentElement;
        if (!frame) return;
        var container = frame.parentElement;
        if (!container) return;

        var cs = window.getComputedStyle(container);
        var padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        var padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        var availW = container.clientWidth - padX;
        var availH = container.clientHeight - padY;
        if (availW <= 0 || availH <= 0) return;

        var targetAR = BOARD.W / BOARD.H;
        var frameW, frameH;

        if (availW / availH > targetAR) {
            frameH = availH;
            frameW = Math.round(frameH * targetAR);
        } else {
            frameW = availW;
            frameH = Math.round(frameW / targetAR);
        }

        frame.style.width = frameW + 'px';
        frame.style.height = frameH + 'px';

        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(frameW * dpr);
        canvas.height = Math.round(frameH * dpr);
        canvas.style.width = frameW + 'px';
        canvas.style.height = frameH + 'px';
    }

    function startRenderLoop() {
        if (renderRunning) return;
        renderRunning = true;
        function loop() {
            render();
            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
    }

    function render() {
        if (!ctx || !canvas) return;
        var W = BOARD.W;
        var H = BOARD.H;

        ctx.save();
        var renderScale = (canvas.width / dpr) / W;
        ctx.scale(renderScale * dpr, renderScale * dpr);

        // Canvas background - smooth dark slate that matches the frame
        ctx.fillStyle = '#14232e';
        ctx.fillRect(0, 0, W, H);

        // Subtle radial depth gradient in center
        var bg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.6);
        bg.addColorStop(0, '#192a37');
        bg.addColorStop(1, '#14232e');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // Draw funnel board border — clean white rounded lines matching the pegs and collection cup
        var fp = funnelPoints;
        if (fp && fp.topBL.x !== 0) {
            var cornerR = 12;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 1.6;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            // Complete continuous funnel & collection cup path
            ctx.beginPath();
            ctx.moveTo(fp.exitL.x, fp.rampEndY);
            ctx.lineTo(fp.exitL.x, fp.cupFloorY - cornerR);
            ctx.quadraticCurveTo(fp.exitL.x, fp.cupFloorY, fp.exitL.x + cornerR, fp.cupFloorY);
            ctx.lineTo(fp.exitR.x - cornerR, fp.cupFloorY);
            ctx.quadraticCurveTo(fp.exitR.x, fp.cupFloorY, fp.exitR.x, fp.cupFloorY - cornerR);
            ctx.lineTo(fp.exitR.x, fp.rampEndY);
            ctx.lineTo(fp.botBR.x, fp.botBR.y);
            ctx.lineTo(fp.midBR.x, fp.midBR.y);
            ctx.lineTo(fp.topBR.x, fp.topY + cornerR);
            ctx.quadraticCurveTo(fp.topBR.x, fp.topY, fp.topBR.x - cornerR, fp.topY);
            ctx.lineTo(fp.topBL.x + cornerR, fp.topY);
            ctx.quadraticCurveTo(fp.topBL.x, fp.topY, fp.topBL.x, fp.topY + cornerR);
            ctx.lineTo(fp.midBL.x, fp.midBL.y);
            ctx.lineTo(fp.botBL.x, fp.botBL.y);
            ctx.lineTo(fp.exitL.x, fp.rampEndY);
            ctx.stroke();
        }

        var now = performance.now();

        // Draw clean finish line across exit opening
        if (funnelPoints && funnelPoints.rampEndY && funnelPoints.exitL && funnelPoints.exitR) {
            var x1 = funnelPoints.exitL.x;
            var x2 = funnelPoints.exitR.x;
            var gy = funnelPoints.rampEndY;

            ctx.save();
            ctx.lineCap = 'round';

            if (finishGate.hitColor) {
                // Winner has crossed: glow in winner's ball color and stay that way until new round
                var elapsed = now - finishGate.hitTime;
                var flash = elapsed < 300 ? (1 - elapsed / 300) : 0;
                var glowBlur = 8 + 8 * flash;
                var glowAlpha = 0.35 + 0.35 * flash;

                // Soft glow behind the line
                ctx.beginPath();
                ctx.moveTo(x1, gy);
                ctx.lineTo(x2, gy);
                ctx.strokeStyle = hexToRgba(finishGate.hitColor, glowAlpha);
                ctx.lineWidth = 4 + 2 * flash;
                ctx.stroke();

                // Main winner line with glow
                ctx.beginPath();
                ctx.moveTo(x1, gy);
                ctx.lineTo(x2, gy);
                ctx.strokeStyle = finishGate.hitColor;
                ctx.lineWidth = 1.8;
                ctx.shadowColor = finishGate.hitColor;
                ctx.shadowBlur = glowBlur;
                ctx.stroke();
            } else {
                // Same style as the border before winner is picked
                ctx.beginPath();
                ctx.moveTo(x1, gy);
                ctx.lineTo(x2, gy);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.lineWidth = 1.6;
                ctx.stroke();
            }

            ctx.restore();
        }

        // Draw expanding pulses around hit pegs (Stake-style defined halo disc + rim)
        pegPulses.forEach(function (p) {
            var elapsed = now - p.startTime;
            var t = Math.min(1, elapsed / p.duration);
            var ease = 1 - Math.pow(1 - t, 2.4);
            var rStart = BOARD.pegRadius + 0.5;
            var rEnd = 15.5;
            var currentR = rStart + (rEnd - rStart) * ease;
            var alpha = Math.pow(1 - t, 0.85); // Retains solid presence without washed-out fading

            ctx.save();
            // Luminous halo disc: subtle ball color glow at center, luminous white body, crisp edge
            var grad = ctx.createRadialGradient(p.x, p.y, rStart * 0.4, p.x, p.y, currentR);
            grad.addColorStop(0, hexToRgba(p.color, 0.45 * alpha));
            grad.addColorStop(0.40, hexToRgba(p.color, 0.22 * alpha));
            grad.addColorStop(0.70, 'rgba(255, 255, 255, ' + (0.30 * alpha) + ')');
            grad.addColorStop(0.92, 'rgba(255, 255, 255, ' + (0.42 * alpha) + ')');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, currentR, 0, Math.PI * 2);
            ctx.fill();

            // Defined circular shockwave boundary ring (matches Stake Plinko)
            ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.48 * alpha) + ')';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, currentR, 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();
        });

        // Draw pegs — struck pegs adopt ball color and smoothly transition back to white
        boardPegs.forEach(function (peg) {
            var px = peg.position.x, py = peg.position.y;
            var pr = BOARD.pegRadius;
            var hitElapsed = now - ((peg.pegData && peg.pegData.hitTime) || 0);
            var hitColor = (peg.pegData && peg.pegData.hitColor) ? peg.pegData.hitColor : '#ffffff';
            var colorDuration = 900;

            ctx.save();
            if (hitElapsed < colorDuration) {
                if (hitElapsed < 140) {
                    // Initial impact flash: size pop + vivid ball color
                    var flashT = 1 - (hitElapsed / 140);
                    var dotR = pr * (1 + 0.35 * flashT);
                    ctx.fillStyle = hitColor;
                    ctx.shadowColor = hitColor;
                    ctx.shadowBlur = 6 * flashT;
                    ctx.beginPath(); ctx.arc(px, py, dotR, 0, Math.PI * 2); ctx.fill();
                } else {
                    // Smooth transition from ball color back to resting white
                    var colorT = (hitElapsed - 140) / (colorDuration - 140);
                    var currentColor = lerpColor(hitColor, '#ffffff', colorT);
                    ctx.fillStyle = currentColor;
                    ctx.shadowColor = currentColor;
                    ctx.shadowBlur = 3 * (1 - colorT);
                    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
                }
            } else {
                // Resting white peg
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = 'rgba(255, 255, 255, 0.35)';
                ctx.shadowBlur = 2.5;
                ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        });

        // Draw balls — flat style: colored outline + semi-transparent fill
        var ballR = BOARD.ballRadius;
        state.players.forEach(function (player) {
            if (!player.body) return;
            var ball = player.body;
            var bx = ball.position.x, by = ball.position.y;
            var isWinner = (ball === state.currentWinner);
            var isFaded = ball.isFaded;

            ctx.save();

            if (isFaded) {
                ctx.globalAlpha = 0.2;
            }

            // Winner pulsing glow
            if (isWinner) {
                var pulse = 1.4 + 0.15 * Math.sin(performance.now() / 200);
                var wGlow = ctx.createRadialGradient(bx, by, ballR * 0.5, bx, by, ballR * pulse);
                wGlow.addColorStop(0, player.color);
                wGlow.addColorStop(0.5, 'rgba(0, 231, 1, 0.3)');
                wGlow.addColorStop(1, 'transparent');
                ctx.fillStyle = wGlow;
                ctx.beginPath(); ctx.arc(bx, by, ballR * pulse, 0, Math.PI * 2); ctx.fill();
            }

            // Semi-transparent fill
            ctx.fillStyle = player.color;
            ctx.globalAlpha = isFaded ? 0.1 : 0.25;
            ctx.beginPath(); ctx.arc(bx, by, ballR, 0, Math.PI * 2); ctx.fill();

            // Solid colored outline ring
            ctx.globalAlpha = isFaded ? 0.2 : 1;
            ctx.strokeStyle = player.color;
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(bx, by, ballR, 0, Math.PI * 2); ctx.stroke();

            // Initials text (crisp bold, properly sized)
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = isFaded ? 0.2 : 0.95;
            ctx.font = '800 ' + Math.max(9, Math.round(ballR * 0.95)) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(player.initials, bx, by + 0.5);

            ctx.restore();
        });

        // Effects
        updateEffects();
        drawEffects(ctx);

        ctx.restore();
    }



    /* ========================================
       10. GAME CONTROLLER
       ======================================== */
    var Game = {
        init: function () {
            collisionHandlers.push(this.onCollision);
        },

        onCollision: function (event) {
            if (state.phase !== PHASES.DROPPING) return;
            event.pairs.forEach(function (pair) {
                var a = pair.bodyA, b = pair.bodyB;
                var ball = null, exit = null;
                if (a.label === 'ball' && b.label === 'exit') { ball = a; exit = b; }
                else if (b.label === 'ball' && a.label === 'exit') { ball = b; exit = a; }

                if (ball && exit && !ball.hasFinished) {
                    ball.hasFinished = true;
                    var player = findPlayerByBody(ball);
                    if (player) {
                        playExitHit();
                        triggerFinishGate(ball.playerColor || player.color, ball.position.x);
                        markPicked(player);
                        fadeBallsExcept(ball);
                        playFanfare();
                        stopWatchdog();
                        fireConfetti(ball.position.x, ball.position.y - 15);
                    }
                }
            });
        },

        handleDrop: function () {
            if (state.phase === PHASES.WINNER_FOUND) {
                var unpicked = getUnpicked();
                if (unpicked.length === 0) {
                    setState({ phase: PHASES.COMPLETE, currentWinner: null });
                    return;
                }
                removeAllBalls();
                createBoard();
                createBalls();
                setState({ phase: PHASES.DROPPING, currentWinner: null });
                releaseBalls();
                startWatchdog();
                return;
            }

            if (state.phase === PHASES.READY) {
                setState({ phase: PHASES.DROPPING });
                releaseBalls();
                startWatchdog();
                return;
            }
            if (state.phase !== PHASES.IDLE) return;

            var names = parseClassList();
            if (names.length === 0) {
                showToast('Please enter at least one name');
                return;
            }

            if (state.players.length === 0) {
                initPlayers(names);
            }

            var unpicked = getUnpicked();
            if (unpicked.length === 0) {
                setState({ phase: PHASES.COMPLETE });
                return;
            }

            createBoard();
            createBalls();
            setState({ phase: PHASES.DROPPING });
            releaseBalls();
            startWatchdog();
        },

        handleNext: function () {
            Game.handleDrop();
        },

        handleRedo: function () {
            if (state.phase === PHASES.DROPPING) return;
            stopWatchdog();
            removeAllBalls();
            undoLast();
            createBoard();
            createBalls();
            setState({ phase: PHASES.READY });
        },

        handleReset: function () {
            stopWatchdog();
            confettiList = [];
            sparkList = [];
            wallGlowList = [];
            pegPulses = [];
            finishGate.hitTime = 0;
            finishGate.hitColor = null;
            var names = parseClassList();
            if (names.length > 0) {
                if (state.players.length === 0) {
                    initPlayers(names);
                } else {
                    state.players.forEach(function (p) {
                        p.picked = false;
                        p.body = null;
                    });
                    state.results = [];
                    state.currentWinner = null;
                    state.phase = PHASES.READY;
                }
                removeAllBalls();
                createBoard();
                createBalls();
                notify();
                showToast('Game reset');
            } else {
                removeAllBalls();
                createBoard();
                clearAll();
            }
        }
    };

    /* ========================================
       COOKIE PERSISTENCE HELPERS
       ======================================== */
    var COOKIE_NAME = 'plinko_names';

    function setCookie(name, value, days) {
        try {
            var expires = '';
            if (days) {
                var d = new Date();
                d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
                expires = '; expires=' + d.toUTCString();
            }
            document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/; SameSite=Lax';
        } catch (e) { }
        try {
            if (window.localStorage) localStorage.setItem(name, value);
        } catch (e) { }
    }

    function getCookie(name) {
        try {
            var nameEQ = name + '=';
            var ca = document.cookie.split(';');
            for (var i = 0; i < ca.length; i++) {
                var c = ca[i];
                while (c.charAt(0) === ' ') c = c.substring(1, c.length);
                if (c.indexOf(nameEQ) === 0) {
                    return decodeURIComponent(c.substring(nameEQ.length, c.length));
                }
            }
        } catch (e) { }
        try {
            if (window.localStorage) return localStorage.getItem(name);
        } catch (e) { }
        return null;
    }

    function deleteCookie(name) {
        try {
            document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax';
        } catch (e) { }
        try {
            if (window.localStorage) localStorage.removeItem(name);
        } catch (e) { }
    }

    function saveNamesToCookie(names) {
        if (!names || names.length === 0) {
            deleteCookie(COOKIE_NAME);
        } else {
            setCookie(COOKIE_NAME, JSON.stringify(names), 365);
        }
    }

    function loadNamesFromCookie() {
        var raw = getCookie(COOKIE_NAME);
        if (!raw) return [];
        try {
            var parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.map(function (s) { return String(s).trim(); }).filter(Boolean);
        } catch (e) {
            return raw.split(/[\r\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
        }
        return [];
    }

    /* ========================================
       11. UI BINDINGS
       ======================================== */
    var el = {};

    function initUI() {
        el = {
            classList: document.getElementById('class-list'),
            dropBtn: document.getElementById('drop-btn'),
            redoBtn: document.getElementById('redo-btn'),
            resetBtn: document.getElementById('reset-btn'),
            copyBtn: document.getElementById('copy-btn'),
            resultsList: document.getElementById('results-list'),
            resultsCount: document.getElementById('results-count'),
            playersCount: document.getElementById('players-count'),
            rosterList: document.getElementById('roster-list'),
            winnerBanner: document.getElementById('winner-banner'),
            winnerName: document.getElementById('winner-name'),
            toast: document.getElementById('toast'),
            soundToggleBtn: document.getElementById('sound-toggle-btn'),
            settingsBtn: document.getElementById('settings-btn'),
            settingsModal: document.getElementById('settings-modal'),
            closeSettingsBtn: document.getElementById('close-settings-btn'),
            volumeSlider: document.getElementById('volume-slider'),
            speedSlider: document.getElementById('speed-slider'),
            bouncinessSlider: document.getElementById('bounciness-slider'),
            shuffleBtn: document.getElementById('shuffle-btn'),
            clearListBtn: document.getElementById('clear-list-btn'),
            namesLockBadge: document.getElementById('names-lock-badge'),
            canvas: document.getElementById('plinko-canvas')
        };

        // Button handlers
        el.dropBtn.addEventListener('click', function () { ensureAudio(); Game.handleDrop(); });
        el.redoBtn.addEventListener('click', function () { Game.handleRedo(); });
        el.resetBtn.addEventListener('click', function () { Game.handleReset(); });
        el.copyBtn.addEventListener('click', handleCopy);

        el.shuffleBtn.addEventListener('click', shuffleNames);
        el.clearListBtn.addEventListener('click', clearNames);

        el.soundToggleBtn.addEventListener('click', toggleSound);
        el.settingsBtn.addEventListener('click', function () { openSettings(true); });
        el.closeSettingsBtn.addEventListener('click', function () { openSettings(false); });

        el.volumeSlider.addEventListener('input', function (e) {
            state.settings.volume = parseFloat(e.target.value);
            syncGain();
        });
        el.speedSlider.addEventListener('input', function (e) {
            state.settings.gravityMultiplier = parseFloat(e.target.value);
            setGravityY(BOARD.baseGravity * state.settings.gravityMultiplier);
        });
        el.bouncinessSlider.addEventListener('input', function (e) {
            state.settings.bounciness = parseFloat(e.target.value);
            boardPegs.forEach(function (p) { p.restitution = state.settings.bounciness; });
            boardWalls.forEach(function (w) {
                if (w.label === 'boundary') w.restitution = state.settings.bounciness;
            });
            state.players.forEach(function (s) {
                if (s.body) s.body.restitution = Math.min(0.65, state.settings.bounciness);
            });
        });

        // Click to nudge stuck balls
        el.canvas.addEventListener('click', function (e) {
            if (state.phase !== PHASES.DROPPING) return;
            var rect = el.canvas.getBoundingClientRect();
            var sx = BOARD.W / rect.width;
            var sy = BOARD.H / rect.height;
            var cx = (e.clientX - rect.left) * sx;
            var cy = (e.clientY - rect.top) * sy;
            for (var i = 0; i < state.players.length; i++) {
                var s = state.players[i];
                if (!s.body || s.picked || s.body.isStatic) continue;
                var d = Math.hypot(cx - s.body.position.x, cy - s.body.position.y);
                if (d < BOARD.ballRadius * 2.5) {
                    Matter.Body.setVelocity(s.body, { x: (Math.random() - 0.5) * 4, y: -4 });
                    playTick();
                    return;
                }
            }
        });

        // Robust board scaling on resize and fullscreen transitions
        function handleBoardResize() {
            if (!canvas) return;
            resizeCanvas();
        }

        // ResizeObserver on board container (.canvas-container) for instant response
        if (window.ResizeObserver && el.canvas && el.canvas.parentElement && el.canvas.parentElement.parentElement) {
            var ro = new ResizeObserver(function () {
                handleBoardResize();
            });
            ro.observe(el.canvas.parentElement.parentElement);
        }

        window.addEventListener('resize', handleBoardResize);
        document.addEventListener('fullscreenchange', function () {
            handleBoardResize();
            setTimeout(handleBoardResize, 60);
            setTimeout(handleBoardResize, 200);
        });

        // Live textarea sync
        el.classList.addEventListener('input', syncFromNames);

        subscribe(updateUI);
        createBoard();

        // Restore saved names from cookies
        var savedNames = loadNamesFromCookie();
        if (savedNames.length > 0) {
            el.classList.value = savedNames.join('\n');
            initPlayers(savedNames);
            createBalls();
            setState({ phase: PHASES.READY });
        }
    }

    function syncFromNames() {
        if (state.phase === PHASES.DROPPING || state.phase === PHASES.WINNER_FOUND || state.results.length > 0) return;
        var names = parseClassList();
        saveNamesToCookie(names);
        if (names.length === 0) {
            removeAllBalls();
            createBoard();
            clearAll();
            return;
        }
        initPlayers(names);
        removeAllBalls();
        createBoard();
        createBalls();
        setState({ phase: PHASES.READY });
    }

    function parseClassList() {
        return (el.classList ? el.classList.value : '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    }

    function shuffleNames() {
        if (state.phase === PHASES.DROPPING || state.phase === PHASES.WINNER_FOUND) return;

        var names = parseClassList();
        if (names.length <= 1) return;

        // Ensure players are initialized if not already
        if (state.players.length === 0) {
            initPlayers(names);
        }

        // Shuffle unpicked players without disturbing already-picked winners or results
        var unpicked = state.players.filter(function (p) { return !p.picked; });
        if (unpicked.length <= 1) return;

        for (var i = unpicked.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = unpicked[i];
            unpicked[i] = unpicked[j];
            unpicked[j] = tmp;
        }

        var uIdx = 0;
        for (var k = 0; k < state.players.length; k++) {
            if (!state.players[k].picked) {
                state.players[k] = unpicked[uIdx++];
            }
        }

        // Update textarea and cookies with the current player order
        var orderedNames = state.players.map(function (p) { return p.name; });
        if (el.classList) el.classList.value = orderedNames.join('\n');
        saveNamesToCookie(orderedNames);

        // Update staged balls if in READY phase
        if (state.phase === PHASES.READY) {
            removeAllBalls();
            createBalls();
        }

        notify();
        showToast('Names shuffled!');
    }

    function clearNames() {
        if (state.results.length > 0 || state.phase === PHASES.DROPPING || state.phase === PHASES.WINNER_FOUND) return;
        el.classList.value = '';
        saveNamesToCookie([]);
        Game.handleReset();
        showToast('Names cleared');
    }

    function updateUI(s) {
        // Winner banner
        if (s.phase === PHASES.WINNER_FOUND && s.results.length > 0) {
            var winner = s.results[s.results.length - 1];
            el.winnerName.textContent = winner.name;
            el.winnerBanner.classList.add('visible');
        } else {
            el.winnerBanner.classList.remove('visible');
        }

        // Buttons & Round Lock
        var unpickedCount = s.players.filter(function (st) { return !st.picked; }).length;
        var hasResults = s.results.length > 0;
        var isRoundActive = hasResults || s.phase === PHASES.DROPPING || s.phase === PHASES.WINNER_FOUND;

        if (el.classList) el.classList.readOnly = isRoundActive;
        if (el.namesLockBadge) el.namesLockBadge.style.display = isRoundActive ? 'inline-block' : 'none';

        el.redoBtn.disabled = !hasResults || s.phase === PHASES.DROPPING;
        if (el.shuffleBtn) el.shuffleBtn.disabled = s.phase === PHASES.DROPPING || s.phase === PHASES.WINNER_FOUND || unpickedCount <= 1;
        if (el.clearListBtn) el.clearListBtn.disabled = isRoundActive;

        var dropSpan = el.dropBtn ? el.dropBtn.querySelector('span') : null;
        if (dropSpan && dropSpan.textContent !== 'Drop') {
            dropSpan.textContent = 'Drop';
        }

        switch (s.phase) {
            case PHASES.IDLE:
            case PHASES.READY:
                el.dropBtn.disabled = false;
                break;
            case PHASES.DROPPING:
                el.dropBtn.disabled = true;
                break;
            case PHASES.WINNER_FOUND:
                el.dropBtn.disabled = (unpickedCount === 0);
                break;
            case PHASES.COMPLETE:
                el.dropBtn.disabled = true;
                break;
        }

        // Roster
        updateRoster();

        // Results
        if (el.resultsCount) el.resultsCount.textContent = s.results.length;

        if (s.results.length === 0) {
            el.resultsList.innerHTML = '<li class="no-results">No winners yet</li>';
            el.copyBtn.disabled = true;
        } else {
            el.resultsList.innerHTML = s.results.map(function (r) {
                return '<li class="result-row">' +
                    '<span class="result-pos">#' + r.position + '</span>' +
                    '<span class="result-color" style="background:' + r.color + '">' + esc(r.initials) + '</span>' +
                    '<span class="result-name">' + esc(r.name) + '</span>' +
                    '</li>';
            }).join('');
            el.copyBtn.disabled = false;
        }
    }

    function updateRoster() {
        if (!el.rosterList) return;
        if (state.players.length === 0) {
            el.rosterList.innerHTML = '<div class="no-results">Enter names above</div>';
            if (el.playersCount) el.playersCount.textContent = '0';
            return;
        }
        if (el.playersCount) el.playersCount.textContent = state.players.length;
        el.rosterList.innerHTML = state.players.map(function (s) {
            var cls = 'roster-chip' + (s.picked ? ' picked' : '');
            return '<div class="' + cls + '">' +
                '<span class="roster-color-dot" style="background:' + s.color + '">' + esc(s.initials) + '</span>' +
                '<span class="roster-name">' + esc(s.name) + '</span>' +
                '</div>';
        }).join('');
    }

    function handleCopy() {
        if (state.results.length > 0) {
            var text = state.results.map(function (r) {
                return r.position + '. ' + r.name;
            }).join('\n');
            copyText(text);
        }
    }

    function copyText(str) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(str).then(function () {
                showCopied();
            }).catch(function () {
                fallbackCopy(str);
            });
        } else {
            fallbackCopy(str);
        }
    }

    function fallbackCopy(str) {
        var ta = document.createElement('textarea');
        ta.value = str; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); showCopied(); }
        catch (e) { showToast('Select and copy manually'); }
        document.body.removeChild(ta);
    }

    function showCopied() {
        var orig = el.copyBtn.textContent;
        el.copyBtn.textContent = 'Copied! ✓';
        setTimeout(function () { el.copyBtn.textContent = orig; }, 1600);
    }

    var toastTimer = null;
    function showToast(msg) {
        if (!el.toast) return;
        el.toast.textContent = msg;
        el.toast.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.toast.classList.remove('visible'); }, 2800);
    }

    function toggleSound() {
        ensureAudio();
        state.settings.soundEnabled = !state.settings.soundEnabled;
        syncGain();
        if (el.soundToggleBtn) el.soundToggleBtn.innerHTML = state.settings.soundEnabled ? '🔊' : '🔇';
        showToast(state.settings.soundEnabled ? 'Sound On 🔊' : 'Sound Off 🔇');
    }

    function openSettings(open) {
        el.settingsModal.classList.toggle('visible', open);
    }

    function esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /* ========================================
       12. BOOTSTRAP
       ======================================== */
    function boot() {
        initPhysics();
        var cvs = document.getElementById('plinko-canvas');
        initRenderer(cvs);
        Game.init();
        initUI();

        var unlock = function () { ensureAudio(); };
        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });

        console.log('🎱 Plinko Name Picker Ready!');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
