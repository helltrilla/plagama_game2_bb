# 01 — Архитектура

## Стек (зафиксирован)
| Задача | Выбор |
|---|---|
| Язык | TypeScript (`strict: true`) |
| Сборка | Vite, `base: './'` (Playgama грузит из подпапки) |
| 3D | Three.js |
| Физика | `@dimforge/rapier3d-compat` (wasm встроен как base64 — нет отдельных .wasm путей) |
| UI | HTML/CSS оверлей, без React |
| Платформа | Playgama Bridge (`https://bridge.playgama.com/v2/stable/playgama-bridge.js`) |
| Звук | WebAudio, процедурные звуки или маленькие .ogg/.mp3 |
| Модели | Процедурные примитивы (капсулы/боксы) |

Не добавляй зависимости без необходимости. Цель размера билда: **< 10 МБ** (идеально < 5).

## Структура проекта
```
gravity-bones/
├─ AGENTS.md
├─ docs/
├─ index.html                  # Bridge в <head> ПЕРЕД игровым кодом
├─ vite.config.ts
├─ package.json
├─ public/
│  └─ playgama-bridge-config.json   # попадает в корень билда рядом с index.html
└─ src/
   ├─ main.ts                  # bridge.initialize → load save → init game
   ├─ config.ts                # ВЕСЬ баланс: G, пороги, цены, множители
   ├─ core/
   │  ├─ Game.ts               # главный цикл, состояния Menu/Playing/Result/Shop
   │  ├─ Time.ts               # fixed timestep 1/60 + интерполяция рендера
   │  ├─ Input.ts              # клавиатура + touch (+ gamepad опц.)
   │  └─ EventBus.ts           # gravityChanged, boneBroken, roundEnded...
   ├─ physics/
   │  ├─ World.ts              # Rapier world, смена гравитации
   │  ├─ Ragdoll.ts            # тела, суставы, кости
   │  └─ ImpactSystem.ts       # контакты → урон
   ├─ render/
   │  ├─ Scene.ts              # свет, тени, туман
   │  ├─ CameraRig.ts          # следящая камера, плавный поворот up
   │  └─ Effects.ts            # частицы, screen shake, floating text
   ├─ gameplay/
   │  ├─ Levels.ts             # уровни как данные + загрузчик
   │  ├─ Scoring.ts
   │  ├─ Upgrades.ts
   │  └─ GravityController.ts
   ├─ platform/
   │  ├─ PlaygamaService.ts    # ВСЯ работа с Bridge только здесь (+ mock)
   │  └─ SaveService.ts        # прогресс через bridge.storage
   ├─ ui/                      # HUD, меню, магазин, результаты
   └─ i18n/                    # ru, en
```

## Правила кода
- Баланс только в `src/config.ts`, без магических чисел.
- Системы общаются через `EventBus`, без жёстких перекрёстных зависимостей.
- Платформенный код только в `src/platform/`.
- Без `any` без причины. Без аллокаций `Vector3/Quaternion` в горячем цикле.
- Комментарии короткие, по делу; существующие комментарии, не относящиеся к твоим правкам, не удалять.
- Не использовать ассеты с неясной лицензией.
- Скрипты `package.json`: `dev`, `build`, `preview`, `pack` (zip из `dist/`).
