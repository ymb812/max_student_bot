# Постоянное развёртывание

23.10.2026: после выкладки коллегой по сообщению пользователя выполнена [проверка публичной версии](DEPLOYED_VERIFICATION_2026_10_23.md). HTML и 8 подключённых assets побайтно соответствуют `2f9e4be`; demo + prototype_timing включены, health/polling исправны. A01–A03 и 6 групп браузерных сценариев прошли; 47 своих тестовых профилей удалены. Полный SHA runtime и реальный MAX/устройства/доставка не проверены. Развёртывание и изменение сервера в рамках этой проверки не выполнялись. Ниже — история прежних выкладок.

21.10.2026: адаптивный маршрут опубликован по запросу пользователя на https://max.market-kit.ru. Релиз `adaptive-20261021T143027Z`; app healthy, HTTPS/API и браузерные проверки прошли. Подробности и откат — в последнем разделе. Настоящий MAX mobile/web этой версии отдельно не проверялся.

Обновлено 21.10.2026. Рабочая директория проекта на сервере — `/opt/max`.

- Приложение: https://max.market-kit.ru
- Админка: https://max.market-kit.ru/admin
- Swagger: https://max.market-kit.ru/docs
- Бот: https://max.ru/t647_hakaton_max_bot
- Host port приложения: `127.0.0.1:8097`, только loopback.
- Compose project: `max-students`; app: `max-students-app-1`.
- SQLite volume: `max-students_max_data`, путь в app `/app/data/max_students.sqlite3`.
- Транспорт MAX: polling, один процесс. 28.09.2026 подтверждены MAX web login и доставка profile_updated; пользователь также подтвердил телефон и повторное открытие с сохранённым статусом.
- Секреты: `/opt/max/.env` с правами 0600; локальные `.env` и `.local/server.json` исключены из архива.

## HTTPS и изоляция

Пользователь создал A-запись `max.market-kit.ru → 201.51.9.21` и разрешил отдельный маршрут общего Caddy. `wb_caddy` v2.11.4 продолжает занимать 80/443; освобождение портов и перезапуск контейнера не потребовались.

К исходному `/opt/wb_card_export/deploy/Caddyfile` добавлен только host block из `deploy/Caddyfile.max`. Исходные байты сохранены; перед изменением проверен SHA256, candidate прошёл `caddy validate`, затем применён `caddy reload`. Резервная конфигурация — `/opt/max/private-proxy/Caddyfile.before`, candidate — `Caddyfile.candidate`, права файлов 0600/директории 0700. Эти файлы могут содержать приватные параметры других сервисов и не включаются в архив.

Для нового поддомена Caddy получил доверенный сертификат Let's Encrypt YE2, SAN `max.market-kit.ru`, первоначальный срок до 26.12.2026. Продление выполняет Caddy; persistent `/data` общего proxy сохранён. На основном market-kit.ru после reload проверены HTTPS 200 и прежний отпечаток сертификата. Время старта Caddy осталось 17.08.2026 19:44:45 UTC. Другие приложения не менялись.

`docker-compose.yml` содержит внутреннюю сеть `max-students_max_edge` с alias app `max-students-app`. Caddy подключён к ней командой `docker network connect max-students_max_edge wb_caddy`. App не подключён к внутренней сети других продовых сервисов. `max-students_default` сохраняет внешнюю связь app с MAX API и резервным tunnel. Дополнительный compose overlay не нужен: обычная пересборка app сохраняет эту топологию.

Подключение Caddy к сети переживает restart контейнера/хоста, но после пересоздания wb_caddy его нужно подключить к сети повторно, предварительно проверив отсутствие подключения. Перед удалением нашего compose проекта отсоединить Caddy от max_edge; иначе Docker не удалит занятую сеть. Не останавливать общий proxy ради этого проекта.

## Обновление app

```sh
cd /opt/max
docker compose -f docker-compose.yml -f scripts/tunnel-compose.yml up -d --build app
docker compose -f docker-compose.yml -f scripts/tunnel-compose.yml ps
docker compose -f docker-compose.yml -f scripts/tunnel-compose.yml logs --tail 100 app
```

