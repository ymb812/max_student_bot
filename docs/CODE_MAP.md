# Карта кода «Рядом»

Обновлено 21.10.2026. Продуктовый source of truth — MASTER FINAL и принятое пользователем дополнение `developer-package-2026-10-21/`. Текущий контракт/приёмка: `ADAPTIVE_ROUTE_2026_10_21.md`. Предыдущие отчёты ниже описывают свои версии.

Мобильный интерфейс от 18.10.2026, требования, соответствие исходному прототипу, проверки и снимки: `ACTIVATION_V3_IMPLEMENTATION_2026_10_18.md`. Визуальное оформление и короткий onboarding обновлены; полный каталог и правила сохранены. Декоративные текстовые стрелки убраны из student/admin UI, навигационные SVG-иконки сохранены.

Исходный прототип сохранён пользователем вне проекта; локальная копия исключена из Git и Docker-контекста и для разработки не требуется. Для работы достаточно этой карты, `RYADOM_FINAL_UI_UX_LOGIC_SPEC.md` и отчёта реализации выше. Рабочие исходники и логотип находятся в `app/static/`; `output/activation-v3/` — только генерируемые снимки проверок.

Предсдаточная проверка кода, выкладки, Git и комплекта: `HACKATHON_FINAL_AUDIT_2026_09_30.md`.

