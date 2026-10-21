# Адаптивный маршрут — контракт и реализация

Задание: `developer-package-2026-10-21/`, база `61d07d91edc75bc02f9737234aac7b26de12a889` плюс сохранённые незакоммиченные изменения ревью 20.10. Основная реализация проверена локально; затем по отдельному запросу пользователя опубликована 21.10.2026. Коммит не создавался.

## Контракт до реализации

- `Profile.study_status` получает `admitted` отдельно от `active`. `arrival_status=arrived` без даты выбирает уточнение въезда, но не создаёт событие. `campus_id=main` остаётся конфигурацией пилота.
- M01 декомпозируется на стабильные семантические правила приглашения, визы и поездки; семейства M01–M10 сохраняются. Старый completed общей M01 остаётся в истории и не копируется дочерним задачам.
- `workflow_reports`: отдельный журнал self-report результатов с процессом, эпизодом/циклом, outcome, nullable `occurred_at`, временем записи и provenance. Подача, частичный комплект, вопрос и получение различаются. Неизвестное время прошлого не заменяется временем записи или expiry.
- `POST /api/me/onboarding`: атомарное сохранение подтверждённой сводки, согласия, исходных результатов и пересчёта; идемпотентный ключ. Старый PATCH профиля остаётся совместимым.
- `POST /api/me/tasks/{task_key}/results`: результат текущего процесса; сервер проверяет доступность и зависимости. Явный результат вне сервиса допускает подтверждение предыдущего выполнения без выдуманных промежуточных результатов.
- `GET /api/me/results`, `DELETE /api/me/results/{id}` и исправление через `supersedes_report_id`: история не стирается. Отмена зависимого основания требует пересмотра зависимых результатов, независимые сохраняются.
- `workflow_status` и `availability` отделены от `engine_status` и совместимого `user_status`. Сервер задаёт доступные result actions, причину будущего шага, stage и приоритет Hero; JS только отображает.
- Получение визы/регистрации может иметь неизвестные даты выдачи и окончания. Получение сохраняется; отсутствующий срок уточняется отдельно. Старые typed events сохраняют строгую валидацию.
- Дополнительная SQLite-миграция только создаёт таблицы. Старые события, task keys, статусы и immutable source snapshots сохраняются. Новая версия seed не переписывает прежнюю.
- Демонстрационные overrides нормализуют только явно перечисленные unspecified интервалы; сохраняются исходная единица/текст и `demo_assumption`. Без проверенного рабочего календаря вычисленная дата отсутствует.
- RU/EN, существующие стили/timeline/навигация/MAX Back сохраняются. Черновик онбординга v3 сохраняет старые ответы и запрашивает недостающее.

## Проверка источников 21.10.2026

- СПбГУПТД: https://prouniver.ru/foreign/visa/ — доступны разделы «До въезда. Оформление приглашения», «Порядок въезда в РФ», «Миграционный учет», «Продление срока временного пребывания», «Контакты отдела регистрации и виз».
- ЛЭТИ: https://new.etu.ru/ru/home/international/po-priezde — проверено в браузере. Раздел «В течение первых суток со дня прибытия в Санкт-Петербург»; отдел по работе с иностранными учащимися, кабинет 3423-1; копии паспорта, миграционной карты, визы при наличии, направления/контракта/договора кроме I курса. Прибытие в город не равно пересечению границы.
- Консульство для первичной визы выбирает студент по месту подачи. Университет помогает с приглашением; универсальный URL выдачи виз не добавляется.
- Проверка навигации не подтверждает персональную юридическую применимость. Федеральные unknown/review и прежние источники сохраняются.

## Реализованный контракт

### Факты и результаты

`Profile.study_status=admitted` означает подтверждённое поступление до начала занятий. Поле `preparation_state=unknown/not_started` различает неизвестную готовность и явный ответ «не начинал». Остальная готовность выводится из результатов. Кампус по умолчанию `main`, отдельного вопроса о нём нет. Часовой `arrival_at` ЛЭТИ — прибытие в Санкт-Петербург в МСК, может быть позже календарного `entry_at`.