PUBLIC_BASE_URL установлен в `https://max.market-kit.ru`; OpenAPI servers и DATA-API.yaml синхронизированы. Приватная копия прежнего app.env хранится в `/opt/max/private-proxy/app.env.before-permanent-url`. Менялся только PUBLIC_BASE_URL; ключи, polling, БД и volume сохраняются. При применении настроек пересоздан только app.

Временный Cloudflare Quick Tunnel сохранён как переходный резерв: https://indicator-barely-reproduced-estate.trycloudflare.com . В форму организаторов передавать постоянный адрес. Не пересоздавать tunnel до завершения привязки и проверки новых ссылок.

## Проверки и откат

Проверены доверенный TLS/правильный SAN, HTTPS health 200, app healthy, публичный smoke обоих вузов, сохранение статусов, события/идемпотентность/отмена, validation/preview/publication и tenant isolation. Smoke создаёт только синтетические данные и сохраняет guard affected_count=1 до публикации; профили удалены, модельное правило архивировано. Из-за прежнего negative DNS cache на компьютере smoke выполнен с адресом сервера для DNS resolution, без отключения проверки TLS. Сервер самостоятельно разрешает новое имя. Google public DNS подтверждает A=201.51.9.21; после очистки прежнего локального negative DNS cache проверены обычный HTTPS health 200 с компьютера и открытие интерфейса в браузере.

При регрессии общего proxy: проверить текущее содержимое, восстановить приватную Caddyfile.before в исходный файл с сохранением inode bind mount, выполнить caddy reload и проверить основной сайт. Копия конфигурации и env приватные. SQLite backup/integrity/restore — `OPERATIONS.md`; snapshot `/app/data/backups/release-2026-09-27.sqlite3` сохранён в volume и не выгружался.

Настоящая MAX identity, доставка profile_updated и согласованное уведомление после публикации модельного правила подтверждены 28.09.2026: `MAX_ACCEPTANCE_2026_09_28.md`. Пользователь подтвердил телефон, сохранение статуса после повторного открытия, получение публикационного уведомления и переход к карточке. Тестовое правило затем архивировано.

## Выкладка экранной системы «Рядом» — 28.09.2026

Новая student UI и backend-проекция ревизий из `RYADOM_UI_IMPLEMENTATION_2026_09_28.md` выложены на `https://max.market-kit.ru`. Пересобран и пересоздан только `app` командой `docker compose -f docker-compose.yml -f scripts/tunnel-compose.yml up -d --build --no-deps app`; tunnel и общий Caddy не пересоздавались. До обновления создан и проверен согласованный снимок `/app/data/backups/release-2026-09-28-ryadom-ui.sqlite3`. Прежний Docker image помечен `max-students-app:pre-ryadom-ui-20260928`; копии заменённых файлов и SHA256-манифест — `/opt/max/private-rollback/ryadom-ui-20260928`.

После выкладки `app` стал healthy, публичные `/health` и стартовая страница вернули 200. `index.html`, `student.js`, `student-ui.js`, `student-ui.css`, `roadmap-view.js`, `demo-profiles.js` через HTTPS побайтно совпали с локальными файлами. Headless Chrome открыл публичный стартовый экран на 390 px без JS-ошибок и горизонтального переполнения. Синтетический профиль проверил публичные roadmap, событие, `revision_id`, GET сохранённой ревизии и идемпотентный повтор; профиль удалён. Основной `https://market-kit.ru/` после обновления вернул 200. Локально перед выкладкой прошли 36 backend-тестов, 4 presentation-теста, ruff и JS syntax. Приёмка именно этой экранной системы внутри MAX на устройстве ещё требуется.

При откате сначала восстановить файлы строго по манифесту в `/opt/max/private-rollback/ryadom-ui-20260928`, удалить только перечисленные там новые файлы с `old_sha256=null`, затем пересобрать только `app`. Снимок БД не применять автоматически: в действующей БД после выкладки могут появиться новые записи пользователей.

## Пакетное уточнение данных — 29.09.2026

На `https://max.market-kit.ru` выложена форма, которая показывает все `missing_fields` выбранного conditional-пункта с нумерацией и счётчиком ответов и сохраняет их одним `PATCH /api/me/profile`. Перед обновлением создан и проверен приватный SQLite snapshot `/app/data/backups/release-2026-09-29-clarification-ui.sqlite3` (integrity `ok`). Прежний image помечен `max-students-app:pre-clarification-ui-20260929`.