| Файл | Ответственность |
|---|---|
| `app/config.py` | Настройки окружения. Никаких секретов во frontend. |
| `app/static/demo-profiles.js`, `demo-profiles.json` | Синтетические входные данные и независимые сессии пресетов в браузерном демо; обычные API и rules engine, исходный профиль сохраняется. |
| `docker-compose.yml`, `deploy/Caddyfile.max` | Опциональная изолированная сеть app/proxy и отдельный host block max.market-kit.ru, без новых публичных портов. |
| `tests/test_demo_profiles.py` | Фактические fixtures: локальные рекомендации, безопасные unknown и независимость статусов. |
| `app/timeutil.py` | Московская дата; рабочие дни только по переданному проверенному календарю с полной областью дат, включая переносы. Производственный календарь не встроен. |
| `app/models.py` | Строгие Profile, EventInput, OnboardingInput и WorkflowResult. `admitted` отдельно от `active`; `arrival_status` выбирает контекст/доступность без выдуманного события; city arrival отдельно от въезда; серверный arrival_at_episode_id привязывает уточнение к конкретному entry episode. |
| `app/adaptive_catalog.py` | Декомпозиция M01, entry context M02, контент RU/EN, точные разделы источников и три явных demo overrides единиц времени. |
| `app/workflow.py` | Чистая проекция журнала результатов, зависимости/циклы, availability/workflow_status/result_actions, stage и единый серверный ранг Hero. |
| `app/catalog.py` | Источники и версионированный каталог M01–M10 двух вузов. При обновлении seed создаётся новая версия, старый snapshot сохраняется. |
| `app/engine.py` | Чистый reducer подтверждённых событий, support envelope, три состояния применимости, эпизоды/циклы, дедупликация действий, отдельные временные значения. Неизвестная цель первичного въезда не перекрывает последующее уточнение профиля; новый въезд с неизвестной целью снова требует уточнения. M09 оркестрирует, отдельная карточка только для уникального review. |
| `app/db.py` | SQLite/WAL, BEGIN IMMEDIATE, additive таблицы workflow_reports/onboarding_receipts. Один процесс приложения. |
| `app/service.py` | Пересчёт, стабильные task keys, diff/history; атомарный onboarding и идемпотентные результаты; коррекция/отмена, версия/preview/outbox. |
| `app/operations.py` | Приватный согласованный снимок SQLite, integrity/schema verification; никогда не перезаписывает живую базу. |
| `app/auth.py` | HMAC-SHA256 MAX initData, запрет повторных ключей, часовой срок подписи, проверенный MAX ID. |
| `app/main.py` | API, роли и tenant isolation, immutable publish, отмена/исправление, статусы, профиль и удаление; no-store API и ревалидация HTML/static. |
| `app/responses.py` | Выходные модели OpenAPI основных методов. |
| `app/max_client.py` | Bot API, проверенный TLS, durable inbox/outbox, polling или webhook, retries, reminders и retention. |
| `app/certs/` | Публичный сертификат Минцифры, используется только клиентом MAX. |
| `app/language.py` | RU/EN определение языка и предложение типа события. Optional OpenAI-compatible classifier, безопасный локальный fallback. Ни одного изменения плана из ответа LLM. |
| `app/static/student.js` | Auth/API, scoped session draft v3 и миграция старых ответов, RU/EN, typed event forms, task detail с источниками/помощью и результатами; recovery по idempotency key. |
| `app/static/adaptive-ui.js` | Адаптивные блоки onboarding и сводка; формы конкретного результата/исправления, чек-лист поездки, остаток комплекта, ожидание и адресное уточнение. Формы не вычисляют применимость. |
| `app/static/student-ui.js` | Приветствие со статичным примером и CTA, auth loading/error/retry, маршрутизация нового/начатого/готового входа; 16 основных экранов, History API/Back/MAX BackButton, восстановление URL после reload, origin/scroll, Hero/stages, уточнения (все `missing_fields` пункта в одной форме и одном PATCH), profile sheets/dirty guard, persisted revision diff и история. |
| `app/static/roadmap-view.js` | Чистая presentation-логика: M07/M08 → study, выбор Hero независимо от этапа, семантическая дедупликация, прогресс, distinct уточнения. Никакой правовой арифметики. |
| `app/static/student-ui.css`, `ryadom-logo.svg` | Student-only система activation-v3, общий responsive frame (desktop/mobile), читаемый hover Hero CTA и scoped welcome по прототипу 19.10: синий Hero, голубые карточки, общий timeline с синими completed/current маркерами, нижние вкладки, RU/EN, sheets, safe-area и 320px. |
| `scripts/check_student_layout.cjs` | 476 RU/EN проверок на 320–2560 px: welcome/5 блоков arrived onboarding, план/этапы/задачи/результаты, все 12 event forms, diff/history/profile/editors; 44 px, frame, tabs/dialogs и hover contrast. `LAYOUT_OUTPUT` задаёт папку снимков. |
| `scripts/check_adaptive_ui.cjs`, `tests/test_adaptive_route.py` | Новый маршрут обоих вузов, поздний вход, неизвестные даты, частичный комплект/ожидание/получение, циклы, исправление/отмена, lost response/rollback/replay, старая M01, рестарт, серверный Hero и рабочие дни. |
| `scripts/check_welcome_ui.cjs` | Первый вход, старый/новый session draft, Back/Forward/MAX Back, RU/EN и согласие, готовый профиль/query/MAX task target без welcome, auth loading/error/retry и смена MAX bearer token (модельные auth responses), 320/360/390/430 px, reduced motion. Реальный API на собственных синтетических профилях; они удаляются. `UI_BASE_URL` задает сервер. |
| `tests/roadmap-view.test.cjs` | Инварианты Hero, этапов и прогресса, включая completed+recheck. |
| `tests/test_ui_revisions.py` | Собственность/replay ревизий, persisted empty diff. |
| `scripts/preview_redesign.py` | Изолированный local API без MAX, параметры `--port` и `--database`; defaults сохранены. |
| `scripts/check_student_ui.cjs`, `scripts/check_activation_ui.cjs` | Исторические сценарии четырёх вопросов 18.10; для текущего onboarding использовать check_adaptive_ui/check_welcome_ui. Не являются текущей приёмкой. |
| `tests/test_activation_profile.py` | Ситуация/согласие без выдуманной даты/события; смена контекста влияет на доступность, старый API совместим; enum validation. |
| `scripts/check_review_ui.cjs`, `tests/test_review_regressions.py` | Регрессии полного ревью: публикация/редактирование составного правила в обоих tenant, diff контактов/документов RU/EN, исправление optional event fields, MAX draft rotation/account isolation, legacy drafts, истечение сессии; неправильный LLM JSON, актуальность отложенных reminders, stay expiry/config. Только synthetic local данные. |
| `app/static/admin.js` | Модельная роль редактора, draft/version, validation, affected preview, publish/archive, доставка; общий SVG-логотип без текстовых декоративных стрелок. |
| `app/static/style.css` | Общий светлый адаптивный student/admin UI: список задач, нижняя навигация, мобильные диалоги, формы и таблицы; без сборки и внешних шрифтов. |
| `tests/` | Интеграционные проверки движка, API, ролей, публикаций, подписи MAX, повторов и отмены фактов. |
| `tests/test_persistence.py` | Новый процесс приложения, сохранение сессии/плана/outbox, независимое восстановление snapshot и ограничения файлового пути. |
| `scripts/export_api.py` | Экспорт реального OpenAPI 3.1. |
| `scripts/smoke.py` | Сквозной smoke публичного API на собственных синтетических профилях; очищает только эти профили. |
| `scripts/package_source.py` | Архив исходников и SHA256, whitelist файлов, исключение окружения/данных и проверка секретов; дата имени берётся из локального часового пояса машины. |
| `scripts/package_context.py` | Отдельный комплект источников для аналитика/ChatGPT: 11 MD и два официальных PDF, без кода/секретов/пользовательской базы; сверка содержимого архива с исходными документами. |
| `scripts/check_max.py` | Read-only проверка бота и подписок. Секреты не выводятся. |
| `scripts/server.py` | Тестовый deployment helper. Креды только в игнорируемом `.local/server.json`. Записи ограничены `/opt/max`. |
| `scripts/tunnel-compose.yml` | Отдельный временный HTTPS-туннель для теста без изменения существующего reverse proxy. |

