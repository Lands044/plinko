# Промпт для Claude Code: доведення config-kit до готовності

Цей файл згенеровано інсталятором `config-kit/install.mjs` після встановлення
core kit у цей проєкт. Він призначений для запуску як промпт у Claude Code —
відкрий цей проєкт у Claude Code і попроси виконати інструкції з цього файлу
(наприклад: "Виконай інструкції з MIGRATION_PROMPT.md").

## Контекст

У проєкт щойно встановлено `config-kit` — систему рантайм-конфігурації для
лендінгу-гри, перенесену з chicken-road-example. Ядро (`src/js/config/config.js`,
`assets.js`, `devmenu.js`, `vite-plugins/config-writer.js`) вже на місці й
game-агностичне — воно не потребує змін. `vite.config.js` вже був підключений раніше для роздачі
`public/config.json` та dev-only ендпоінту запису конфігу.

## У цьому проєкті ще немає власної гри

Файли `game-template` скопійовано повністю — тут поки що працює лише
placeholder ("клік → win/lose"). Твоє завдання — замінити цей placeholder на
реальну механіку гри.

### Кроки

1. Уточни в користувача (якщо це ще не описано десь у репозиторії), яка саме
   гра потрібна — жанр/механіка, що вважається кроком/раундом, які параметри
   мають бути редаговані через конфіг (тексти, виплати/множники, тривалості
   анімацій, арт, звук).

2. Прочитай `docs/config.md` (в корені проєкту) і
   `config-kit/game-template/` — це референсна реалізація патерну
   (`game.defaults.js` + `normalize.js` + `render.js` + `devmenu.fields.js` +
   `config.json`), яку треба розширити чи переписати під нову механіку,
   зберігаючи структуру: `core/` (`src/js/config/defaults.js` включно) не
   займаєш, вся механіка — у `src/js/config/{game.defaults,normalize}.js` та
   `src/components/pages/index/{index.js,render.js,devmenu.fields.js}`.

3. Реалізуй саму гру: DOM/CSS у `index.html`/`index.scss`, логіку в класі
   `Game` (`index.js`), відображення конфігу в DOM у `render.js`.

4. Онови `public/config.json` реальними значеннями нової гри.

5. Перевір: `npm run dev`, погратись, переконатись що панель конфігу вгорі
   праворуч редагує гру наживо. `npm run build`, переконатись що
   `dist/config.json` існує; панель за замовчуванням лишається доступною і
   в production-білді (пише зміни в localStorage браузера, не на сервер —
   див. "The config menu" в `docs/config.md`), тож `grep -r devmenu dist/`
   знаходить її код навмисно. Якщо потрібен dev-only варіант — постав умову
   `import.meta.env.DEV && config.dev.menu` в `index.js`.


## Довідка

- `docs/config.md` (в корені проєкту) — повний опис core-частини конфігу і
  розділ "Extending for a new mechanic" з покроковим патерном розширення.
- `config-kit/README.md` — опис структури kit-а й того, що для чого.
- `config-kit/game-template/` — робочий приклад застосування патерну.

Постав уточнюючі питання, якщо щось у наявній грі незрозуміло, а не вгадуй.