Внутри `/opt/max` атомарно заменены только `app/static/student-ui.js`, `app/static/student-ui.css`, `scripts/check_student_ui.cjs` и три документа (`CODE_MAP`, UI/UX spec, UI implementation). Старые версии и SHA256-манифест сохранены в `/opt/max/private-rollback/clarification-ui-20260929`. Пересобран и пересоздан только `app` через `docker compose -f docker-compose.yml -f scripts/tunnel-compose.yml up -d --build --no-deps app`; общий Caddy, tunnel и другие проекты не менялись.

После выкладки контейнер healthy; публичные `/health` и `/` вернули 200, JS/CSS через HTTPS побайтно совпали с локальными файлами. Публичный Chrome на мобильной ширине прошёл синтетический путь СПбГУПТД: onboarding с планируемым въездом → M01 «Подготовиться к въезду» → три вопроса в одной форме → один `PATCH` → `actionable`; ошибок JS не было. Синтетический профиль удалён (`DELETE 200`). `https://market-kit.ru/` также вернул 200. Локально перед выкладкой прошли 36 backend-тестов, 4 presentation-теста и полный browser smoke.

При откате восстановить только файлы по `/opt/max/private-rollback/clarification-ui-20260929/manifest.json`, затем пересобрать только `app`; при необходимости использовать помеченный прежний image. Снимок БД не применять автоматически, так как после релиза могли появиться новые пользовательские записи.

## Исправления по браузерной приёмке — 30.09.2026

Опубликованный текущий UI пройден в обычном браузере по матрице `BROWSER_ACCEPTANCE_2026_09_30.md`. Исправлены переполнение карточек вузов на 320 px, перекрытие уточнённой цели первичного въезда старым событием `entry_recorded` с неизвестной целью и несоответствие URL карточки после reload. Перед заменой создан и проверен приватный снимок `/app/data/backups/release-2026-09-30-browser-acceptance.sqlite3` (integrity `ok`). Старые файлы сохранены в `/opt/max/private-rollback/browser-acceptance-20260930/`.

В `/opt/max` обновлены только `app/engine.py`, `app/static/student-ui.css`, `app/static/student-ui.js`. Пересобран только `app` с `--no-deps`; общий Caddy, tunnel и другие проекты не трогались. Перед выкладкой прошли 37 backend-тестов, `ruff` изменённого Python, проверка синтаксиса JS и полный локальный browser smoke. После выкладки `app` healthy, публичный `/health` возвращает `ok` и `polling`; проверенные сценарии пройдены на опубликованном сайте. Снимок БД не применять автоматически при откате: после релиза могли появиться новые записи. Проверка нового UI внутри MAX на телефоне остаётся отдельной границей.


## Выкладка мобильного интерфейса — 18.10.2026

По запросу пользователя опубликован интерфейс из `ACTIVATION_V3_IMPLEMENTATION_2026_10_18.md`: четыре вопроса, RU/EN с сохранением черновиков, сине-голубой маршрут, полный каталог, обратимые отметки, история и события; декоративные текстовые стрелки убраны. В профиле добавлен необязательный presentation-контекст `arrival_status`, без создания события въезда или изменения eligibility/сроков.

Релиз `activation-v3-20261018T185807Z`. Рабочая директория `/opt/max` не является Git checkout: доставка выполнена адресной заменой отличающихся файлов по SHA256-манифесту. Исходный прототип, локальные секреты и данные не передавались. Добавлены Docker-исключения для `private-rollback/`, `private-proxy/` и `output/`, чтобы приватные копии не попадали в build context. Секреты `.env`, compose-конфигурация и постоянный volume сохранены.

Перед обновлением создан и проверен согласованный SQLite snapshot `/app/data/backups/release-activation-v3-20261018T185807Z.sqlite3` (integrity `ok`). Прежние файлы и manifest сохранены в `/opt/max/private-rollback/activation-v3-20261018T185807Z`, прежний образ — `max-students-app:pre-activation-v3-20261018T185807Z`. Пересобран и пересоздан только `app` с `--no-deps`; идентификаторы всех остальных работавших контейнеров, включая общий Caddy и tunnel, после обновления совпали. Миграции SQL для поля JSON-профиля не потребовалось.

