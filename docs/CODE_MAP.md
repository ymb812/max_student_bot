# Карта кода «Рядом»

Обновлено 02.11.2026: уточнено продуктовое направление и размещение в инфраструктуре вуза; сведения о реализации ниже сохраняют даты своих проверок.

Зарубежные аналоги: [FOREIGN_ANALOGUES_RESEARCH_2026_11_02.md](FOREIGN_ANALOGUES_RESEARCH_2026_11_02.md) — семь решений, функции, примеры использования университетами, механизмы сокращения рутины, размещение и сопровождение, гипотезы для встреч с УМС. Это исследование открытых источников и предложения, не новая спецификация и не проверка реализации.

Следующая продуктовая работа: [UMS_PROCESS_DISCOVERY_2026_11_02.md](UMS_PROCESS_DISCOVERY_2026_11_02.md) — план разбора процессов СПбГУПТД, вопросы сотрудникам и студентам, источники статусов и проверка эффекта при неполном участии. Это план исследования, не реализация кабинета и не доказательство спроса.

Принятое направление после хакатона: [PRODUCT_DIRECTION_2026_11_02.md](PRODUCT_DIRECTION_2026_11_02.md). Приложение и данные размещаются в инфраструктуре вуза; команда поставляет и сопровождает решение. Веб-интерфейс совместим с этой моделью, MAX — дополнительная интеграция. Кабинет УМС должен сокращать существующую рутину; сначала доведение продукта и пилоты, затем продажи. Документ отделяет решения пользователя от предложений и текущего кода; новая авторизация, рабочий кабинет УМС и готовность к такой поставке ещё не подтверждены реализацией и проверкой.

Текущий статус и передача между чатами: [CURRENT_REVIEW.md](CURRENT_REVIEW.md). A01–A03 исправлены и проверены локально 23.10: [MEDICAL_CLARIFICATION_2026_10_23.md](MEDICAL_CLARIFICATION_2026_10_23.md). `student-copy.js/medicalClarification`, `taskSubjectTitle`, `taskExpectedResult` согласуют заголовок и результат с состоянием; `student.js` уточняет условный срок, общую справочную инструкцию и наличие модели; `student-ui.js` использует тот же заголовок для уточнения и снимков результата/истории. Проверки: `tests/content-minimal.test.cjs`, `scripts/check_medical_clarification.cjs`. После выкладки коллегой выполнена [публичная проверка 23.10](DEPLOYED_VERIFICATION_2026_10_23.md): frontend соответствует `2f9e4be`, исправления и основные сценарии прошли. Ниже история реализации: прежние статусы относятся к моменту этапа.

Минимальный пакет содержания C01–C03/C05/C07/C08: `CONTENT_MINIMAL_2026_10_22.md`. `student-copy.js/taskInstruction` и `student-ui.js/reviewView` согласуют медицинское уточнение с состоянием; `student.js/taskInformationView`, `taskDetailView`, `eventFormView` уточняют демонстрационное основание, непроверенный срок приглашения ЛЭТИ и назначение даты медосмотра. `catalog.py` уточняет две позиции `sutd.M03`, сохраняя индексы остатка; `adaptive-ui.js/renderOnboarding` разделяет подпись необязательного времени прибытия ЛЭТИ. Проверки: `tests/content-minimal.test.cjs`, `tests/test_content_minimal.py`; фактические результаты и снимки — `../../audits/2026-10-22-content-minimal/REPORT.md`. Правила, формулы и схема данных не менялись; commit/push/deploy не выполнялись.

Упрощение дат результатов 22.10: `student-copy.js/resultOccurredAt` отделяет новые WorkflowResult (всегда null) от коррекции прежней даты. `adaptive-ui.js/workflowFormView` оставляет календарь срока документа с отдельной строкой «Необязательно» и пояснением продления; календарь исторической даты доступен только по явному действию из истории. `student-ui.js/historyView` показывает только известную дату результата отдельно от времени записи и кнопку её исправления/очистки; черновик редактора даты имеет отдельный ключ, именованные черновики не возвращают скрытое поле, позиционные result-черновики не применяются после изменения структуры. `student.js/eventFormView` конкретизирует вопросы и назначение дат въезда, медосмотра и переезда, сохраняя обязательность EventInput. Модель, расчёты и каталог не изменены. Регрессии: `tests/result-dates.test.cjs`, `tests/test_result_dates.py`, обновлённые `check_preparation_flow.cjs`, `check_forms_results.cjs`, `check_visa_submission.cjs`, `check_adaptive_ui.cjs` (актуальные study_path, task keys и CTA уточнения Hero; `LAYOUT_OUTPUT` для изолированного вывода). Фактическое покрытие UI и ограничения: `../../audits/2026-10-22-date-simplification/REPORT.md`.

