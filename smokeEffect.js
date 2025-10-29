(function () {
  let camera, scene, renderer, particles = [], clock, control, gui;
  const assetPath = 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/2666677/';

  const params = {
    layers: 7,                  // Количество слоев
    particlesPerLayer: 82,      // Частиц на слой
    speed: 1.5,                 // Скорость
    opacity: 0.15,              // Прозрачность
    scale: 1.4,                 // Масштаб
    spreadX: 22,                // Распределение X
    spreadZ: 31,                // Распределение Z
    spiralSpeed: 0.1,           // Скорость спирали
    zoom: 26                    // Зум камеры
  };

  function init() {
    clock = new THREE.Clock();

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    // Расположим канвас как фоновый слой и отключим взаимодействие
    const cvs = renderer.domElement;
    cvs.style.position = 'fixed';
    cvs.style.top = '0';
    cvs.style.left = '0';
    cvs.style.width = '100%';
    cvs.style.height = '100%';
    cvs.style.zIndex = '0';
    cvs.style.pointerEvents = 'none';
    cvs.style.display = 'block';

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(params.zoom, window.innerWidth / window.innerHeight, 1, 100);
    camera.position.z = 15;

    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(-1, 0, 1);
    scene.add(light);

    if (THREE.OrbitControls) {
      control = new THREE.OrbitControls(camera, renderer.domElement);
      control.enableZoom = false;
    }

    if (typeof dat !== 'undefined' && dat.GUI) {
      gui = new dat.GUI();

      gui.add(params, 'layers', 1, 10, 1).name('Количество слоев').onChange(resetParticles);
      gui.add(params, 'particlesPerLayer', 10, 200, 1).name('Частиц на слой').onChange(resetParticles);
      gui.add(params, 'speed', 0.1, 3, 0.1).name('Скорость');
      gui.add(params, 'opacity', 0, 1, 0.05).name('Прозрачность').onChange(updateMaterial);
      gui.add(params, 'scale', 0.5, 3, 0.1).name('Масштаб').onChange(updateMaterial);
      gui.add(params, 'spreadX', 5, 50, 1).name('Распределение X').onChange(resetParticles);
      gui.add(params, 'spreadZ', 5, 50, 1).name('Распределение Z').onChange(resetParticles);
      gui.add(params, 'spiralSpeed', 0.1, 3, 0.1).name('Скорость спирали');
      gui.add(params, 'zoom', 10, 100, 1).name('Зум камеры').onChange(function (value) {
        camera.fov = value;
        camera.updateProjectionMatrix();
      });

      // Кнопки для сохранения и загрузки параметров
      gui.add({ saveSettings: saveSettings }, 'saveSettings').name('Сохранить настройки');
      gui.add({ loadSettings: loadSettings }, 'loadSettings').name('Загрузить настройки');
    }

    createParticles();

    window.addEventListener('resize', onWindowResize, false);
    renderer.setAnimationLoop(update);

    // Загружаем параметры из localStorage (если они есть)
    loadSettings();
  }

  function createParticles() {
    particles.forEach(function (p) { scene.remove(p); });
    particles = [];

    const tex = new THREE.TextureLoader().setPath(assetPath).load('smoke_01.png');
    const geometry = new THREE.PlaneGeometry(5, 5);

    // Вектор направления для движения частиц (в правый верхний угол)
    const direction = new THREE.Vector3(1, 1, 0); // Направление вверх и вправо (по диагонали)

    for (let l = 0; l < params.layers; l++) {
      for (let i = 0; i < params.particlesPerLayer; i++) {
        const material = new THREE.MeshLambertMaterial({
          color: 0xffffff,
          depthWrite: false,
          map: tex,
          transparent: true,
          opacity: 0, // Начальная прозрачность = 0 (частица полностью невидима)
          blending: THREE.AdditiveBlending
        });

        const particle = new THREE.Mesh(geometry, material);
        const angle = Math.random() * Math.PI * 2;

        particle.position.set(
          (Math.random() - 0.5) * params.spreadX,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * params.spreadZ - l * 5
        );

        // Добавляем направление для движения частиц
        particle.userData = {
          speedY: 0.5 + Math.random() * 0.5,
          rotSpeed: (Math.random() - 0.5) * 0.6,
          angle: angle,
          layer: l,
          opacityTarget: params.opacity * (0.8 + Math.random() * 0.2), // Целевая непрозрачность
          direction: direction.clone().normalize(), // Направление частиц
          fadeSpeed: 0.005 // Уменьшаем скорость увеличения прозрачности для более медленного эффекта
        };

        const s = params.scale * (0.8 + Math.random() * 0.4);
        particle.scale.set(s, s, s);

        scene.add(particle);
        particles.push(particle);
      }
    }
  }

  function resetParticles() {
    createParticles();
  }

  function updateMaterial() {
    particles.forEach(function (p) {
      p.userData.opacityTarget = params.opacity * (0.8 + Math.random() * 0.2);
      const scale = params.scale;
      p.scale.set(scale, scale, scale);
    });
  }

  function update() {
    const dt = clock.getDelta();

    particles.forEach(function (p) {
      let targetOpacity = p.userData.opacityTarget;

      // Плавное увеличение прозрачности при создании
      if (p.material.opacity < targetOpacity) {
        p.material.opacity += p.userData.fadeSpeed * dt; // Увеличиваем прозрачность с медленной скоростью
      }

      // Плавное исчезновение, если частица уходит за пределы
      if (p.position.y > 10) {
        targetOpacity = 0;  // Если частица уходит за пределы, уменьшаем прозрачность
      }

      // Плавное изменение прозрачности с использованием линейной интерполяции
      p.material.opacity = THREE.MathUtils.lerp(p.material.opacity, targetOpacity, 0.05); // Используем медленный lerp для плавного перехода

      // Плавное перемещение частицы
      const movement = p.userData.direction.clone().multiplyScalar(dt * params.speed);

      // Плавное движение частиц в одну сторону
      p.position.add(movement);

      p.userData.angle += dt * 0.5 * params.spiralSpeed;
      p.position.x += Math.cos(p.userData.angle) * 0.01;
      p.position.z += Math.sin(p.userData.angle) * 0.01;

      p.rotation.z += p.userData.rotSpeed * dt;

      // Плавное исчезновение: когда прозрачность слишком мала, частица должна плавно исчезать
      if (p.material.opacity <= 0.01 && p.position.y > 10) {
        p.position.y = -10; // Начинаем перемещать частицу в начало
        p.userData.opacityTarget = params.opacity * (0.8 + Math.random() * 0.2); // Устанавливаем новую целевую прозрачность
      }

      // Ограничиваем движение частиц в пределах области
      if (p.position.x > params.spreadX / 2) p.position.x = -params.spreadX / 2;
      if (p.position.x < -params.spreadX / 2) p.position.x = params.spreadX / 2;
      if (p.position.z > params.spreadZ / 2) p.position.z = -params.spreadZ / 2;
      if (p.position.z < -params.spreadZ / 2) p.position.z = params.spreadZ / 2;
    });

    renderer.render(scene, camera);
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Функция для сохранения настроек в localStorage
  function saveSettings() {
    localStorage.setItem('smokeEffectParams', JSON.stringify(params));
    alert('Настройки сохранены!');
  }

  // Функция для загрузки настроек из localStorage
  function loadSettings() {
    const savedParams = localStorage.getItem('smokeEffectParams');
    if (savedParams) {
      const parsedParams = JSON.parse(savedParams);
      for (const key in parsedParams) {
        if (params.hasOwnProperty(key)) {
          params[key] = parsedParams[key];
        }
      }
      gui.updateDisplay();
    }
  }

  if (typeof THREE !== 'undefined') {
    if (document.readyState !== 'loading') init();
    else document.addEventListener('DOMContentLoaded', init);
  }

  window.SmokeFX = {
    init,
    params,
    resetParticles,
    updateMaterial
  };
})();