`workflow_reports` хранит неизменяемые записи `id/user_id/task_key/process/episode_id/cycle_id/outcome/occurred_at/recorded_at/body/dependencies/idempotency_key/supersedes_report_id/retracted_at`. `body` включает исходный запрос, provenance и исходный цикл. Время записи не заменяет неизвестную дату процедуры. Исправление добавляет запись; отмена помечает запись, не удаляя её. В истории UI дата сообщения и неизвестная дата результата показаны отдельно.

| Процесс | Результаты | Последствие |
|---|---|---|
| invitation | requested / received | Запрос → ожидание; получение открывает первичную визу |
| initial_visa | submitted / received | Подача → ожидание; получение открывает поездку, expiry может быть неизвестной |
| trip | completed с documents/arrival/housing | Подготовка завершена; въезд не создаётся |
| entry_context | профиль либо отдельное entry_recorded | Неизвестная дата → точечное уточнение; первый фактический въезд → форма события |
| documents | completed / question | Успешная проверка либо вопрос с needs_review |
| office | partial / completed | Остаток комплекта сохранён индексами в списке документов; частичная передача не завершает действие |
| registration | submitted / received | Ожидание либо получение в эпизоде проживания; без фиктивной expiry |
| visa_renewal / registration_renewal | submitted / received | Подача не меняет документ; получение создаёт новый цикл и закрывает прежнее действие |
| consultation | question_sent / clarified | Вопрос и ответ не подтверждают применимость и не завершают правовую процедуру |

Вопрос/ответ также доступны как безопасные результаты неопределённых задач. `external_result=true` явно сообщает уже состоявшийся результат вне сервиса и не создаёт промежуточных отметок. Зависимости обычного потока проверяются сервером. Полученная заранее виза не создаёт фиктивное приглашение. Указание «уже в России» без даты делает прежнюю неподтверждённую подготовку прошлой, но не completed. Передача комплекта и оформление регистрации параллельны.

Отмена/исправление основания оставляет зависимый результат с `requires_recheck`; прежний цикл с таким результатом остаётся видимым для проверки. Независимые записи не откатываются snapshot-ом. Если исправление отменено, предыдущая запись вновь участвует в проекции. Для изменения текущего срока используется именно текущий receipt, а не старая дата базового профиля. Базовая дата документа при этом сохраняется, чтобы не потерять исходный цикл продления. GET/PATCH profile возвращает базовый профиль, а актуальные даты документов и receipt ID берутся из effective_profile roadmap; UI использует этот слой. Повторное уточнение того же срока не создаёт новую запись.

### API

| Метод | Запрос/ответ |
|---|---|
| POST `/api/me/onboarding` | `profile`, `preparation`, `office_package`, `registration`, `confirmed=true`, `idempotency_key`; одна транзакция сохраняет профиль/результаты/revision/outbox и receipt. Повтор с тем же телом возвращает прежнюю revision; другое тело с тем же ключом → 409 |
| GET `/api/me/results` | Собственный журнал результатов, включая исправления и отмены |
| POST `/api/me/tasks/{task_key}/results` | `outcome`, nullable `occurred_at/document_expiry`, `checklist`, `missing_documents`, `external_result`, `confirmed=true`, `idempotency_key`, optional `supersedes_report_id`; ответ `result_id/created/revision_id/verification=user_attested` |
| DELETE `/api/me/results/{id}` | Идемпотентная отмена своей активной записи; возврат к предыдущему состоянию через reducer |
| PATCH `/api/me/profile?fields=entry_at` | Опциональный whitelist изменяемых полей. UI посылает совместимый Profile и явно выбранные имена. Без `fields` сохраняется прежний полный контракт. Уточнение expiry создаёт correction receipt в той же транзакции |
| GET `/api/me/roadmap` | Дополнительно `hero_task_key`; задачи содержат process, presentation_stage, availability, workflow_status, result_actions, valid_result_outcomes, priority_rank, основание будущего шага и сведения результата |