Поток: API → транзакция → события/профиль/версии → pure engine → diff → tasks + revisions + outbox → worker → MAX. Поля из LLM никогда не попадают в этот поток без формы и явного подтверждения человека.

Слой гражданства/договоров сейчас не содержит подтверждённого каталога исключений. Введённая страна не является доказательством применимости федерального срока. M04 показывает локальное действие и отдельно непросчитанную правовую базу. M05/M06/M10 остаются conditional или needs_review. Не добавлять страну/дату «для красивого демо».

Матрица подтверждений MAX web/телефон, доставки и повторного запуска: `MAX_ACCEPTANCE_2026_09_28.md`.

Приёмка опубликованного student UI в обычном браузере: `BROWSER_ACCEPTANCE_2026_09_30.md`. Она фиксирует onboarding, два вуза, RU/EN, статус/reload, событие/исправление/отмену, пересчёт и границу относительно настоящего MAX.

Новая экранная система и локальная приёмка: `RYADOM_UI_IMPLEMENTATION_2026_09_28.md`. `UI_REDESIGN_2026_09_28.md` — исторический отчёт первого прохода.

## Ключевые места для аналитической сверки

| Что проверить | Реализация и смысл |
|---|---|
| Как события меняют профиль | `engine.reduce_events`: исходный профиль копируется; применяются активные, не замещённые исправлением события в детерминированном порядке. Новое событие не является произвольным патчем базы. |
| Граница поддерживаемых веток | `engine.support_status`: несовершеннолетие, иная площадка, специальные миграционные/учебные статусы направляются в review. Недостающие поля дают conditional. |
| Почему полный профиль не даёт федеральную дату | `engine.legal_status`: после ввода полей сохраняется needs_review, поскольку каталог договорных исключений и персональной применимости не подтверждён. |
| Где вычисляется дата | `engine.temporal`: подтверждённые календарные/абсолютные даты вне legal_deadline; неизвестные единицы и правовые даты остаются без computed_at. Рабочий календарь и график офиса не имитируются. |
| Из чего строится roadmap | `engine.build_roadmap`: эффективные факты, версии правил, эпизоды и циклы; общий core для двух вузов. Движок не обращается к сети, SQLite или LLM. |
| Как сохраняется статус | `service.plan_diff`: связывает задачи по стабильным ключам, сохраняет user_status, различает прежний эпизод и recheck; reported_fact имеет отдельное основание завершения и предыдущий статус для отмены факта. |
| Что сохраняется атомарно | `service.recalculate` внутри транзакции вызывающего API: задачи, before/after ревизия и outbox. Ошибка доставки не отменяет roadmap. |
| Исправление/отмена | `service.record_event`, endpoints событий в main: idempotency_key, supersedes_event_id и retracted_at; запись остаётся в истории, факты пересчитываются. |
| Как проверяется публикация | `service.validate_rule`, `preview_publication`, endpoints admin в main: локальные полномочия, immutable версии, affected diff и preview_token против публикации устаревшего preview. |
| Кто получает сообщение MAX | `service.enqueue`, worker в max_client: только адресуемый настоящий MAX-профиль; dedupe/retry. Браузерное демо без MAX ID не является получателем push. |
| Что доверено MAX | `auth.validate_launch_data`, `/api/auth/max`: подпись/свежесть initData подтверждают identity. Остальные личные обстоятельства вводит студент; initDataUnsafe не является авторизацией. |
| Что делает LLM | `language.propose_event` и candidate endpoints: предлагает тип/язык. Запись конкретных фактов требует отдельного подтверждения; юридические ответы/правила не генерируются. |

