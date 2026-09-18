(() => {
  const params = new URLSearchParams(location.search);
  const breakMode = params.get('break') || '';
  const $ = id => document.getElementById(id);
  const status = $('status');
  const details = $('details');
  const progress = $('progress');
  const dropZone = $('dropZone');
  const fileInput = $('fileInput');
  const modeBadge = $('modeBadge');

  const MODES = {
    'low-budget': 'Нарушено качество визуализации: слишком низкий point budget',
    'huge-budget': 'Нарушено быстродействие: чрезмерный point budget',
    'no-progress': 'Нарушена обратная связь: скрыт статус длительной операции',
    'no-validation': 'Нарушена валидация: интерфейс принимает любой файл',
    'no-fit': 'Нарушено первое отображение: камера не наводится на облако'
  };

  if (MODES[breakMode]) {
    modeBadge.hidden = false;
    modeBadge.textContent = `Учебный режим: ${MODES[breakMode]}`;
  }

  if (breakMode === 'no-validation') {
    fileInput.removeAttribute('accept');
  }

  const renderArea = $('potree_render_area');
  const viewer = new Potree.Viewer(renderArea);

  viewer.setEDLEnabled(false);
  viewer.setFOV(60);
  viewer.setBackground('gradient');
  viewer.setPointBudget(
    breakMode === 'low-budget' ? 50_000 :
    breakMode === 'huge-budget' ? 20_000_000 :
    1_000_000
  );
  viewer.loadSettingsFromURL();
  viewer.loadGUI(() => {
    viewer.setLanguage('en');
    viewer.setDescription('Учебный визуализатор облаков точек');
  });

  function forceViewerResize() {
    const rect = renderArea.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    if (viewer.renderer && (viewer.renderer.domElement.width !== width || viewer.renderer.domElement.height !== height)) {
      viewer.renderer.setSize(width, height, false);
    }

    const camera = viewer.scene && viewer.scene.getActiveCamera ? viewer.scene.getActiveCamera() : null;
    if (camera) {
      camera.aspect = width / height;
      if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();
    }
  }

  requestAnimationFrame(() => requestAnimationFrame(forceViewerResize));
  window.addEventListener('resize', forceViewerResize);
  if (window.ResizeObserver) {
    new ResizeObserver(forceViewerResize).observe(renderArea);
  }

  function setStatus(text, extra = '') {
    if (breakMode === 'no-progress' && /конверт/i.test(text)) return;
    status.textContent = text;
    details.textContent = extra;
  }

  async function health() {
    try {
      const r = await fetch('/api/health');
      const h = await r.json();
      if (!h.potreeFound || !h.converterFound) {
        setStatus('Окружение настроено не полностью.',
          `Potree: ${h.potreeFound ? 'OK' : 'НЕ НАЙДЕН'}\nPotreeConverter: ${h.converterFound ? 'OK' : 'НЕ НАЙДЕН'}`);
      } else {
        setStatus('Готово. Перетащите LAS/LAZ или откройте демонстрационное облако.');
      }
    } catch (e) {
      setStatus('Не удалось проверить сервер.', e.message);
    }
  }

  function validateClient(file) {
    if (breakMode === 'no-validation') return true;
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['las', 'laz'].includes(ext)) {
      setStatus('Файл отклонён.', 'Допускаются только LAS/LAZ.');
      return false;
    }
    return true;
  }

  function loadCloud(url, name, options = {}) {
    setStatus('Загружаю подготовленное облако…');
    Potree.loadPointCloud(url, name, e => {
      const pointcloud = e.pointcloud;
      pointcloud.material.size = 1;
      pointcloud.material.pointSizeType = Potree.PointSizeType.ADAPTIVE;
      viewer.scene.addPointCloud(pointcloud);
      forceViewerResize();
      if (breakMode !== 'no-fit') {
        if (options.view && viewer.scene && viewer.scene.view && viewer.scene.view.setView) {
          viewer.scene.view.setView(options.view.position, options.view.target);
        } else {
          viewer.fitToScreen(0.8);
          setTimeout(() => { forceViewerResize(); viewer.fitToScreen(0.8); }, 250);
        }
      }
      setStatus('Облако загружено.', `Источник: ${name}\nPoint budget: ${viewer.getPointBudget().toLocaleString('ru-RU')}`);
      dropZone.style.display = 'none';
    });
  }

  async function uploadAndConvert(file) {
    if (!validateClient(file)) return;
    setStatus('Конвертирую облако в многомасштабный формат Potree…', file.name);
    if (breakMode !== 'no-progress') {
      progress.hidden = false;
      progress.removeAttribute('value');
    }

    const form = new FormData();
    form.append('cloud', file);
    try {
      const r = await fetch('/api/convert', { method: 'POST', body: form });
      const data = await r.json();
      if (!r.ok) {
        const extra = data.details ? `\n\n${data.details}` : '';
        const code = data.exitCode !== undefined && data.exitCode !== null ? ` (exit code ${data.exitCode})` : '';
        throw new Error(`${data.error || 'Ошибка конвертации'}${code}${extra}`);
      }
      progress.hidden = true;
      loadCloud(data.metadataUrl, data.name || file.name);
    } catch (e) {
      progress.hidden = true;
      setStatus('Не удалось обработать файл.', e.message);
    }
  }

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) uploadAndConvert(file);
  });
  ['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, e => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  }));
  dropZone.addEventListener('drop', e => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) uploadAndConvert(file);
  });

  $('demoBtn').addEventListener('click', () => {
    loadCloud('/demo/eclepens/metadata.json', 'Potree Eclepens demo', {
      view: {
        position: [285.377, -820.884, 409.188],
        target: [84.116, -3.442, -24.020]
      }
    });
  });
  $('resetBtn').addEventListener('click', () => location.href = location.pathname + (breakMode ? `?break=${encodeURIComponent(breakMode)}` : ''));

  health();
})();
