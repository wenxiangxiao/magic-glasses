const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ==================== 多人遊戲系統 ====================

const gameRooms = new Map();

// 顏色混合配置
const GAME_COLORS = {
    red: '#FF5252', yellow: '#FFD600', blue: '#42A5F5',
    black: '#424242', white: '#FAFAFA',
    'blue+red': '#9C27B0', 'red+yellow': '#FF9800',
    'blue+yellow': '#66BB6A', 'blue+red+yellow': '#8D6E63',
    'black+red': '#B71C1C', 'black+yellow': '#827717', 'black+blue': '#1A237E',
    'red+white': '#FFCDD2', 'white+yellow': '#FFF9C4', 'blue+white': '#BBDEFB',
    'black+white': '#9E9E9E'
};
const GAME_PATTERNS = ['dots', 'stripes', 'grid'];
const GAME_COMBOS = {
    easy: [['red'], ['yellow'], ['blue']],
    medium: [['red', 'blue'], ['red', 'yellow'], ['blue', 'yellow']],
    hard: [['red'], ['yellow'], ['blue'], ['black'], ['white'], ['red', 'blue'], ['red', 'yellow'], ['blue', 'yellow'], ['black', 'red'], ['black', 'blue'], ['red', 'white'], ['blue', 'white'], ['red', 'yellow', 'blue']]
};

function generateRoomCode() {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (gameRooms.has(code));
    return code;
}

function generateChallenge(mode) {
    const combos = GAME_COMBOS[mode] || GAME_COMBOS.medium;
    const combo = combos[Math.floor(Math.random() * combos.length)];
    const colorKey = [...combo].sort().join('+');
    const pattern = GAME_PATTERNS[Math.floor(Math.random() * GAME_PATTERNS.length)];
    return { colorKey, color: GAME_COLORS[colorKey], pattern, startTime: Date.now() };
}

// 清理過期房間（30分鐘）
setInterval(() => {
    const now = Date.now();
    for (const [code, room] of gameRooms) {
        if (now - room.createdAt > 30 * 60 * 1000) {
            gameRooms.delete(code);
        }
    }
}, 60000);

// API: 建立房間
app.post('/api/game/create', (req, res) => {
    const { playerName = '玩家1', mode = 'medium', totalRounds = 10, battleMode = 'race' } = req.body;
    const code = generateRoomCode();
    const playerId = 'p1_' + Date.now();

    gameRooms.set(code, {
        code,
        mode,
        battleMode,
        totalRounds: Math.min(Math.max(totalRounds, 3), 30),
        createdAt: Date.now(),
        players: [{ id: playerId, name: playerName, score: 0, ready: false, answered: false, round: 0, challenge: null }],
        status: 'waiting',
        round: 0,
        challenge: null,
        winner: null
    });

    res.json({ success: true, code, playerId, playerIndex: 0, battleMode });
});

// API: 加入房間
app.post('/api/game/join', (req, res) => {
    const { code, playerName = '玩家2' } = req.body;
    const room = gameRooms.get(code);

    if (!room) return res.status(404).json({ error: '房間不存在' });
    if (room.players.length >= 2) return res.status(400).json({ error: '房間已滿' });

    const playerId = 'p2_' + Date.now();
    room.players.push({ id: playerId, name: playerName, score: 0, ready: false, answered: false, round: 0, challenge: null });
    room.status = 'ready';

    res.json({ success: true, code, playerId, playerIndex: 1, mode: room.mode });
});

// API: 取得房間狀態
app.get('/api/game/room/:code', (req, res) => {
    const room = gameRooms.get(req.params.code);
    if (!room) return res.status(404).json({ error: '房間不存在' });

    const safePlayers = room.players.map(p => ({
        ...p,
        challenge: p.challenge ? {
            colorKey: p.challenge.colorKey,
            color: p.challenge.color,
            pattern: p.challenge.pattern,
            startTime: p.challenge.startTime
        } : null
    }));

    const safeRoom = {
        ...room,
        players: safePlayers,
        challenge: room.challenge ? {
            colorKey: room.challenge.colorKey,
            color: room.challenge.color,
            pattern: room.challenge.pattern,
            startTime: room.challenge.startTime
        } : null
    };

    res.json(safeRoom);
});