## Контракт, данные и границы чтения карты

Все продуктовые HTTP-методы имеют префикс `/api`. Группы: `/auth/*` — сессии; `/me/profile`, `/me/roadmap`, `/me/tasks/*/status` — профиль/план; `/me/events`, `/me/history`, `/me/candidates` — факты/история/предложение события; `/admin/rules/*`, `/admin/publications`, `/admin/notifications` — редактор; `/max/webhook` — входящие MAX updates. Точные пути, схемы и status codes смотреть в реальном `openapi.json`, не в примерных маршрутах спецификации. Swagger — https://max.market-kit.ru/docs .

SQLite хранит профиль, подтверждённые события, задачи, версии правил, ревизии, сессии и очереди. База находится в постоянном Docker volume, не в browser storage и не в MAX. `sessionStorage` хранит токен текущей браузерной сессии. Настоящий MAX-профиль и случайное браузерное демо не сливаются автоматически.

API проверяет владение student-данными и tenant редактора. Superseded-задача не принимает ручную смену статуса; выполнение из reported_fact меняется исправлением/отменой события. Поля норм, источников и вычисленных дат не принимаются от student UI как доверенные результаты.

Эта карта описывает проверенную структуру текущего кода, но не содержит полных алгоритмов. Для технического вывода о конкретной строке нужен соответствующий исходник и, при необходимости, тест. Спецификация, факт реализации и факт проверки — разные виды доказательства.

Комплект для аналитика/ChatGPT: `CHATGPT_CONTEXT_README.md`, краткая вводная — `PROJECT_CONTEXT.md`.

Операционные документы: `OPERATIONS.md` — backup и независимое восстановление; `MAX_TEST_GUIDE.md` — HTTPS и настоящая MAX проверка; `MAX_ACCEPTANCE_2026_09_28.md` — публикационный push и архивирование тестового правила; `PRESENTATION_CONTENT.md` — публичная/закрытая презентации и состав MarketKit; `SUBMISSION_STEPS.md` — конкретные действия капитана по вычитке и подаче.

Приветствие и актуальный вход 19.10.2026: `WELCOME_IMPLEMENTATION_2026_10_19.md`. Пример маршрута не вызывает engine/API и не меняет прогресс. Исходный `welcome/` убран из проекта 20.10; локальная копия сохранена в игнорируемом `.local/welcome-reference-2026-10-20/`. Требования полностью перенесены в docs.

Ревью 20.10: `student-ui.js` хранит формы v2 по именам полей и scope проверенной личности, изолирует History API между пользователями, показывает полный diff и путь перевода вуза. `student.js` сохраняет optional `arrival_at`/`stay_expiry` при исправлениях и дает повторный вход после 401. `admin.js` сохраняет дополнительные сроки/триггеры и поддерживает разовую дату. `max_client.py` перепроверяет queued reminder перед отправкой; `language.py` отбрасывает не-объектный LLM JSON. Подробности и границы — `PROJECT_REVIEW_2026_10_20.md`.
