# Постоянное развёртывание

Обновлено 28.09.2026. Рабочая директория проекта на сервере — `/opt/max`.

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
