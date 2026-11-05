# 04 — Интеграция Playgama Bridge

> Перед реализацией **открой актуальную документацию Playgama Bridge** и сверь API. Ниже — ожидаемое использование.

## Подключение
1. `index.html`, в `<head>` до игровых скриптов:
   ```html
   <script src="https://bridge.playgama.com/v2/stable/playgama-bridge.js"></script>
   ```
2. `playgama-bridge-config.json` рядом с `index.html` (в Vite — в `public/`).

## Запуск
```ts
await bridge.initialize();
const data = await bridge.storage.get(['save']);   // читать одним вызовом
// создаём игру, грузим ассеты...
bridge.platform.sendMessage('game_ready');          // когда игра интерактивна
```

## Правила
- **Сохранения** только через `bridge.storage.get/set`. Не использовать `localStorage/sessionStorage/IndexedDB`. Писать по значимым событиям (конец раунда, покупка), не каждый кадр.
- **Реклама** — только через `PlaygamaService`, не напрямую из геймплея:
  - Interstitial — между раундами, не чаще раза в ~60–90 с, не в начале сессии.
  - Rewarded — только по явному нажатию (×2 Cash, доп. flip, бонус).
  - На время рекламы: пауза физики и mute; после — вернуть.
  - Отказ/ошибка рекламы: игра продолжается без награды.
- **Пауза/mute** при сворачивании вкладки: подписка на visibility-состояние Bridge (fallback — `document.visibilitychange`).
- **Язык** из Bridge (`bridge.platform.language`), иначе `navigator.language`. Поддержать ru + en.
- Все вызовы SDK в `try/catch`. Если Bridge недоступен (локально) — **mock** в `PlaygamaService`, чтобы `npm run dev` работал.
- Без `alert/confirm/prompt`, без `window.open`, без внешних ссылок и сторонних запросов (кроме Bridge).

## Упаковка
- `npm run build` → `dist/` → zip, где **`index.html` в корне архива**; пути относительные.
- `npm run pack` создаёт `gravity-bones.zip` из `dist/`.
