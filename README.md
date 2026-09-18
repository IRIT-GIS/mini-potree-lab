Mini Potree Lab

Учебный визуализатор облака точек на базе Potree.

Для запуска необходимо установить:
- Git
- Node.js (LTS)
- Potree
- PotreeConverter

Важно для Windows — желательно использовать пути без кириллицы

Potree: https://github.com/potree/potree.git
В каталоге проекта клонировать Potree:

```bash
git clone https://github.com/potree/potree.git vendor/potree
cd vendor/potree
npm install
```

После сборки должен существовать файл:

`vendor/potree/build/potree/potree.js`

PotreeConverter: https://github.com/potree/PotreeConverter

Скачать Windows-версию и распаковать в

`vendor/PotreeConverter/`

Для Windows ожидаемый путь по умолчанию:

`vendor/PotreeConverter/PotreeConverter.exe`

Если PotreeConverter лежит в другом месте

```powershell
$env:POTREE_CONVERTER="C:\Tools\PotreeConverter\PotreeConverter.exe"
```

Если Potree находится не в `vendor/potree`:

```powershell
$env:POTREE_DIR="C:\Tools\potree"
```

Запуск Mini Potree Lab

В каталоге проекта `mini-potree-lab`:

```bash
npm install
npm start
```

Открыть:

`http://localhost:3000`

Проверка конфигурации

`http://localhost:3000/api/health`

Должно быть
```
potreeFound: true
converterFound: true
```

Ломаем систему через добавление параметра к URL:

- `http://localhost:3000/?break=low-budget` 
- `http://localhost:3000/?break=huge-budget` 
- `http://localhost:3000/?break=no-progress` 
- `http://localhost:3000/?break=no-validation` 
- `http://localhost:3000/?break=no-fit` 

Тестовые облака:
- кролик - samples/stanford_bunny.las
- тестовая сцена - samples/autzen.laz
- промзона - https://disk.yandex.ru/d/YF8MW-HqyHKRDw