Известный результат не требует выдумывать дату. Старые typed `visa_issued/registration_confirmed` сохраняют строгую обязательную expiry и закрывают соответствующий прежний цикл; альтернативный receipt endpoint допускает её отсутствие. Входные enum и параметры добавлены в `openapi.json` (27 paths); опубликованный API до выкладки этой версии не меняется.

### Приоритет, сроки и уведомления

Порядок Hero: доступное просроченное подтверждённое действие → доступное действие с известным окончанием документа в пределах существующего окна внимания 30 календарных дней → уточнение фактического въезда → прочие доступные действия → ожидание → прочая неопределённость. Внутри группы сохраняются priority bucket, ближайшая дата действия, стабильный route order и task key. Окончание документа остаётся `document_expiry`, не превращается в дату подачи и не создаёт countdown. Ожидающая заявка не становится срочной повторной подачей из-за прежнего срока. Результат ранжирования общий для Hero и списков; внутри раздела также сохранена последовательность реальных зависимостей.

M07/M08 находятся в разделе учёбы и могут стать Hero раньше него. Раздел учёбы становится текущим после основных действий прибытия, даже если медпроцедура требует проверки; она остаётся видимой, весь раздел прибытия не объявляется выполненным. Будущие/неопределённые шаги не дают ложного полного прогресса.

Только три seed-интервала получили demo override: СПбГУПТД M03 +2 unspecified → working; ЛЭТИ M07/M08 −45 unspecified → working. Сохраняются `original_spec`, `unit_original`, `unit_effective`, `unit_basis=demo_assumption`, `counting_convention=exclude_anchor`, nullable calendar_version. Это допущение задания, не новое утверждение источника. Календарные сроки и часы не заменены. Без проверенного календаря/якоря показывается буквальный интервал. Тестовый календарь проверяет пятницу→вторник, праздник, рабочую субботу, отрицательный сдвиг и неполное покрытие; он не используется как производственный.

Reminders не создаются/не отправляются для будущих, прошлых и ожидающих задач. Изменение плана использует прежний transaction/outbox. Ошибка транзакции не оставляет результат, revision или outbox; повтор успешного запроса не дублирует их.

### Миграция и совместимость

- Миграция additive: две таблицы и индекс; старые события/задачи/версии не переписываются. Seed создаёт новые версии; immutable source snapshots прежних действий остаются.
- Каталог содержит 26 актуальных seed rules: по 13 на вуз, в рамках прежних десяти семейств. Старую общую M01 движок исключает при наличии дочерних правил. Её прежнее completed остаётся в истории, не копируется дочерним задачам.
- Старые ручные статусы M02–M10 совместимы и сохраняются, но не становятся фактами выдачи документа. Новые M01/entry-context и будущие/прошлые действия нельзя завершать generic status endpoint-ом. Текущий UI использует конкретные результаты.
- Данные результата переживают reload и новый экземпляр backend. Черновик первого входа v3 переносит известные старые ответы, запрашивая недостающее. Hidden ответы другой ветки не попадают в подтверждаемую сводку и запрос.
- Preview/publish/archive правил, составные сроки/триггеры и tenant isolation проверены прежним regression suite. Для редакторских правил добавлены поля раздела источника и RU/EN назначения ссылки.
- Изменены две прежние проверки по согласованному поведению: `test_activation_profile` теперь ожидает изменение доступности после arrived без выдуманного события; `test_persistence` использует фактический размер расширенного seed. Старые browser scripts `check_student_ui` и `check_activation_ui` привязаны к четырём вопросам и отмечены историческими в CODE_MAP; их текущую область покрывают adaptive/welcome/layout/review.

## Приёмка 21.10.2026

