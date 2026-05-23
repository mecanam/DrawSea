// ============================================================
// おえかきすいそう - タブレット側 (draw.js)
// ============================================================

(function () {
    'use strict';

    // --- 定数 ---
    const CANVAS_W = 800;
    const CANVAS_H = 600;
    const COLORS = [
        '#000000', '#6B3A2A', '#D63031', '#E17055',
        '#FDCB6E', '#00B894', '#00CEC9', '#0984E3',
        '#6C5CE7', '#E84393', '#FD79A8', '#FAB1A0',
        '#FFFFFF',
    ];
    const DEFAULT_COLOR = '#000000';
    const DEFAULT_SIZE = 10;

    // --- 状態 ---
    let peer = null;
    let conn = null;
    let currentTool = 'pen';      // 'pen' | 'eraser'
    let currentColor = DEFAULT_COLOR;
    let currentSize = DEFAULT_SIZE;
    let isDrawing = false;
    let points = [];              // 現在のストロークの座標列
    let undoStack = [];           // ImageData の履歴
    const MAX_UNDO = 30;
    let hasDrawn = false;         // 何か描いたか
    let fishDirection = 'right';  // 魚の向き 'right' | 'left'

    // --- DOM ---
    const connectScreen = document.getElementById('connect-screen');
    const drawScreen = document.getElementById('draw-screen');
    const sentScreen = document.getElementById('sent-screen');
    const roomInput = document.getElementById('room-id-input');
    const connectBtn = document.getElementById('connect-btn');
    const connectStatus = document.getElementById('connect-status');
    const canvas = document.getElementById('draw-canvas');
    const ctx = canvas.getContext('2d');
    const sendBtn = document.getElementById('send-btn');
    const undoBtn = document.getElementById('undo-btn');
    const clearBtn = document.getElementById('clear-btn');
    const paletteEl = document.getElementById('color-palette');
    const sentFishImg = document.getElementById('sent-fish-img');
    const drawAgainBtn = document.getElementById('draw-again-btn');

    // ============================================================
    // 初期化
    // ============================================================
    function init() {
        setupCanvas();
        buildPalette();
        bindToolbar();
        bindDirectionSelector();
        bindCanvasEvents();
        bindSendButton();
        bindDrawAgain();
        checkURLParams();
    }

    // --- キャンバス初期化 ---
    function setupCanvas() {
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;
        fitCanvasDisplay();
        window.addEventListener('resize', fitCanvasDisplay);
        saveUndoState();
    }

    function fitCanvasDisplay() {
        const wrapper = canvas.parentElement;
        const wrapW = wrapper.clientWidth;
        const wrapH = wrapper.clientHeight;
        const scale = Math.min(wrapW / CANVAS_W, wrapH / CANVAS_H);
        canvas.style.width = Math.floor(CANVAS_W * scale) + 'px';
        canvas.style.height = Math.floor(CANVAS_H * scale) + 'px';
    }

    // ============================================================
    // カラーパレット
    // ============================================================
    function buildPalette() {
        COLORS.forEach(function (color) {
            const btn = document.createElement('button');
            btn.className = 'color-swatch' + (color === currentColor ? ' active' : '');
            btn.dataset.color = color;
            btn.style.background = color;
            btn.setAttribute('aria-label', color);
            btn.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                selectColor(color);
            });
            paletteEl.appendChild(btn);
        });
    }

    function selectColor(color) {
        currentColor = color;
        // ペンに切り替え（消しゴム使用中に色選択したらペンに戻す）
        if (currentTool === 'eraser') {
            selectTool('pen');
        }
        paletteEl.querySelectorAll('.color-swatch').forEach(function (el) {
            el.classList.toggle('active', el.dataset.color === color);
        });
    }

    // ============================================================
    // ツールバー
    // ============================================================
    function bindToolbar() {
        // ツール（ペン・消しゴム）
        document.querySelectorAll('.tool-btn').forEach(function (btn) {
            btn.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                selectTool(btn.dataset.tool);
            });
        });
        // サイズ
        document.querySelectorAll('.size-btn').forEach(function (btn) {
            btn.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                selectSize(parseInt(btn.dataset.size, 10));
            });
        });
        // 元に戻す
        undoBtn.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            undo();
        });
        // 全消去
        clearBtn.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            clearCanvas();
        });
    }

    function selectTool(tool) {
        currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
        canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
    }

    function selectSize(size) {
        currentSize = size;
        document.querySelectorAll('.size-btn').forEach(function (btn) {
            btn.classList.toggle('active', parseInt(btn.dataset.size, 10) === size);
        });
    }

    // ============================================================
    // 魚の向き選択
    // ============================================================
    function bindDirectionSelector() {
        document.querySelectorAll('.direction-btn').forEach(function (btn) {
            btn.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                fishDirection = btn.dataset.dir;
                document.querySelectorAll('.direction-btn').forEach(function (b) {
                    b.classList.toggle('active', b.dataset.dir === fishDirection);
                });
            });
        });
    }

    // ============================================================
    // Undo / Clear
    // ============================================================
    function saveUndoState() {
        undoStack.push(ctx.getImageData(0, 0, CANVAS_W, CANVAS_H));
        if (undoStack.length > MAX_UNDO) undoStack.shift();
    }

    function undo() {
        if (undoStack.length <= 1) return;
        undoStack.pop();
        ctx.putImageData(undoStack[undoStack.length - 1], 0, 0);
        checkHasDrawn();
    }

    function clearCanvas() {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        saveUndoState();
        hasDrawn = false;
        sendBtn.disabled = true;
    }

    function checkHasDrawn() {
        // キャンバスに何かあるか簡易チェック
        const data = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
        hasDrawn = false;
        for (let i = 3; i < data.length; i += 16) {
            if (data[i] > 0) { hasDrawn = true; break; }
        }
        sendBtn.disabled = !hasDrawn;
    }

    // ============================================================
    // キャンバス描画
    // ============================================================
    function bindCanvasEvents() {
        // Pointer Events でタッチ・マウス両対応
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointerleave', onPointerUp);
        // タッチ操作でスクロール防止
        canvas.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    }

    function getCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (CANVAS_W / rect.width),
            y: (e.clientY - rect.top) * (CANVAS_H / rect.height),
        };
    }

    function onPointerDown(e) {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        isDrawing = true;
        points = [getCanvasPos(e)];
        drawDot(points[0]);
    }

    function onPointerMove(e) {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getCanvasPos(e);
        points.push(pos);
        drawSmooth();
    }

    function onPointerUp(e) {
        if (!isDrawing) return;
        isDrawing = false;
        points = [];
        saveUndoState();
        hasDrawn = true;
        sendBtn.disabled = false;
    }

    // 点を打つ（ストローク開始時）
    function drawDot(pos) {
        ctx.save();
        setupBrush();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, currentSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 滑らかな線を描く（二次ベジェ曲線でつなぐ）
    function drawSmooth() {
        if (points.length < 2) return;
        ctx.save();
        setupBrush();
        ctx.beginPath();

        const p0 = points[points.length - 2];
        const p1 = points[points.length - 1];

        if (points.length === 2) {
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
        } else {
            const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
            const prevMid = {
                x: (points[points.length - 3].x + p0.x) / 2,
                y: (points[points.length - 3].y + p0.y) / 2,
            };
            ctx.moveTo(prevMid.x, prevMid.y);
            ctx.quadraticCurveTo(p0.x, p0.y, mid.x, mid.y);
        }
        ctx.stroke();
        ctx.restore();
    }

    function setupBrush() {
        if (currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.fillStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = currentColor;
            ctx.fillStyle = currentColor;
        }
        ctx.lineWidth = currentSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }

    // ============================================================
    // 画像処理：トリミング（余白を除去）
    // ============================================================
    function trimCanvas() {
        const imageData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
        const data = imageData.data;
        let top = CANVAS_H, bottom = 0, left = CANVAS_W, right = 0;
        for (let y = 0; y < CANVAS_H; y++) {
            for (let x = 0; x < CANVAS_W; x++) {
                const alpha = data[(y * CANVAS_W + x) * 4 + 3];
                if (alpha > 0) {
                    if (y < top) top = y;
                    if (y > bottom) bottom = y;
                    if (x < left) left = x;
                    if (x > right) right = x;
                }
            }
        }
        if (top > bottom || left > right) return null; // 何も描かれていない

        const padding = 10;
        top = Math.max(0, top - padding);
        bottom = Math.min(CANVAS_H - 1, bottom + padding);
        left = Math.max(0, left - padding);
        right = Math.min(CANVAS_W - 1, right + padding);

        const w = right - left + 1;
        const h = bottom - top + 1;
        const trimmed = document.createElement('canvas');
        trimmed.width = w;
        trimmed.height = h;
        trimmed.getContext('2d').drawImage(canvas, left, top, w, h, 0, 0, w, h);
        return trimmed.toDataURL('image/png');
    }

    // ============================================================
    // 送信
    // ============================================================
    function bindSendButton() {
        sendBtn.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            if (sendBtn.disabled) return;
            sendFish();
        });
    }

    function sendFish() {
        const fishData = trimCanvas();
        if (!fishData) return;

        // PeerJS で送信（向き情報付き）
        if (conn && conn.open) {
            conn.send({ type: 'fish', image: fishData, direction: fishDirection });
        }

        // 送信完了画面
        sentFishImg.src = fishData;
        drawScreen.style.display = 'none';
        sentScreen.style.display = 'block';
    }

    // ============================================================
    // 送信後 → 再描画
    // ============================================================
    function bindDrawAgain() {
        drawAgainBtn.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            returnToCanvas();
        });
    }

    function returnToCanvas() {
        sentScreen.style.display = 'none';
        drawScreen.style.display = 'flex';
        // キャンバスリセット
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        undoStack = [];
        saveUndoState();
        hasDrawn = false;
        sendBtn.disabled = true;
        fitCanvasDisplay();
    }

    // ============================================================
    // PeerJS 接続
    // ============================================================
    function checkURLParams() {
        const params = new URLSearchParams(window.location.search);
        const roomId = params.get('room');
        if (roomId) {
            roomInput.value = roomId;
            connectToPeer(roomId);
        }
    }

    connectBtn.addEventListener('click', function () {
        const roomId = roomInput.value.trim();
        if (!roomId) {
            connectStatus.textContent = 'ルームIDをいれてね';
            return;
        }
        connectToPeer(roomId);
    });

    roomInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') connectBtn.click();
    });

    function connectToPeer(roomId) {
        connectStatus.textContent = 'せつぞくちゅう...';
        connectBtn.disabled = true;

        peer = new Peer();

        peer.on('open', function () {
            conn = peer.connect('drawsea-' + roomId, { reliable: true });

            conn.on('open', function () {
                connectStatus.textContent = '';
                connectScreen.style.display = 'none';
                drawScreen.style.display = 'flex';
                fitCanvasDisplay();
            });

            conn.on('close', function () {
                showDisconnected();
            });

            conn.on('error', function () {
                connectStatus.textContent = 'せつぞくできませんでした';
                connectBtn.disabled = false;
            });
        });

        peer.on('error', function (err) {
            connectStatus.textContent = 'エラー: ' + err.type;
            connectBtn.disabled = false;
        });

        // タイムアウト
        setTimeout(function () {
            if (!conn || !conn.open) {
                connectStatus.textContent = 'せつぞくできませんでした。ルームIDをかくにんしてね。';
                connectBtn.disabled = false;
                if (peer) peer.destroy();
            }
        }, 10000);
    }

    function showDisconnected() {
        sentScreen.style.display = 'none';
        drawScreen.style.display = 'none';
        connectScreen.style.display = 'flex';
        connectStatus.textContent = 'せつぞくがきれました。もういちどつなげてね。';
        connectBtn.disabled = false;
    }

    // ============================================================
    // 起動
    // ============================================================
    init();
})();