Представление роадмапа и пересчёта 22.10: `roadmap-view.js/progressLabel` разделяет число выполненных действий и уточнений переводом строки, `student-ui.js/timeline` и `stageView` отображают их раздельно. `student-ui.css` сохраняет переносы и задаёт кнопке отправки `event-form` полную ширину формы и минимум 52px на мобильном и desktop. `resultView` объединяет новые и изменённые задачи в «Изменения в плане»; повторная проверка и прежние действия сохраняют отдельные группы. `revisionCard` не показывает искусственное «Задачи не было» для отсутствующего before; реальные переходы статуса и diff полей сохранены. Проверка и снимки: `../../audits/2026-10-22-roadmap-presentation/REPORT.md`.

Упрощение формы въезда 22.10: `student.js/eventFormView` запрашивает только дату въезда в Россию с явным вопросом в RU/EN; поле времени прибытия в город убрано из первого и повторного въезда. При коррекции старого события его отдельное `arrival_at` сохраняется без подстановки из `occurred_at`. Другие формы уточнения и правила расчёта не изменены. `scripts/check_entry_form.cjs` — UI-сохранения, reload/отмена, прежний именованный черновик и коррекция прежнего события, оба вуза/RU/EN на 320/390; `check_review_ui.cjs` сохраняет проверку прежнего optional факта через synthetic setup. Результаты: `../../audits/2026-10-22-entry-date-form/REPORT.md`.

Локальные исправления повторного аудита сайта: `DEPLOYED_REVIEW_FIXES_2026_10_22.md`. `engine.py` сохраняет кнопку ответа внутри support review (DR01); `workflow.py` отделяет запись переданного комплекта от неизвестных дат въезда/прибытия (DR02). `task_context.py` и `student-copy.js` различают получение визы и неизвестный срок (DR04), показывают честные остаток/причину неактуальности (DR07/DR08). `student-ui.js` сравнивает срок первичной визы в ревизии (DR05), подписывает остаток в истории и группу подготовки без выдуманного приезда. `roadmap-view.js` исправляет счётчик (DR11). Проверки: `tests/test_deployed_review.py`, `tests/deployed-review.test.cjs`, `scripts/check_deployed_review.cjs`; фактическое покрытие и решения: `../../audits/2026-10-22-deployed-review-fixes/`. Изменения не выложены.

Версия для отправки в GitHub: `RELEASE_REVIEW_2026_10_22.md` — состав накопленных изменений, повторные проверки обычного и демонстрационного режима, локальный запуск и ограничения.

Порядок карточки 22.10: `student.js/taskSupportingSections` выводит ожидаемый результат после документов и контактов, перед помощью и кнопками результата; завершает текст знаком препинания в RU/EN. `check_prototype_timing.cjs` проверяет порядок разделов и пунктуацию; отчёт `../../audits/2026-10-22-outcome-order/REPORT.md`.

Хакатонные сроки 22.10: `PROTOTYPE_TIMING.md` / `.json` — реестр подтверждённых интервалов и демо-допущений. `app/prototype_timing.py` — копия правил и детерминированные календарные/рабочие/годовые формулы; `engine.py` — применение только по явному флагу, с сохранением неизвестных дат и границ поддерживаемого профиля. `config.py`, `db.py`, `main.py`, `service.py` передают отдельный `prototype_timing` через соединение БД без изменения схемы или опубликованного каталога. `preview_redesign.py --prototype-timing` включает режим. `student-ui.js` — общая шапка без метки «Прототип» (убрана по запросу пользователя 22.10); `student.js` — конкретные сроки и переходы к прежним медицинским событиям; `adaptive-ui.js` — кнопки прохождения. Проверки: `tests/test_prototype_timing.py`, `scripts/check_prototype_timing.cjs`; отчёт `../../audits/2026-10-22-prototype-timing/REPORT.md`.

