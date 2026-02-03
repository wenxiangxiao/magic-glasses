# CLAUDE.md - 開發規範

## 專案結構

```
magic-glasses/
├── index.html     # 遊戲主頁（所有前端代碼）
├── server.js      # 多人遊戲 API
├── package.json   # 依賴配置
└── README.md      # 說明文件
```

## 程式碼風格

### JavaScript
- ES6+ 語法
- 縮排：4 空格
- 字串：單引號
- 分號：必須加
- 命名：camelCase（變數/函數）、UPPER_CASE（常數）

### CSS
- 縮排：4 空格
- 類名：kebab-case（如 `game-header`）
- ID：camelCase（如 `practiceDropzone`）

## 顏色系統

### 重要規則
**混合色的 key 必須按字母順序排序！**

```javascript
// 前端產生 key 的方式
const colorKey = [...selectedColors].sort().join('+');

// 所以 COLORS 裡面要這樣寫
'black+blue': '#1A237E',  // ✓ 正確（按字母順序）
'blue+black': '#1A237E',  // ✗ 錯誤
```

### 新增顏色組合
同時更新三個地方：
1. 前端 `COLORS` - 顏色值
2. 前端 `COLOR_NAMES` - 顏色名稱
3. Server `GAME_COLORS` - 多人遊戲用

## 事件處理

### 觸控 + 滑鼠相容
```javascript
let lastTouchTime = 0;

function onTouchStart(e) {
    lastTouchTime = Date.now();
    handleStart(e);
}

function onMouseStart(e) {
    // 防止觸控後又觸發滑鼠事件
    if (Date.now() - lastTouchTime < 500) return;
    handleStart(e);
}
```

### 拖曳閾值
```javascript
const DRAG_THRESHOLD = 10;  // 移動超過 10px 才算拖曳
// 小於閾值 = 點擊（選擇/取消）
// 大於閾值 = 拖曳
```

## 多人遊戲

### 對戰模式
| 模式 | battleMode | 說明 |
|------|------------|------|
| 搶答 | `race` | 先答對的刷新雙方題目 |
| 各自 | `solo` | 互不影響，先答完獲勝 |

### 房間狀態流程
```
waiting → ready → playing → finished
（等待）  （就緒）  （遊戲中）  （結束）
```

### API 端點
- `POST /api/game/create` - 建立房間
- `POST /api/game/join` - 加入房間
- `GET /api/game/room/:code` - 取得狀態
- `POST /api/game/start/:code` - 開始遊戲
- `POST /api/game/answer/:code` - 提交答案

## 注意事項

1. **單人模式** 可純前端運行（不需 server）
2. **多人模式** 需要啟動 server.js
3. **房間資料** 存在記憶體（重啟會清除）
4. **Polling 間隔** 500ms（可調整）