Проверены app healthy, HTTPS/TLS, `/health` с polling, точное совпадение публичных HTML/JS/CSS/логотипа с локальными файлами, no-cache, OpenAPI (23 пути и новое необязательное поле), запрет неавторизованного профиля, согласие/ситуация без вымышленных событий и сроков, удаление синтетического профиля с отзывом сессии. Основной `https://market-kit.ru/` отвечает 200. Локально перед выкладкой прошли 38 pytest, 6 presentation-тестов и синтаксис JS. Проверка внутри MAX на физическом телефоне остаётся отдельным шагом.

Откат: восстановить только файлы из `/opt/max/private-rollback/activation-v3-20261018T185807Z/manifest.json`, затем пересобрать только `app`, либо использовать помеченный прежний образ. Базу из snapshot автоматически не восстанавливать: после выкладки возможны новые записи пользователей. Для следующих выкладок целесообразно отдельно настроить Git checkout или доставку единого артефакта; это не выполнялось в данном релизе.

Публичный Chrome/Playwright также прошёл четыре вопроса RU/EN, сохранение согласия, полный каталог и все 12 событий, поздний вход/complete/undo/следующий Hero, origin после reload, черновики события и редактора после смены языка/reload, recheck/read-only, loading/error/retry, удаление, ширины 320/360/390 px и hit targets 44 px. Ошибок JS нет; оба синтетических профиля проверки удалены, их сессии отозваны. Снимки опубликованной версии: локальный `output/activation-v3-deployed/`.


## Приветствие перед анкетой — 19.10.2026

На https://max.market-kit.ru опубликован экран из `WELCOME_IMPLEMENTATION_2026_10_19.md`: новый пользователь видит приветствие, начавший анкету восстанавливает вопрос и ответы, готовый профиль открывает план или целевой экран без приветствия. Четыре вопроса, согласие, backend и roadmap engine сохранены. Static cache version — `20261019-welcome2`.

Перед обновлением создан и проверен согласованный SQLite snapshot `/app/data/backups/release-welcome-20261019T150112Z.sqlite3` (integrity `ok`). Прежний image отмечен `max-students-app:pre-welcome-20261019T150112Z`. Исходные файлы до welcome и SHA256-манифест с окончательными версиями находятся в `/opt/max/private-rollback/welcome-20261019T150112Z` (приватная директория, 0700). В ходе проверки дополнительно сохранено восстановление MAX-черновика при открытии действующей bearer-сессии без новых launch data; это включено в окончательную версию и тот же манифест.

Заменены только четыре student static-файла, три browser scripts, `.dockerignore`, README и связанная документация внутри `/opt/max`. Входной прототип `welcome/` не нужен runtime и исключен из Docker context. Выполнена пересборка только app через `docker compose -f docker-compose.yml -f scripts/tunnel-compose.yml up -d --build --no-deps app`. SHA256 `.env` сохранен; SQLite volume и transport polling прежние. ID всех остальных запущенных контейнеров, включая Caddy и tunnel, не изменились.

После обновления app healthy. Через публичный HTTPS проверены health 200, polling, побайтное соответствие HTML/student/admin assets/логотипа локальным файлам, no-cache HTML, неизменная API schema, изоляция, сохранение неполного consented-профиля, отсутствие вымышленных дат/событий, неизменность задач при изменении только UI-ситуации и удаление своего синтетического профиля. Основной https://market-kit.ru вернул 200. `UI_BASE_URL=https://max.market-kit.ru node scripts/check_welcome_ui.cjs` прошел: RU/EN 320–430 px, CTA, reload, ответы/согласие, Back/Forward, отсутствие welcome у готового профиля и target через анкету. Модельные MAX auth responses/BackButton проверяют ветки UI, включая ошибку/повтор, смену bearer token и MAX task target; настоящая приемка нового экрана внутри MAX на телефоне отдельно не выполнялась. Все созданные этой публичной проверкой synthetic-профили удалены.

