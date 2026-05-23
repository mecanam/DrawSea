// ============================================================
// おえかきすいそう - PC側 (aquarium.js)
// ============================================================

(function () {
    'use strict';

    // --- 設定 ---
    var fishLifetime = 5 * 60 * 1000; // デフォルト5分（ミリ秒）

    // --- 状態 ---
    var peer = null;
    var connections = [];
    var fishes = [];
    var animationId = null;
    var isRunning = false;
    var audioCtx = null;
    var ambientSource = null;
    var mouseTimer = null;
    var menuOpen = false;
    var roomId = '';

    // --- DOM ---
    var lobby = document.getElementById('lobby');
    var aquarium = document.getElementById('aquarium');
    var roomIdEl = document.getElementById('room-id');
    var qrCanvas = document.getElementById('qr-canvas');
    var lifetimeInput = document.getElementById('fish-lifetime');
    var lifetimeValue = document.getElementById('lifetime-value');
    var startBtn = document.getElementById('start-btn');
    var lobbyStatus = document.getElementById('lobby-status');
    var fishCanvas = document.getElementById('fish-canvas');
    var fishCtx = fishCanvas.getContext('2d');
    var menuTrigger = document.getElementById('menu-trigger');
    var menuBtn = document.getElementById('menu-btn');
    var menuPanel = document.getElementById('menu-panel');
    var menuReset = document.getElementById('menu-reset');
    var menuExit = document.getElementById('menu-exit');
    var menuClose = document.getElementById('menu-close');
    var menuLifetime = document.getElementById('menu-lifetime');
    var menuLifetimeValue = document.getElementById('menu-lifetime-value');
    var bubblesLayer = document.getElementById('bubbles-layer');

    // ============================================================
    // ルームID生成
    // ============================================================
    function generateRoomId() {
        var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字除外
        var id = '';
        for (var i = 0; i < 6; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }

    // ============================================================
    // PeerJS セットアップ
    // ============================================================
    function setupPeer() {
        roomId = generateRoomId();
        roomIdEl.textContent = roomId;

        // QRコード生成（タブレットのURLを埋め込み）
        var drawUrl = getDrawUrl();
        try {
            QRCode.toCanvas(qrCanvas, drawUrl, {
                width: 140,
                margin: 1,
                color: { dark: '#0c2d48', light: '#ffffff' }
            }, function (err) {
                if (err) console.error('QR生成エラー:', err);
            });
        } catch (e) {
            console.error('QRライブラリエラー:', e);
        }

        lobbyStatus.textContent = 'せつぞくじゅんびちゅう...';

        peer = new Peer('drawsea-' + roomId);

        peer.on('open', function () {
            lobbyStatus.textContent = 'タブレットからのせつぞくをまっています...';
        });

        peer.on('connection', function (conn) {
            connections.push(conn);
            lobbyStatus.textContent = connections.length + ' 台のタブレットがせつぞくちゅう';

            conn.on('data', function (data) {
                if (data && data.type === 'fish') {
                    addFish(data.image);
                }
            });

            conn.on('close', function () {
                connections = connections.filter(function (c) { return c !== conn; });
                if (connections.length > 0) {
                    lobbyStatus.textContent = connections.length + ' 台のタブレットがせつぞくちゅう';
                } else {
                    lobbyStatus.textContent = 'タブレットからのせつぞくをまっています...';
                }
            });
        });

        peer.on('error', function (err) {
            lobbyStatus.textContent = 'エラー: ' + err.type;
        });
    }

    function getDrawUrl() {
        var loc = window.location;
        var base = loc.protocol + '//' + loc.host + loc.pathname;
        // index.html → draw.html
        base = base.replace(/index\.html$/, '').replace(/\/$/, '');
        return base + '/draw.html?room=' + roomId;
    }

    // ============================================================
    // ロビーUI
    // ============================================================
    lifetimeInput.addEventListener('input', function () {
        lifetimeValue.textContent = lifetimeInput.value;
        fishLifetime = parseInt(lifetimeInput.value) * 60 * 1000;
    });

    startBtn.addEventListener('click', function () {
        startAquarium();
    });

    // ============================================================
    // 水族館起動
    // ============================================================
    function startAquarium() {
        isRunning = true;
        lobby.style.display = 'none';
        aquarium.style.display = 'block';

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // フルスクリーン
        var el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();

        // 泡を生成
        spawnBubbles();

        // 音声開始
        initAudio();

        // メニュー制御
        setupMenu();

        // アニメーション開始
        animate();
    }

    function resizeCanvas() {
        fishCanvas.width = window.innerWidth;
        fishCanvas.height = window.innerHeight;
    }

    // ============================================================
    // メニュー制御
    // ============================================================
    function setupMenu() {
        var hideTimeout;

        document.addEventListener('mousemove', function () {
            if (!isRunning) return;
            aquarium.style.cursor = 'default';
            menuTrigger.classList.add('visible');
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(function () {
                if (!menuOpen) {
                    menuTrigger.classList.remove('visible');
                    aquarium.style.cursor = 'none';
                }
            }, 3000);
        });

        menuBtn.addEventListener('click', function () {
            menuOpen = true;
            menuPanel.classList.add('open');
            menuTrigger.classList.remove('visible');
        });

        menuClose.addEventListener('click', closeMenu);

        menuReset.addEventListener('click', function () {
            fishes = [];
            closeMenu();
        });

        menuExit.addEventListener('click', function () {
            exitAquarium();
        });

        menuLifetime.value = lifetimeInput.value;
        menuLifetimeValue.textContent = lifetimeInput.value;
        menuLifetime.addEventListener('input', function () {
            menuLifetimeValue.textContent = menuLifetime.value;
            fishLifetime = parseInt(menuLifetime.value) * 60 * 1000;
            lifetimeInput.value = menuLifetime.value;
            lifetimeValue.textContent = menuLifetime.value;
        });
    }

    function closeMenu() {
        menuOpen = false;
        menuPanel.classList.remove('open');
    }

    function exitAquarium() {
        isRunning = false;
        closeMenu();
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();

        aquarium.style.display = 'none';
        lobby.style.display = 'flex';
        fishes = [];
        cancelAnimationFrame(animationId);

        // 音声停止
        if (audioCtx) {
            audioCtx.close();
            audioCtx = null;
        }

        // 泡を削除
        bubblesLayer.innerHTML = '';
    }

    // ============================================================
    // 泡エフェクト（CSS）
    // ============================================================
    function spawnBubbles() {
        bubblesLayer.innerHTML = '';
        for (var i = 0; i < 25; i++) {
            var bub = document.createElement('div');
            bub.className = 'bub';
            var size = 4 + Math.random() * 16;
            bub.style.width = size + 'px';
            bub.style.height = size + 'px';
            bub.style.left = Math.random() * 100 + '%';
            bub.style.bottom = '-20px';
            bub.style.animationDuration = (8 + Math.random() * 15) + 's';
            bub.style.animationDelay = Math.random() * 20 + 's';
            bub.style.setProperty('--drift', (Math.random() * 60 - 30) + 'px');
            bubblesLayer.appendChild(bub);
        }
    }

    // ============================================================
    // 音声（Web Audio API）
    // ============================================================
    function initAudio() {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // --- 環境音（海の中のゴォーという低音 + 泡のぷくぷく） ---
        startAmbient();

        // 泡の音を定期的に鳴らす
        scheduleBubbleSound();
    }

    function startAmbient() {
        // ブラウンノイズ（海の環境音）
        var bufferSize = 2 * audioCtx.sampleRate;
        var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        var data = buffer.getChannelData(0);
        var lastOut = 0;
        for (var i = 0; i < bufferSize; i++) {
            var white = Math.random() * 2 - 1;
            data[i] = (lastOut + 0.02 * white) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5;
        }

        ambientSource = audioCtx.createBufferSource();
        ambientSource.buffer = buffer;
        ambientSource.loop = true;

        var filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;

        var gain = audioCtx.createGain();
        gain.gain.value = 0.15;

        ambientSource.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        ambientSource.start(0);
    }

    function scheduleBubbleSound() {
        if (!audioCtx || !isRunning) return;
        playBubble();
        var next = 3000 + Math.random() * 8000;
        setTimeout(function () { scheduleBubbleSound(); }, next);
    }

    function playBubble() {
        if (!audioCtx) return;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.value = 300 + Math.random() * 600;

        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.06, audioCtx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.2);
    }

    function playSplash() {
        if (!audioCtx) return;
        // ノイズバースト（スプラッシュ音）
        var bufferSize = audioCtx.sampleRate * 0.3;
        var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
        }

        var source = audioCtx.createBufferSource();
        source.buffer = buffer;

        var filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800;
        filter.Q.value = 0.5;

        var gain = audioCtx.createGain();
        gain.gain.value = 0.25;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        source.start(0);
    }

    // ============================================================
    // 魚クラス
    // ============================================================
    function Fish(imageSrc) {
        var self = this;
        self.img = new Image();
        self.loaded = false;
        self.img.onload = function () {
            self.loaded = true;
            self.w = self.img.naturalWidth;
            self.h = self.img.naturalHeight;
        };
        self.img.src = imageSrc;

        var W = window.innerWidth;
        var H = window.innerHeight;
        var safeBottom = H * 0.78; // 海底より上

        // 初期位置（画面外からの登場もあり）
        self.x = Math.random() * W;
        self.y = Math.random() * safeBottom * 0.8 + safeBottom * 0.05;
        self.w = 100; // 仮（画像ロード後に更新）
        self.h = 80;

        // 移動パス
        self.speed = 0.5 + Math.random() * 1.5;
        self.targetSpeed = self.speed;
        self.direction = Math.random() > 0.5 ? 1 : -1; // 1=右, -1=左

        // ベジェパス
        self.path = null;
        self.pathT = 0;
        self.generatePath();

        // 速度変化タイマー
        self.speedChangeTimer = 2000 + Math.random() * 5000;

        // 寿命
        self.createdAt = Date.now();
        self.opacity = 0; // フェードイン
        self.alive = true;

        // ゆらゆら（体の上下揺れ）
        self.wobblePhase = Math.random() * Math.PI * 2;
    }

    Fish.prototype.generatePath = function () {
        var W = window.innerWidth;
        var H = window.innerHeight;
        var safeBottom = H * 0.75;
        var margin = 80;

        // 現在位置から目標地点まで、制御点を含むベジェ曲線
        var targetX, targetY;

        // 方向に基づいてターゲットを決める（大きく移動）
        targetX = this.x + this.direction * (200 + Math.random() * 400);
        targetY = Math.random() * safeBottom * 0.85 + margin;

        // 画面端に近づいたら反転
        if (targetX < -100) { targetX = 200; this.direction = 1; }
        if (targetX > W + 100) { targetX = W - 200; this.direction = -1; }
        if (targetY < margin) targetY = margin;
        if (targetY > safeBottom) targetY = safeBottom;

        // 制御点（自然なカーブを作る）
        var cpX = (this.x + targetX) / 2 + (Math.random() - 0.5) * 200;
        var cpY = (this.y + targetY) / 2 + (Math.random() - 0.5) * 150;

        this.path = {
            sx: this.x, sy: this.y,
            cpx: cpX, cpy: cpY,
            ex: targetX, ey: targetY,
        };
        this.pathT = 0;
    };

    Fish.prototype.update = function (dt) {
        if (!this.alive) return;

        var age = Date.now() - this.createdAt;

        // フェードイン（最初の1秒）
        if (age < 1000) {
            this.opacity = age / 1000;
        } else if (age > fishLifetime - 2000) {
            // フェードアウト（最後の2秒）
            this.opacity = Math.max(0, (fishLifetime - age) / 2000);
            if (this.opacity <= 0) { this.alive = false; return; }
        } else {
            this.opacity = 1;
        }

        // 速度を目標に向けて補間
        this.speed += (this.targetSpeed - this.speed) * 0.02;

        // 速度変化
        this.speedChangeTimer -= dt;
        if (this.speedChangeTimer <= 0) {
            this.targetSpeed = 0.3 + Math.random() * 2.0;
            this.speedChangeTimer = 2000 + Math.random() * 6000;
        }

        // パスに沿って移動
        var pathSpeed = this.speed * dt / 3000;
        this.pathT += pathSpeed;

        if (this.pathT >= 1) {
            // 次のパスを生成
            this.x = this.path.ex;
            this.y = this.path.ey;

            // ランダムに方向転換
            if (Math.random() < 0.3) {
                this.direction *= -1;
            }
            // 画面端チェック
            var W = window.innerWidth;
            if (this.x < 100) this.direction = 1;
            if (this.x > W - 100) this.direction = -1;

            this.generatePath();
            return;
        }

        // ベジェ曲線上の位置を計算
        var t = this.pathT;
        var mt = 1 - t;
        this.x = mt * mt * this.path.sx + 2 * mt * t * this.path.cpx + t * t * this.path.ex;
        this.y = mt * mt * this.path.sy + 2 * mt * t * this.path.cpy + t * t * this.path.ey;

        // 進行方向を計算して向きを更新
        var dx = 2 * (t) * (this.path.ex - this.path.cpx) + 2 * (1 - t) * (this.path.cpx - this.path.sx);
        if (Math.abs(dx) > 0.1) {
            this.direction = dx > 0 ? 1 : -1;
        }

        // ゆらゆら
        this.wobblePhase += dt * 0.003;
    };

    Fish.prototype.draw = function (ctx) {
        if (!this.loaded || !this.alive) return;

        var wobbleY = Math.sin(this.wobblePhase) * 4;
        var wobbleAngle = Math.sin(this.wobblePhase * 0.7) * 0.05;

        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y + wobbleY);
        ctx.rotate(wobbleAngle);

        // 進行方向に合わせて反転
        if (this.direction === -1) {
            ctx.scale(-1, 1);
        }

        ctx.drawImage(this.img, -this.w / 2, -this.h / 2, this.w, this.h);
        ctx.restore();
    };

    // ============================================================
    // 魚の追加
    // ============================================================
    function addFish(imageSrc) {
        var fish = new Fish(imageSrc);
        fishes.push(fish);

        // 登場エフェクト
        playSplash();
        showSplashEffect(fish.x, fish.y);
    }

    function showSplashEffect(x, y) {
        var el = document.createElement('div');
        el.className = 'fish-splash';
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        aquarium.appendChild(el);
        setTimeout(function () { el.remove(); }, 800);
    }

    // ============================================================
    // アニメーションループ
    // ============================================================
    var lastTime = 0;

    function animate(timestamp) {
        if (!isRunning) return;
        animationId = requestAnimationFrame(animate);

        if (!timestamp) timestamp = performance.now();
        var dt = lastTime ? Math.min(timestamp - lastTime, 50) : 16;
        lastTime = timestamp;

        // キャンバスクリア
        fishCtx.clearRect(0, 0, fishCanvas.width, fishCanvas.height);

        // 魚の更新と描画
        for (var i = fishes.length - 1; i >= 0; i--) {
            fishes[i].update(dt);
            if (!fishes[i].alive) {
                fishes.splice(i, 1);
            } else {
                fishes[i].draw(fishCtx);
            }
        }
    }

    // ============================================================
    // 初期化
    // ============================================================
    setupPeer();

})();
