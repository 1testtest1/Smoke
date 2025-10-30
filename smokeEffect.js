(function () {
  let camera, scene, renderer, clock, gui;
  let points, geometry, material, texture;
  let clusterCenters = [];

  const params = {
    particleCount: 600,         // Количество частиц
    baseSize: 40,               // Базовый размер частиц (в пикселях)
    speed: 0.7,                 // Скорость движения
    maxOpacity: 0.35,           // Максимальная непрозрачность частиц
    globalOpacity: 1.0,         // Общая прозрачность эффекта
    fadeInSec: 2.0,             // Длительность появления (сек)
    fadeOutSec: 2.5,            // Длительность исчезновения (сек)
    lifetimeSec: 12.0,          // Полное время жизни (сек)
    spreadX: 18,                // Разброс по X
    spreadZ: 18,                // Разброс по Z
    swirlAmp: 0.3,              // Амплитуда вихря
    swirlFreq: 0.6,             // Частота вихря
    clusterCount: 6,            // Количество кластеров
    clusterRadius: 2.8,         // Радиус кластера
    layerCount: 3,              // Количество слоёв
    layerDepthStep: 3.0,        // Шаг по глубине между слоями
    zoom: 35                    // Зум камеры
  };

  function init() {
    clock = new THREE.Clock();

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = false; // один объект — сортировка не нужна
    document.body.appendChild(renderer.domElement);

    const cvs = renderer.domElement;
    cvs.style.position = 'fixed';
    cvs.style.top = '0';
    cvs.style.left = '0';
    cvs.style.width = '100%';
    cvs.style.height = '100%';
    cvs.style.zIndex = '0';
    cvs.style.pointerEvents = 'none';

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(params.zoom, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.z = 20;

    if (typeof dat !== 'undefined' && dat.GUI) {
      gui = new dat.GUI();
      gui.add(params, 'particleCount', 100, 2000, 50).name('Частиц').onChange(rebuild);
      gui.add(params, 'baseSize', 10, 120, 1).name('Размер').onChange(() => { if (material) material.uniforms.uSize.value = params.baseSize; });
      gui.add(params, 'speed', 0.1, 3, 0.1).name('Скорость');
      gui.add(params, 'maxOpacity', 0.05, 1, 0.05).name('Макс. прозрачность');
      gui.add(params, 'globalOpacity', 0.0, 1.0, 0.01).name('Прозрачность эффекта').onChange(function(v){ if(material) material.uniforms.uGlobalOpacity.value = v; });
      gui.add(params, 'fadeInSec', 0.2, 5, 0.1).name('Появление (с)');
      gui.add(params, 'fadeOutSec', 0.2, 5, 0.1).name('Исчезновение (с)');
      gui.add(params, 'lifetimeSec', 3, 30, 0.5).name('Жизнь (с)');
      gui.add(params, 'spreadX', 5, 40, 1).name('Разброс X').onChange(resetPositions);
      gui.add(params, 'spreadZ', 5, 40, 1).name('Разброс Z').onChange(resetPositions);
      gui.add(params, 'swirlAmp', 0, 1, 0.05).name('Вихрь ампл.');
      gui.add(params, 'swirlFreq', 0, 2.5, 0.05).name('Вихрь част.');
      const layersFolder = gui.addFolder('Слои');
      layersFolder.add(params, 'layerCount', 1, 7, 1).name('Кол-во слоёв').onChange(rebuild);
      layersFolder.add(params, 'layerDepthStep', 1.0, 10.0, 0.5).name('Шаг глубины').onChange(rebuild);
      gui.add(params, 'zoom', 10, 100, 1).name('Зум').onChange(function (value) {
        camera.fov = value; camera.updateProjectionMatrix();
      });
    }

    new THREE.TextureLoader().load(
      'https://s3-us-west-2.amazonaws.com/s.cdpn.io/2666677/smoke_01.png',
      function (tex) {
        texture = tex;
        build();
        window.addEventListener('resize', onWindowResize, false);
        renderer.setAnimationLoop(update);
      }
    );
  }

  function build() {
    disposeCurrent();

    const count = Math.floor(params.particleCount);

    geometry = new THREE.BufferGeometry();

    // Генерируем центры кластеров по диагонали снизу-слева -> вверх-вправо
    clusterCenters = [];
    for (let i = 0; i < params.clusterCount; i++) {
      const t = (params.clusterCount === 1) ? 0.5 : i / (params.clusterCount - 1);
      const cx = THREE.MathUtils.lerp(-params.spreadX * 0.5, params.spreadX * 0.5, t) + (Math.random() - 0.5) * 1.5;
      const cy = THREE.MathUtils.lerp(-5.5, 7.5, t) + (Math.random() - 0.5) * 1.0;
      const cz = (Math.random() - 0.5) * params.spreadZ * 0.6;
      clusterCenters.push(new THREE.Vector3(cx, cy, cz));
    }

    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const ages = new Float32Array(count);
    const lifetimes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const scales = new Float32Array(count);
    const speedMul = new Float32Array(count);
    const opMul = new Float32Array(count);
    const layerDepth = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // равномерное хаотичное распределение по всему экрану
      positions[i3 + 0] = (Math.random() - 0.5) * params.spreadX;
      positions[i3 + 1] = -6.5 + Math.random() * 16.0;
      positions[i3 + 2] = (Math.random() - 0.5) * params.spreadZ;

      // назначаем слой и применяем параллакс
      const lc = Math.max(1, Math.floor(params.layerCount));
      const layerIdx = lc === 1 ? 0 : Math.floor(Math.random() * lc);
      const t = lc === 1 ? 0 : layerIdx / (lc - 1);
      const depth = -t * params.layerDepthStep;
      positions[i3 + 2] += depth;
      layerDepth[i] = depth;

      // скорость: дрейф вправо-вверх
      velocities[i3 + 0] = 0.15 + Math.random() * 0.35;
      velocities[i3 + 1] = 0.35 + Math.random() * 0.35;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.15;

      // стартовый возраст распределяем для асинхронности
      ages[i] = Math.random() * params.lifetimeSec * 0.8;
      lifetimes[i] = params.lifetimeSec * (0.8 + Math.random() * 0.4);

      alphas[i] = 0.0;
      const baseScale = 0.7 + Math.random() * 0.6;
      const sizeMulT = THREE.MathUtils.lerp(1.0, 0.75, t);
      scales[i] = baseScale * sizeMulT;

      speedMul[i] = THREE.MathUtils.lerp(1.0, 0.6, t);
      opMul[i] = THREE.MathUtils.lerp(1.0, 0.85, t);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('age', new THREE.BufferAttribute(ages, 1));
    geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
    geometry.setAttribute('speedMul', new THREE.BufferAttribute(speedMul, 1));
    geometry.setAttribute('opMul', new THREE.BufferAttribute(opMul, 1));
    geometry.setAttribute('layerDepth', new THREE.BufferAttribute(layerDepth, 1));

    const vertexShader = `
      attribute float alpha;
      attribute float scale;
      attribute float opMul;
      varying float vAlpha;
      varying float vOpMul;

      uniform float uSize;

      void main() {
        vAlpha = alpha;
        vOpMul = opMul;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = -mvPosition.z;
        float pointSize = uSize * scale * (300.0 / max(1.0, dist));
        gl_PointSize = pointSize;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      uniform sampler2D uMap;
      uniform float uMaxOpacity;
      uniform float uGlobalOpacity;
      
      varying float vAlpha;
      varying float vOpMul;
      
      void main() {
        vec2 uv = gl_PointCoord;
        vec4 tex = texture2D(uMap, uv);
        float mask = smoothstep(0.0, 0.2, 1.0 - distance(uv, vec2(0.5)));
        float a = tex.a * vAlpha * uMaxOpacity * vOpMul * mask * uGlobalOpacity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(tex.rgb, a);
      }
    `;

    material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uSize: { value: params.baseSize },
        uMaxOpacity: { value: params.maxOpacity },
        uGlobalOpacity: { value: params.globalOpacity }
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    points = new THREE.Points(geometry, material);
    points.frustumCulled = false; // не отсекать по фрустуму, избегаем внезапных пропаж
    scene.add(points);
  }

  function disposeCurrent() {
    if (points) scene.remove(points);
    if (geometry) geometry.dispose();
    if (material) material.dispose();
    points = null; geometry = null; material = null;
  }

  function resetPositions() {
    if (!geometry) return;
    const pos = geometry.getAttribute('position');
    const layerDepthAttr = geometry.getAttribute('layerDepth');
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      pos.array[i3 + 0] = (Math.random() - 0.5) * params.spreadX;
      pos.array[i3 + 1] = -6.5 + Math.random() * 16.0;
      pos.array[i3 + 2] = (Math.random() - 0.5) * params.spreadZ + (layerDepthAttr ? layerDepthAttr.array[i] : 0);
    }
    pos.needsUpdate = true;
  }

  function rebuild() {
    build();
  }

  function update() {
    const dt = Math.min(0.033, clock.getDelta()); // ограничиваем dt для стабильности
    if (!geometry) return;

    const pos = geometry.getAttribute('position');
    const vel = geometry.getAttribute('velocity');
    const age = geometry.getAttribute('age');
    const life = geometry.getAttribute('lifetime');
    const alpha = geometry.getAttribute('alpha');
    const spMul = geometry.getAttribute('speedMul');

    const count = pos.count;

    for (let i = 0; i < count; i++) {
      // возраст
      age.array[i] += dt;

      const maxLife = life.array[i];
      const fi = Math.max(0.0, Math.min(1.0, params.fadeInSec / Math.max(0.0001, maxLife)));
      const fo = Math.max(0.0, Math.min(1.0, params.fadeOutSec / Math.max(0.0001, maxLife)));

      const t = age.array[i] / maxLife; // 0..1

      // плавная функция формы: появление и исчезновение
      const fadeIn = smoothstep(0.0, fi, t);
      const fadeOut = 1.0 - smoothstep(1.0 - fo, 1.0, t);
      const shape = Math.max(0.0, Math.min(1.0, fadeIn * fadeOut));

      // плавно аппроксимируем альфу, избегая резких скачков
      const prev = alpha.array[i];
      const target = shape;
      alpha.array[i] = prev + (target - prev) * 0.25;

      // движение
      const i3 = i * 3;
      // вихревое добавление
      const sx = Math.sin((pos.array[i3 + 1] + age.array[i]) * params.swirlFreq) * params.swirlAmp;
      const sz = Math.cos((pos.array[i3 + 1] + age.array[i]) * (params.swirlFreq * 0.8)) * params.swirlAmp;

      // базовый ветер вправо-вверх
      const windX = 0.25;
      const windY = 0.35;

      const k = spMul ? spMul.array[i] : 1.0;
      pos.array[i3 + 0] += (vel.array[i3 + 0] + windX + sx) * params.speed * k * dt;
      pos.array[i3 + 1] += (vel.array[i3 + 1] + windY) * params.speed * k * dt;
      pos.array[i3 + 2] += (vel.array[i3 + 2] + sz) * params.speed * k * dt;

      // перерождение
      if (age.array[i] >= maxLife || pos.array[i3 + 1] > 10) {
        age.array[i] = 0.0;
        life.array[i] = params.lifetimeSec * (0.8 + Math.random() * 0.4);

        // равномерный респавн по экрану (с сохранением глубины точки)
        const depth = geometry.getAttribute('layerDepth') ? geometry.getAttribute('layerDepth').array[i] : 0;
        pos.array[i3 + 0] = (Math.random() - 0.5) * params.spreadX;
        pos.array[i3 + 1] = -6.5 + Math.random() * 16.0;
        pos.array[i3 + 2] = (Math.random() - 0.5) * params.spreadZ + depth;

        vel.array[i3 + 0] = 0.15 + Math.random() * 0.35;
        vel.array[i3 + 1] = 0.35 + Math.random() * 0.35;
        vel.array[i3 + 2] = (Math.random() - 0.5) * 0.15;

        // мягкий старт альфы
        alpha.array[i] = 0.0;
      }
    }

    pos.needsUpdate = true;
    age.needsUpdate = true;
    life.needsUpdate = true;
    alpha.needsUpdate = true;

    // обновление униформ
    if (material) {
      material.uniforms.uMaxOpacity.value = params.maxOpacity;
      material.uniforms.uSize.value = params.baseSize;
      material.uniforms.uGlobalOpacity.value = params.globalOpacity;
    }

    renderer.render(scene, camera);
  }

  // GLSL smoothstep аналог в JS (для читаемости формулы)
  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
    return t * t * (3.0 - 2.0 * t);
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  if (typeof THREE !== 'undefined') {
    if (document.readyState !== 'loading') init();
    else document.addEventListener('DOMContentLoaded', init);
  }

  window.SmokeFX = { params };
})();