Локально прошли 38 backend-тестов, 6 presentation-тестов, JS syntax и три browser scripts; снимки — `output/welcome/`. Для отката восстанавливать только файлы по приватному манифесту, удалять только перечисленные новые файлы с `old_sha256=null`, затем пересобрать app. Исходные файлы в rollback относятся к версии до всего welcome-обновления. Базу автоматически не заменять: после snapshot возможны новые пользовательские записи. Коммит агент не создавал.


## Общая оболочка страниц и проверка масштаба — 19.10.2026

По пользовательским desktop-снимкам исправлена разная высота приветствия и анкеты: общая responsive-оболочка для всех student-экранов, сплошной фон окна, desktop tabs внутри frame и центрированные desktop dialogs. Исправлен контраст Hero CTA при hover (1.25:1 → 5.81:1). Серверная логика и JavaScript приложения не менялись. Cache version: `20261019-layout1`. Реализация и полный отчет — `UI_SCALE_REVIEW_2026_10_19.md`.

Релиз `layout-20261019T153501Z` опубликован на https://max.market-kit.ru. Перед обновлением создан и проверен SQLite snapshot `/app/data/backups/release-layout-20261019T153501Z.sqlite3`, integrity `ok`; прежний image отмечен `max-students-app:pre-layout-20261019T153501Z`. Прежние файлы и SHA256-манифест — `/opt/max/private-rollback/layout-20261019T153501Z`. Заменены только student `index.html`/`student-ui.css`, новый browser script и связанная документация. Пересобран только app через `docker compose -f docker-compose.yml -f scripts/tunnel-compose.yml up -d --build --no-deps app`. `.env` побайтно сохранен; ID других контейнеров, включая Caddy и tunnel, не изменились.

На публичном HTTPS прошел `UI_BASE_URL=https://max.market-kit.ru node scripts/check_student_layout.cjs`: 448 RU/EN проверок на 320/390/430/768/1280/1920/2560 px, все 12 event forms, совпадение frame приветствия/вопроса, полный фон, tabs/dialogs, scroll, targets и контраст. Собственный synthetic-профиль удален. Публичные HTML и все подключенные student/admin assets побайтно совпали с локальными, health/polling/API schema/auth isolation/profile/deletion исправны, основной https://market-kit.ru вернул 200. Снимки и отчет — `output/layout-deployed/`.

Локально прошли четыре browser scripts, 38 backend-тестов, 6 presentation-тестов и JS syntax. Реальный MAX на телефоне для этой версии отдельно не проверен. Откат — восстановить только файлы по манифесту, удалить только новые файлы с `old_sha256=null`, затем пересобрать app; базу автоматически не подменять. Коммит агент не создавал.


## Полное ревью и исправления — 20.10.2026

Релиз `review-20261019T231306Z` (20 октября по Москве) опубликован на https://max.market-kit.ru. Cache version: `20261020-review1`. Состав исправлений и локальные проверки — `PROJECT_REVIEW_2026_10_20.md`.

До выкладки создан и проверен SQLite snapshot `/app/data/backups/release-review-20261019T231306Z.sqlite3` (integrity ok). Прежний образ отмечен `max-students-app:pre-review-20261019T231306Z`; прежние файлы и SHA256-манифест сохранены в `/opt/max/private-rollback/review-20261019T231306Z` (0700). Preflight сверил runtime с предыдущими Git/deployment версиями; расхождений вне текущей работы нет. Дополнительная совместимость со старым History API/form draft включена в тот же релиз и манифест.

Пересобран только `app`: `docker compose -f docker-compose.yml -f scripts/tunnel-compose.yml up -d --build --no-deps app`. Образ собран с кэшированными зависимостями менее чем за 5 минут. `.env` побайтно сохранен, SQLite volume прежний; ID всех остальных работающих контейнеров, включая Caddy и tunnel, не изменились. App healthy, транспорт polling.

Публичная проверка подтвердила HTTPS/TLS, health, точное соответствие HTML и семи подключенных assets локальным файлам, no-cache, прежнюю OpenAPI-схему (23 пути), auth isolation, safe unknown, идемпотентность события, correction/retraction/owned revision, сохранение optional timestamp, отказ от некорректного stay_expiry и удаление synthetic-профиля с отзывом сессии. Основной market-kit.ru отвечает 200. Настоящие пользовательские события и модельные правила на публичном сервере для ревью не создавались: проверки работают на своих browser-demo профилях без MAX identity.