База checkout: `61d07d91edc75bc02f9737234aac7b26de12a889`, плюс сохранённые изменения ревью 20.10 и данная реализация; commit не создавался. Fingerprint реализации/тестов/скриптов/OpenAPI: `b6b4083526d8cd65d973e1ce9c4cbe2dc434875b1fc39622b1e8519a2951329b`; перечень файлов — `../output/adaptive-route/checkout.json`. Документация в fingerprint не входит. Первичная приёмка использовала локальный API `127.0.0.1:8011`, отдельную синтетическую SQLite и выключенный MAX transport. После отдельного запроса пользователя выполнена публичная выкладка и проверка — см. раздел ниже и DEPLOYMENT.md.

Обозначения доказательств: **A** — `tests/test_adaptive_route.py`; **B** — `scripts/check_adaptive_ui.cjs`; **V** — `tests/roadmap-view.test.cjs`; **L** — `scripts/check_student_layout.cjs`; **W** — `scripts/check_welcome_ui.cjs`; **R** — `scripts/check_review_ui.cjs` + `tests/test_review_regressions.py`. PASS относится к указанной проверке, не к внешнему согласованию вузом или работе на физическом телефоне.

| ID | Статус | Доказательство |
|---|---|---|
| F01 | PASS | A full_preparation для sutd/leti; B полный реальный API/UI путь |
| F02 | PASS | A visa_ready: приглашение не completed, Hero поездки |
| F03 | PASS | A visa_free; engine проверяет study_form СПбГУПТД, визовые задачи исключены |
| F04 | PASS | A/B trip checklist: entry_at остаётся null; отдельное событие |
| F05 | PASS | A/B поздний arrived без подготовки; прошлые шаги без выдуманного completed |
| F06 | PASS | A/B неизвестный entry_at → один нужный вопрос, нет фиктивного срока |
| F07 | PASS | A late_entry с известной/неизвестной датой, B LETI; офис/receipt сохранены |
| F08 | PASS | A/B partial office и список оставшегося, статус in_progress |
| F09 | PASS | A/B регистрация submitted → waiting; receipt отдельно |
| F10 | PASS | A/B receipt с null expiry; отдельная валидная форма срока |
| F11 | PASS | A параметризованные minor/leave/rvpo/other purpose; нет стандартных сроков |
| F12 | PASS | A documents question → needs_review, результат не completed; карточка содержит контакт/подсказку вопроса |
| F13 | PASS | A/B независимая регистрация при partial office; server 409 на преждевременную обычную подачу визы |
| F14 | PASS | A cross_stage/overdue, V: срочный renewal из study выше анкеты и ожидания |
| F15 | PASS | A available/future dependencies; B экран раздела; текст причины в workflowControls |
| F16 | PASS | V open medical review: study current, review видим, arrival не fully done |
| F17 | PASS | A новый адрес/отмена/рестарт; прежние engine/event tests для повторного въезда |
| F18 | PASS | A renewal cycle + typed issuance/retract; подача не receipt, старый цикл сохранён |
| D01 | PASS | A injected rollback и один outbox/revision при replay; B потерянный успешный onboarding response |
| D02 | PASS | A correction/undo office с независимой регистрацией; зависимая visa и orphaned renewal требуют recheck; R исправления событий |
| D03 | PASS | A legacy aggregate completed M01 → superseded, дети not_started |
| D04 | PASS | A новый экземпляр приложения с той же SQLite; B reload истории; W новая авторизация/смена токена модельного MAX |
| D05 | PASS | R реальный local API preview/publish/version/archive для обоих вузов; server outbox regression tests |
| U01 | PASS | Снимок 01-plan и B/L: прежний Hero/timeline, задачи внутри отдельных разделов |
| U02 | PASS | B Plan→stage→task→Back и reload origin; W browser Back/Forward и модельный MAX Back |
| U03 | PASS | B single-field registration_expiry/entry_at; без повторного onboarding |
| U04 | PASS | B отмена заполненной формы: reports/history полностью совпадают до/после |
| U05 | PASS | L 476 RU/EN геометрий 320–2560, 44px, контраст Hero 5.81:1; B Tab focus, W heading focus/reduced motion. Нативная клавиатура телефона отдельно не тестировалась |
| U06 | NOT RUN | Настоящие MAX mobile/web и реальные доставка/Back/deep links этой версии не запускались. W/R проверяют только модельные WebApp/auth responses |
| C01 | PASS | Контент 26 seed rules просмотрен в app/adaptive_catalog.py/catalog.py; task/detail показывает исполнителя, действие, комплект/уточнение, результат, CTA, помощь и контакт; B/L карточки обоих вузов |
| C02 | PASS | Прямые страницы SUTD/LETI проверены 21.10; в snapshot реальные section_label/purpose. Для LETI ссылка на первый приём честно обозначена как контакт для уточнения другой процедуры |
| C03 | PASS | initial_visa: подача и выдача в консульстве; вуз помогает с приглашением; универсальная неподтверждённая ссылка не добавлялась |
| T01 | PASS | A exactly three overrides; original_spec/unit_basis сохранены внутри правил |
| T02 | PASS | A часы ЛЭТИ не изменены; существующие calendar deadlines проходят regression suite |
| T03 | PASS | A synthetic calendar: пятница +2 рабочих = вторник; праздник/перенос/обратный сдвиг |
| T04 | PASS | A working computed_at отсутствует без проверенного календаря; unknown entry/arrival не дают выдуманной даты |
| T05 | PASS | A/V отдельный document_expiry и practical date; known expiry привлекает внимание без подмены срока подачи |

