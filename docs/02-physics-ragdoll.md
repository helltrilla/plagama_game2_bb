# 02 — Физика, ragdoll, урон, гравитация

## Ragdoll
- 11 тел: head, torso, pelvis, upperArm L/R, lowerArm L/R, upperLeg L/R, lowerLeg L/R (можно 15 с кистями/стопами).
- Формы — капсулы/боксы; визуальные меши — те же примитивы.
- Суставы Rapier: spherical (плечи, бёдра, шея), revolute с лимитами (локти, колени).
- Collision groups: части одного ragdoll не сталкиваются между собой (минимум — соседние не сталкиваются), со средой — да.
- Стабильность (обязательно): CCD для тяжёлых частей, linear damping ≈ 0.05, angular damping ≈ 0.5, solver iterations ≥ 8, fixed timestep 1/60.
- Масса настраивается апгрейдом («Heavy» = больше урона, но инертнее к смене гравитации).

## Кости и урон
Кости (~10–14): skull, spine, ribs, L/R humerus, L/R forearm, L/R femur, L/R tibia. У каждой есть `health` и `fragility`.

На каждый контакт:
```
impact = relativeNormalVelocity * effectiveMass
if impact < MIN_IMPACT: ignore
damage = (impact - MIN_IMPACT) * boneFragility * surfaceMultiplier * comboMultiplier
```
- Накопленный урон кости > порога → **перелом**: звук хруста, красная вспышка, floating text `-1 Femur!`, кость помечена сломанной (tint, чуть больше свободы сустава).
- Все удары за раунд суммируются в **Total Damage** (Cash = урон × множитель апгрейда).
- Анти-фарм: контакт с одной поверхностью чаще, чем раз в 0.15 с, не считается; скольжение/качение (малая нормальная скорость) урона не даёт.
- Использовать contact force events с порогом, чтобы не было дребезга.

## Гравитация
```ts
type GravityDir = 'down'|'up'|'left'|'right'|'forward'|'back';
world.gravity = dirVector[dir] * G   // G по умолчанию ~25 (тяжелее реальной для «веса»)
```
- Смена плавная: lerp вектора за ~0.15 с, без рывка.
- Ввод относительно **камеры**, а не мира. Десктоп: WASD/QE/стрелки. Мобилка: экранные стрелки + свайп.
- Cooldown + заряды (апгрейды «Quick Flip», «Extra Charges»).
- Событие `gravityChanged` → звук, частицы, лёгкий screen shake.

## Камера
- Следит за ragdoll (torso), плавное сглаживание.
- После смены гравитации плавно доворачивает up-вектор (slerp), чтобы игрок понимал, где «низ».
- Настройка «не вращать камеру» (против укачивания).
- Защита от прохода камеры сквозь стены (raycast/приближение).