Локально: 48 pytest, 6 presentation tests, пять browser scripts. Публично: welcome RU/EN и responsive layout проверены повторно; отчеты в `.local/review-public-verification.json`, `output/review-deployed/`. Все профили этих публичных проверок удаляются. Телефон/MAX WebView и реальные сообщения этой версии отдельно не проверялись.

Откат: восстановить только файлы из manifest указанной приватной директории и пересобрать app (или использовать сохраненный image). Новые файлы перечислены с `old_sha256=null`. Базу автоматически не подменять: после snapshot возможны новые записи. Другие сервисы не требуют отката. Коммит не создавался.


## Адаптивный маршрут — 21.10.2026

Релиз `adaptive-20261021T143027Z` опубликован по явному запросу пользователя. Cache version student assets — `20261021-adaptive1`. Preflight подтвердил соответствие runtime предыдущей выкладке/Git baseline. Внутри `/opt/max` адресно заменены 36 отличающихся файлов по SHA256-манифесту. Прототип и developer-package не передавались; compose, env и постоянный volume сохранены.

Перед заменой создан и проверен согласованный SQLite snapshot `/app/data/backups/release-adaptive-20261021T143027Z.sqlite3` (integrity ok). Копии исходных файлов и манифест — `/opt/max/private-rollback/adaptive-20261021T143027Z` (0700), прежний image — `max-students-app:pre-adaptive-20261021T143027Z`. Пересобран только app с `up -d --build --no-deps app`; идентификаторы всех остальных запущенных контейнеров, включая Caddy и tunnel, совпали до/после. `.env` побайтно сохранён. При старте additive migration создала workflow_reports/onboarding_receipts; seed добавил версии правил без изменения прежних snapshots.

Публичная API-проверка обнаружила крайний случай: событие въезда без arrival_at перекрывало последующее точечное уточнение времени прибытия ЛЭТИ. Исправлено в этом же релизе: сервер привязывает уточнение через Profile.arrival_at_episode_id к текущему entry episode. Оно не наследуется новым въездом, а дата раньше фактического въезда отвергается. Повторно обновлены engine/main/models, OpenAPI и regression test; manifest содержит окончательные хеши, исходные rollback-файлы сохранены. После исправления 75 backend tests прошли.

Проверены доверенный HTTPS, health/polling, точное совпадение публичных HTML и всех подключённых student/admin assets с локальными файлами, no-cache, 27 API paths, auth isolation, полный API-путь обоих вузов (onboarding/replay, приглашение, виза, поездка, фактический въезд, частичный комплект, ожидание/получение регистрации, уточнение expiry). Созданы только собственные demo-профили без MAX ID; после проверки они удалены, сессии отозваны. Основной https://market-kit.ru отвечает 200.

Публичные browser checks: adaptive flow (включая потерянный ответ/retry, cancel без записи, поздний LETI, targeted fields), welcome/auth/drafts/Back и 476 RU/EN layout checks на 320–2560 px прошли. MAX auth/Back в welcome — модельные; реальный MAX WebView и доставка этой версии не заявлены. Артефакты: `.local/adaptive-deployment.json`, `.local/adaptive-public-verification.json`, `output/adaptive-deployed/`, `output/adaptive-welcome-deployed/`, `output/adaptive-layout-deployed/report.json`. Это приватные/генерируемые локальные файлы, без включения в source archive.

Откат: сначала проверить текущие хеши по manifest и совместимость каталога/результатов на изолированной копии. Восстанавливать только перечисленные файлы в `/opt/max`; новые файлы отмечены old_sha256=null. Предыдущий image сохранён. Откат кода сам по себе не отменяет новые версии правил и workflow results. Базу автоматически не подменять: после snapshot возможны пользовательские записи. Предрелизный snapshot со старой схемой проверять прежним image/CLI либо на дополнительной изолированной копии после additive migration. Соседние сервисы не требуют отката. Коммит не создавался.
