# Mini Potree Lab

Учебный визуализатор облаков точек Potree WebGL viewer

Для запуска необходимо установить:
- Git
- Node.js (LTS)
- Potree
- PotreeConverter

Potree: https://github.com/potree/potree.git
Рядом с этим проектом можно клонировать Potree:

```bash
git clone https://github.com/potree/potree.git vendor/potree
cd vendor/potree
npm install
```

Перед первым использованием должен существовать файл:

`vendor/potree/build/potree/potree.js`

PotreeConverter: https://github.com/potree/PotreeConverter

Для Windows ожидаемый путь по умолчанию:

`vendor/PotreeConverter/PotreeConverter.exe`

Если bin лежит в другом месте, задайте переменную среды `POTREE_CONVERTER`.

Пример PowerShell:

```powershell
$env:POTREE_CONVERTER="C:\Tools\PotreeConverter\PotreeConverter.exe"
```

Если сам Potree находится не в `vendor/potree`:

```powershell
$env:POTREE_DIR="C:\Tools\potree"
```

Запуск:

В каталоге `mini-potree-lab`:

```bash
npm install
npm start
```

Приложение доступно по ссылке:

`http://localhost:3000`

Принцип работы:
1. Пользователь перетаскивает `.las` или `.laz` в drop-область.
2. Браузер отправляет файл на локальный Node-сервер.
3. Node запускает PotreeConverter.
4. Converter создаёт `metadata.json` и многомасштабные данные Potree.
5. Сервер раздаёт полученный каталог по HTTP.
6. Potree загружает `metadata.json` и визуализирует облако.

Для быстрой проверки без своего LAS/LAZ нажмите «Открыть демо» — используется публичное демонстрационное облако Potree.

Ломаем систему через добавление параметра к URL:

- `http://localhost:3000/?break=low-budget` 
- `http://localhost:3000/?break=huge-budget` 
- `http://localhost:3000/?break=no-progress` 
- `http://localhost:3000/?break=no-validation` 
- `http://localhost:3000/?break=no-fit` 

Тестовые облака:
- кролик - в дереве проекта
- промзона - https://disk.yandex.ru/d/YF8MW-HqyHKRDw
