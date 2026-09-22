# Финансово-экономическая модель

Репозиторий новой модели по отдельным договорам с последующей консолидацией по подрядчикам и портфелю.

## Исходные документы

- `data/sources/boq.xlsx`
- `data/sources/ksg.xlsx`
- `data/sources/personnel.xlsx`
- `data/sources/equipment.xlsx`
- `data/sources/primary_documents.xlsx`
- `data/sources/payments.xlsx`
- `data/sources/factoring.xlsx`

Настройки привязки находятся в `config/source-mapping.json`. Описание принципов загрузки — в `docs/source-integration.md`.

Excel-файлы содержат зафиксированные значения исходных листов. Межлистовые формулы исходной расчётной книги намеренно не перенесены.