Поздний вход 22.10: `roadmap-view.js/stagePassed` и `student-ui.js/stageProgress` показывают пройденный период подготовки по факту приезда, отдельно от `progress.done` и результатов действий. Прошлые строки без сроков; `adaptive-ui.js/workflowLabel` помечает их «Прошлая подготовка». `student.js/taskDetailView` убирает неактуальные CTA/сроки/повторы, `taskInformationView` сохраняет справочную инструкцию и общие `taskSupportingSections` (документы/контакты/помощь). «Исходная инструкция» больше не аккордеон. `check_late_entry.cjs`, `check_task_structure.cjs`, `roadmap-view.test.cjs` — проверка; отчёт `../../audits/2026-10-22-late-entry/REPORT.md`.

Последующее упрощение формы подачи: `resultFormHint` возвращает пустой текст для подачи на визу, `workflowFormView` не создаёт пустой абзац. Форма начинается с заголовка и подтверждения; пояснение о переходе в ожидание удалено в RU/EN. Проверка добавлена в `check_visa_submission.cjs`.

Подача на визу без даты 22.10 (затем распространена на все новые результаты, см. выше): `student-copy.js/resultOccurredAt` и `resultFormHint` — подача первой визы/продления без запроса даты; `adaptive-ui.js/workflowFormView` — новый результат с null, коррекция прежней подачи сохраняет её дату; `student-ui.js/historyView` — отсутствие пустой строки даты для таких подач, старые даты видимы. `scripts/check_visa_submission.cjs` и `check_preparation_flow.cjs` — сохранение/ожидание/reload/история/совместимость. Отчёт: `../../audits/2026-10-22-visa-submission/REPORT.md`.

Упрощение карточки 22.10: `student.js/taskDateDetails` — дата, смысловой заголовок и исходный интервал без повторных меток владельца/единицы; неизвестность и оговорки сохраняются. `taskDetailView` — ожидаемый результат отдельным обычным разделом, убраны служебные подписи. `student-ui.css` — снято особое оформление `.task-expected`. Проверка `scripts/check_task_copy.cjs` (24 сочетания) и регрессия `check_task_structure.cjs` (276); отчёт `../../audits/2026-10-22-task-copy/REPORT.md`.

Уточнение форм/результата 22.10: `student-ui.css` — выравнивание и полный кликабельный ряд checkbox, группы даты, кнопка списка документов и карточки изменений; `student-copy.js/onboardingOfficeDocuments/wireOnboardingDocuments/entryPurposeNote` — доступное раскрытие комплекта и объяснение `other`, без нового поля модели. `adaptive-ui.js` — сохранение раскрытия в черновике, связь даты с неизвестностью, понятная форма результата. `student-ui.js/revisionCard` — один переход статуса и отдельные фактически изменённые поля. Проверки: `scripts/check_forms_results.cjs`, `tests/followup-copy.test.cjs`; отчёт `../../audits/2026-10-22-forms-results/REPORT.md`.

Уточнение основного входа 22.10: `adaptive-ui.js/onboardingStudyFields` показывает два основных учебных состояния и раскрывает существующие исключения отдельным уточнением. `study_path` хранится только в браузерном черновике; API получает прежний `study_status`. `scripts/check_study_onboarding.cjs` проверяет восемь полных UI-прохождений, старые черновики и неизменную review-ветвь. Отчёт: `../../audits/2026-10-22-study-onboarding/REPORT.md`.

`scripts/check_preparation_flow.cjs` — F01/F04 в четырёх полных браузерных цепочках обоих вузов/RU/EN: 20 результатов и 4 въезда сохраняются через UI на synthetic localhost; после каждого результата проверяются reload, карточка/история/профиль, сохранение неизвестных дат и переход Hero после завершения. Это не реальный MAX и не ручной onboarding (начальная анкета создаётся API).