### Команды и результаты

```powershell
.venv/Scripts/python.exe -m pytest -q
# 75 passed; одно upstream DeprecationWarning Starlette/AnyIO
node --test tests/roadmap-view.test.cjs
# 8 passed
node --check app/static/adaptive-ui.js
node --check app/static/student.js
node --check app/static/student-ui.js
node --check app/static/admin.js

.venv/Scripts/python.exe scripts/preview_redesign.py --port 8011 --database .local/adaptive-acceptance.sqlite3
# В другой сессии, с установленным playwright:
$env:UI_BASE_URL='http://127.0.0.1:8011'
node scripts/check_adaptive_ui.cjs
node scripts/check_welcome_ui.cjs
node scripts/check_review_ui.cjs
$env:LAYOUT_OUTPUT='output/adaptive-layout'
node scripts/check_student_layout.cjs
# Все PASS. Layout: 476 проверок, 0 findings/page errors.
```

В среде Codex `PLAYWRIGHT_MODULE` указывает на bundled node_modules/playwright. Схема экспортирована через `scripts/export_api.py` с отдельным DATABASE_PATH `.local/openapi-adaptive.sqlite3` и отключённым транспортом. Синтаксис JS и `git diff --check` проходят.

### Скриншоты и визуальная проверка

- [План](../output/adaptive-route/01-plan.png)
- [Раздел до приезда](../output/adaptive-route/02-stage.png)
- [Карточка действия](../output/adaptive-route/03-action.png)
- [Точечное уточнение](../output/adaptive-route/04-clarification.png)
- [История](../output/adaptive-route/05-history.png)
- [Поздний вход ЛЭТИ](../output/adaptive-route/06-late-entry.png)
- Результаты: `output/adaptive-route/checks.json`, `output/adaptive-layout/report.json`; матрица снимков RU/EN — в `output/adaptive-layout/`.

Все шесть основных снимков просмотрены. Длинные full-page снимки фиксируют sticky/fixed навигацию в позиции текущего viewport; её достижимость и положение относительно frame отдельно проверены layout script. Генерируемые файлы output игнорируются Git и Docker.

Использован skill make-interfaces-feel-better, режим **full**, область: изменённый student flow; vanilla JS и существующий plain CSS. Админка проверена функционально; новая визуальная система не вводилась.