// API: 開始遊戲
app.post('/api/game/start/:code', (req, res) => {
    const room = gameRooms.get(req.params.code);
    if (!room) return res.status(404).json({ error: '房間不存在' });
    if (room.players.length < 2) return res.status(400).json({ error: '等待對手加入' });

    room.status = 'playing';
    room.round = 1;
    room.challenge = generateChallenge(room.mode);

    if (room.battleMode === 'solo') {
        room.players.forEach(p => {
            p.answered = false;
            p.ready = false;
            p.round = 1;
            p.challenge = generateChallenge(room.mode);
        });
    } else {
        room.players.forEach(p => { p.answered = false; p.ready = false; });
    }

    res.json({ success: true, challenge: room.challenge, battleMode: room.battleMode });
});

// API: 提交答案
app.post('/api/game/answer/:code', (req, res) => {
    const { playerId, colorKey, pattern } = req.body;
    const room = gameRooms.get(req.params.code);

    if (!room) return res.status(404).json({ error: '房間不存在' });
    if (room.status !== 'playing') return res.status(400).json({ error: '遊戲未開始' });

    const player = room.players.find(p => p.id === playerId);
    if (!player) return res.status(400).json({ error: '玩家不存在' });

    // === 搶答模式 ===
    if (room.battleMode === 'race') {
        if (player.answered) return res.status(400).json({ error: '已經回答過了' });

        const correct = colorKey === room.challenge.colorKey && pattern === room.challenge.pattern;
        const timeUsed = Date.now() - room.challenge.startTime;

        player.answered = true;
        player.lastAnswer = { correct, timeUsed };

        if (correct) {
            const speedBonus = Math.max(0, Math.floor((10000 - timeUsed) / 1000));
            player.score += 10 + speedBonus;

            room.round++;
            room.players.forEach(p => { p.answered = false; p.ready = false; });

            if (room.round > room.totalRounds) {
                room.status = 'finished';
                const winner = room.players.reduce((a, b) => a.score > b.score ? a : b);
                room.winner = winner.name;
            } else {
                room.challenge = generateChallenge(room.mode);
            }
        }

        const allAnswered = room.players.every(p => p.answered);
        if (allAnswered && room.status === 'playing') {
            room.round++;
            room.players.forEach(p => { p.answered = false; p.ready = false; });
            if (room.round > room.totalRounds) {
                room.status = 'finished';
                const winner = room.players.reduce((a, b) => a.score > b.score ? a : b);
                room.winner = winner.name;
            } else {
                room.challenge = generateChallenge(room.mode);
            }
        }

        return res.json({
            success: true, correct, timeUsed, score: player.score,
            allAnswered, roomStatus: room.status, winner: room.winner,
            round: room.round, totalRounds: room.totalRounds
        });
    }

    // === 各自答題模式 ===
    if (room.battleMode === 'solo') {
        const challenge = player.challenge || room.challenge;
        const correct = colorKey === challenge.colorKey && pattern === challenge.pattern;
        const timeUsed = Date.now() - challenge.startTime;

        if (correct) {
            player.score += 10;
            player.round = (player.round || 1) + 1;

            if (player.round > room.totalRounds) {
                room.status = 'finished';
                room.winner = player.name;
                return res.json({
                    success: true, correct, timeUsed, score: player.score,
                    playerRound: player.round, totalRounds: room.totalRounds,
                    roomStatus: room.status, winner: room.winner,
                    newChallenge: null
                });
            } else {
                player.challenge = generateChallenge(room.mode);
            }
        }

        return res.json({
            success: true, correct, timeUsed, score: player.score,
            playerRound: player.round || 1, totalRounds: room.totalRounds,
            roomStatus: room.status, winner: room.winner,
            newChallenge: correct ? player.challenge : null
        });
    }

    res.status(400).json({ error: '未知的對戰模式' });
});

app.listen(PORT, () => {
    console.log(`🕶️ 神奇眼鏡遊戲運行中: http://localhost:${PORT}`);
});