Дополнительная сверка источников: `student-copy.js` — общие `sourceTitle/sourceSection/sourceCheckedDate/sourceSummary` для текущих и исторических снимков, включая исходный заголовок раздела рядом с переводом. `student.js/sourceCard` используется карточкой и экраном проверки применимости; `student-ui.js/revisionDetails` переводит контакт и сохраняет оговорки проверки. `scripts/check_source_consistency.cjs` — 24 synthetic browser-проверки обоих вузов/RU/EN на 320/390/1280: клавиатура, reload, одинаковое содержание источников и отсутствие обрезки подписей результата. Доказательства: раздел «Дополнительная сверка источников» в `../../audits/2026-10-22-followup/REPORT.md`.

`scripts/check_source_verification.cjs` — отдельная RU/EN браузерная проверка честной маркировки недоступного первоисточника приглашения ЛЭТИ (только synthetic localhost).

Продолжение аудита: `FOLLOWUP_PLAN_2026_10_22.md` — план и оставшиеся ворота; `CONTENT_RESEARCH_2026_10_22.md` — первоисточники/ограничения; `DECISIONS_PENDING_2026_10_22.md` — предложения по модели и privacy, ещё не принятые. `app/content_evidence.py` — подтверждённые редакционные уточнения seed-каталога и честные метки проверки; `app/task_context.py` — объяснение окончательного решения движка и сохранённые даты контекста задачи, без изменения eligibility. `engine.temporal` отдаёт `calculation_status`; `student-copy.js`/`student.js` показывают причину без дублирования исходной инструкции. `student-ui.js` — группы событий, помощник выбора до открытия формы, восстановление его черновика и адресные переходы из профиля. Регрессии: `tests/test_followup_content.py`, `tests/followup-copy.test.cjs`, `scripts/check_followup_ui.cjs`. Доказательства и актуальная сверка: `../../audits/2026-10-22-followup/REPORT.md`.

Первая итерация аудита текстов: `COPY_FIXES_2026_10_22.md` — контракт изменений, сверка замечаний, реальные проверки и отложенные решения. `student-copy.js` — общий словарь существующих значений, проекция приглашения, локализованные ошибки, форматирование истории/дат и инструкции по состоянию; подключается из `index.html` перед `student-ui.js`. `error_codes.py` + `main.py` — стабильные коды HTTP/validation ошибок без удаления прежнего `detail`. `workflow.py` — ожидание по результату и ответ на вопрос; `adaptive_catalog.py` — редакция и локализация контактов, метаданные неизвестных комплектов. `main.py /api/config` отдаёт список документов опубликованного каталога для онбординга. Регрессии: `tests/copy-audit.test.cjs`, `tests/test_copy_audit.py`; браузерные доказательства — `../../audits/2026-10-21-copy-fixes/REPORT.md`.

Компактная главная: `HOME_COMPACT_2026_10_21.md`. `roadmap-view.js` — подписи ожидания, короткие подсказки и даты Hero; `student-ui.js` — Hero → маршрут → дополнение данных, совместимость старого `stages`; `scripts/check_home_compact.cjs` — локальные RU/EN проверки обоих вузов и переходов.

Подробные карточки и разделы маршрута: `TASK_STRUCTURE_2026_10_21.md`. `student.js` — структура инструкции, сроков, контактов и результата, `taskInformationView` с основанием и источниками; `student-ui.js` — открытые группы действий и маршрут `task-info` с Back/reload; `adaptive-ui.js` — подписи и кнопки результатов; `student-ui.css` — оформление. Целевой браузерный прогон: `scripts/check_task_structure.cjs` (реальный local API, два вуза, RU/EN, 320/390/1280).

Новое согласованное поведение дополнения данных: `DATA_COMPLETION_2026_10_21.md`. Реализация: `roadmap-view.js` (уникальные вопросы и отделение от Hero), `student-ui.js` (сводка, группы, одна форма), `student-ui.css`; тесты `tests/data-questions.test.cjs` и `tests/student-presentation.test.cjs`.
 Продуктовый source of truth — MASTER FINAL и принятое пользователем дополнение `developer-package-2026-10-21/`. Текущий контракт/приёмка: `ADAPTIVE_ROUTE_2026_10_21.md`. Предыдущие отчёты ниже описывают свои версии.

Исправления независимой приёмки: `QUALITY_FIXES_2026_10_21.md`; регрессии отображения Hero и прогресса — `tests/student-presentation.test.cjs` и `tests/roadmap-view.test.cjs`.

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