| Категория | Что просмотрено | Результат |
|---|---|---|
| Typography | Новый RU/EN copy, summary, workflow buttons; снимки 320/390/desktop и L | Переносы без переполнения; summary допускает длинные значения |
| Surfaces | Существующие shell/card/sheet, новые summary rows, результат и кнопки; L | Сохранён frame и стиль; 44px, диалоги в viewport |
| Animations | Существующий CSS welcome/reduced-motion, W; формы при input, loading/error/retry | Новые анимации не добавлены; reduced motion проходит. Ручной 10%-speed replay не выполнялся |
| Icons | Существующие icon() SVG в task/stage/summary, reviewed screenshots | Повторно используется один набор currentColor, новых ассетов нет |
| Performance | Diff plain CSS/JS, запросы B; нет библиотек/новых motion effects | Нового transition:all/will-change нет; performance trace не снимался |

| Severity | Location | Before | After | Why |
|---|---|---|---|---|
| MEDIUM | app/static/student-ui.css:281 | Не было размещения подтверждаемой сводки | Строки dt/dd с отступами и overflow-wrap | Читаемая типографика на узком экране |
| MEDIUM | app/static/student-ui.css:285 | Новые длинные результатные CTA не имели отдельного flex поведения | Перенос текста и строк кнопок, min-height 44px | Touch target и отсутствие горизонтального переполнения |

Рассмотрено и отклонено: перенос стилей/аккордеонов прототипа — конфликтует с требованием сохранить нынешний План; новая анимация каждой смены результата — повторяющееся действие уже имеет текстовый статус/diff, дополнительное движение не помогает. Карточки и существующие тени/иконки сохранены после проверки, без косметической переработки ради самой переработки.

## Ограничения и следующий внешний этап

- Реальный MAX mobile/web, физическая клавиатура телефона и доставка новых workflow-уведомлений не подтверждены этой локальной приёмкой. Модельные MAX tests не заменяют их.
- Рабочий календарь production не подключён; для working-интервалов остаётся честный текст. Demo overrides не выдаются за подтверждённую трактовку вузов.
- Федеральные нормы, исключения по гражданству и особые основания по-прежнему требуют подтверждения применимости; заполненный профиль/ответ отдела не снимает review автоматически.
- Пользовательское исследование понятности и независимая профессиональная вычитка RU/EN не проводились; контент проверен по доступным источникам и требованиям пакета.
- Пакет developer-package сохранён как исходное задание, исключён из Docker-контекста. Временный failure screenshot удалён после успешного прогона. Предыдущие пользовательские изменения и артефакты ревью сохранены. Коммит не выполнялся; последующая выкладка описана ниже.


## Последующая выкладка по запросу пользователя

21.10.2026 опубликовано на https://max.market-kit.ru, релиз `adaptive-20261021T143027Z`. Backup, manifest, контроль соседних контейнеров и ограничения отката — DEPLOYMENT.md. Публичные adaptive/welcome сценарии и 476 layout checks прошли; API-путь обоих вузов, replay, регистрация без expiry и targeted correction проверены на своих удаляемых demo-профилях.

В публичной проверке найден и исправлен случай LETI после отдельного entry_recorded: неизвестное время города в событии скрывало уточнение профиля. Добавлен server-managed `Profile.arrival_at_episode_id`; PATCH arrival_at привязывает его к текущему въезду, reducer применяет уточнение только в этом эпизоде. Новый въезд не наследует старое время даже в тот же день. Дата до текущего въезда отвергается. Прямое изменение scope клиентом игнорируется. Новый regression test покрывает первое уточнение, повторный въезд и повторное уточнение. Итог: 75 backend tests PASS; прежние 8 presentation tests и UI проверки остаются актуальными, UI этим исправлением не менялся.

Окончательная публичная API-проверка — `.local/adaptive-public-verification.json`, снимки — `output/adaptive-deployed/`, responsive report — `output/adaptive-layout-deployed/report.json`. Реальный MAX mobile/web по-прежнему NOT RUN; публичный браузер не заменяет эту проверку.
