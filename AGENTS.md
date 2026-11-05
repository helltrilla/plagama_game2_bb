# AGENTS.md — «Gravity Bones»

HTML5 3D-игра для **Playgama** в жанре ragdoll-разрушения (по духу как Roblox «Broken Bones IV»).
Стантмен падает и летит, ломает кости, получает деньги за урон, покупает апгрейды.
**Главная фишка:** игрок во время полёта меняет направление гравитации (вниз/вверх/влево/вправо/вперёд/назад).

## Как работать с этим ТЗ
ТЗ разбито на файлы в `docs/`. **Читай только нужный файл под текущую фазу**, но `00` и `06` — всегда.

| Файл | Содержание | Когда читать |
|---|---|---|
| [docs/00-overview.md](docs/00-overview.md) | Идея, core loop, фишка, стиль | Всегда, в начале |
| [docs/01-architecture.md](docs/01-architecture.md) | Стек, структура папок, правила кода | Фаза 0 и при новых модулях |
| [docs/02-physics-ragdoll.md](docs/02-physics-ragdoll.md) | Ragdoll, суставы, кости, урон, гравитация, камера | Фазы 1–3 |
| [docs/03-gameplay-content.md](docs/03-gameplay-content.md) | Уровни, комбо, экономика, апгрейды, UI | Фазы 3–4 |
| [docs/04-playgama.md](docs/04-playgama.md) | Интеграция Playgama Bridge, реклама, сохранения, упаковка | Фазы 0, 4, 5, 6 |
| [docs/05-performance-visuals.md](docs/05-performance-visuals.md) | FPS, мобилки, визуал, game feel | Фазы 5–6 |
| [docs/06-roadmap-checklist.md](docs/06-roadmap-checklist.md) | Фазы 0–6 и релиз-чеклист | Всегда |

## Жёсткие правила (кратко)
1. Стек: TypeScript strict, Vite (`base: './'`), Three.js, `@dimforge/rapier3d-compat`. Ассеты — процедурные примитивы.
2. Платформенный код (Bridge) — **только** в `src/platform/`, с mock для локальной разработки.
3. Сохранения — только `bridge.storage`, никакого `localStorage`.
4. Баланс — только в `src/config.ts`, без магических чисел.
5. Ничего из Roblox/Broken Bones IV (название, ассеты, логотипы) не использовать.
6. Работать по фазам; после каждой — `npm run build` без ошибок + короткий отчёт.
7. Неясные мелочи решай сам и записывай в `docs/DECISIONS.md`, не останавливайся с вопросами.
