import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadCourseScene, disposeCourseScene } from './course-scene';
import { BAY_CIRCUIT_COURSE as route } from './course';
import { preloadModels } from './assets';
import { DEFAULT_BUILDS, getBody, getWheel, wheelMounts } from './catalogue';
import { createVehicleModel, createWheelModel } from './visuals';
import { SOLO_RIVALS } from './solo';
import { PLAYER_COLORS } from './race';

/** A lightweight animated preview on the real circuit, independent of the race. */
export async function createLandingScene(host: HTMLElement): Promise<(() => void) | undefined> {
  const [course] = await Promise.all([loadCourseScene(), preloadModels()]);
  if (!host.isConnected) { disposeCourseScene(course); return; }
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' }); }
  catch { disposeCourseScene(course); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  renderer.setClearColor(0xb9d9df, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = false;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb9d9df);
  scene.environment = course.sky;
  course.setCircuit(true);
  scene.add(course.root);
  scene.add(new THREE.HemisphereLight(0xddecf5, 0x80735f, 2.1));
  const sun = new THREE.DirectionalLight(0xffebcd, 3.1);
  sun.position.set(-110, 220, 140); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc4e1f4, .7);
  fill.position.set(140, 80, -60); scene.add(fill);

  const hero = route.frame(108);
  const forward = new THREE.Vector3(hero.tangent.x, 0, hero.tangent.z).normalize();
  const right = new THREE.Vector3(hero.right.x, 0, hero.right.z).normalize();
  const center = new THREE.Vector3(hero.position.x, hero.position.y + 2.5, hero.position.z).addScaledVector(forward, 7);
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 1400);
  camera.position.set(hero.position.x, hero.position.y + 11, hero.position.z).addScaledVector(forward, -18).addScaledVector(right, 8);
  camera.lookAt(center);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enablePan = false; controls.enableZoom = true;
  controls.minDistance = 12; controls.maxDistance = 420; controls.zoomSpeed = .7;
  controls.enableDamping = false; controls.rotateSpeed = .45;
  controls.minPolarAngle = Math.PI / 8; controls.maxPolarAngle = Math.PI / 2.2;
  const coarse = window.matchMedia('(pointer: coarse)');
  controls.enableRotate = !coarse.matches;
  if (coarse.matches) renderer.domElement.style.touchAction = 'pan-y';
  controls.update();

  const models = new THREE.Group(); models.name = 'Live overview racers'; scene.add(models);
  const trackLength = route.paths[0].samples.at(-1)!.s;
  const scale = 1.8;
  const starts = [148, 156, 164, 172];
  const blueprints = [DEFAULT_BUILDS[0], ...SOLO_RIVALS.map(rival => rival.build)];
  const racers = blueprints.map((blueprint, id) => {
    const body = getBody(blueprint.bodyId), wheel = getWheel(blueprint.wheelId);
    const color = new THREE.Color(PLAYER_COLORS[id]).getHex();
    const group = new THREE.Group(); group.name = `Preview racer ${id + 1}`; group.scale.setScalar(scale);
    const car = createVehicleModel(blueprint, color);
    car.position.y = body.height / 2 + wheel.radius + .2; group.add(car);
    const wheels = wheelMounts(blueprint).map(([x, , z]) => {
      const tire = createWheelModel(blueprint, color); tire.position.set(x, wheel.radius, z); group.add(tire); return tire;
    });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({color:0x183c43,transparent:true,opacity:.2,depthWrite:false}));
    shadow.rotation.x = -Math.PI / 2; shadow.scale.set(body.width * .7, body.length * .64, 1); shadow.position.y = .07;
    group.add(shadow); models.add(group);
    return { group, wheels, radius: wheel.radius, distance: starts[id], id };
  });
  let packDistance = 120, animationTime = 0;
  let cameraHeading = Math.atan2(hero.tangent.x, hero.tangent.z);
  const positionRacers = (dt: number) => {
    const frame = route.lookFrame(packDistance), ahead = route.lookFrame(packDistance + 8);
    const bend = Math.acos(THREE.MathUtils.clamp(frame.tangent.dot(ahead.tangent), -1, 1));
    const speed = THREE.MathUtils.clamp(20 - bend * 28, 10, 20);
    packDistance = (packDistance + dt * speed) % trackLength; animationTime += dt;
    for (const racer of racers) {
      // Keep the showcase pack together, with small passes instead of the
      // cars gradually spreading out and leaving the close camera empty.
      const offset = (racer.id - 1.5) * 8 + Math.sin(animationTime * .24 + racer.id * 1.7) * 5;
      racer.distance = (packDistance + offset + trackLength) % trackLength;
      const current = route.lookFrame(racer.distance);
      const lateral = racer.id % 2 ? 1.7 : -1.7;
      racer.group.position.set(current.position.x, current.position.y, current.position.z)
        .addScaledVector(new THREE.Vector3(current.right.x, current.right.y, current.right.z), lateral);
      const q = route.orientation(current); racer.group.quaternion.set(q.x, q.y, q.z, q.w);
      for (const wheel of racer.wheels) wheel.rotation.x += dt * speed / (racer.radius * scale);
    }
  };
  positionRacers(0);

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false, pending = 0, visible = true, width = 1, height = 1, dirty = true;
  let last = performance.now();
  const draw = (now: number) => {
    pending = 0;
    if (disposed || !visible || document.hidden) return;
    const since = (now - last) / 1000;
    // Keep the large overview light while the main game prepares its assets.
    if (dirty || since >= 1 / 30) {
      const dt = motion.matches ? 0 : Math.min(Math.max(since, 0), .08);
      last = now;
      positionRacers(dt);
      if (dt) {
        // Stay just behind the lead showcase car, with rivals and the next
        // corner ahead. Orbit/zoom offsets remain adjustable by the viewer.
        const car = racers[0];
        const road = route.lookFrame(car.distance + 3);
        const direction = new THREE.Vector3(road.tangent.x, 0, road.tangent.z).normalize();
        const target = car.group.position.clone().addScaledVector(direction, 7); target.y += 2.5;
        const heading = Math.atan2(direction.x, direction.z);
        const turn = Math.atan2(Math.sin(heading - cameraHeading), Math.cos(heading - cameraHeading)) * (1 - Math.exp(-dt * 3));
        cameraHeading += turn;
        const offset = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
        controls.target.lerp(target, 1 - Math.exp(-dt * 5));
        camera.position.copy(controls.target).add(offset); camera.lookAt(controls.target);
      }
      if (dt) course.mixer.update(dt);
      course.features.update(undefined, dt, true, motion.matches);
      renderer.render(scene, camera); dirty = false;
    }
    if (!motion.matches) pending = requestAnimationFrame(draw);
  };
  const requestRender = () => {
    dirty = true;
    if (!disposed && visible && !document.hidden && !pending) pending = requestAnimationFrame(draw);
  };
  const refit = () => {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestRender();
  };
  controls.addEventListener('change', requestRender);
  const resize = () => {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height || disposed) return;
    width = rect.width; height = rect.height;
    renderer.setSize(width, height, false); refit();
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  const visibility = () => { last = performance.now(); requestRender(); };
  const intersection = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    last = performance.now(); requestRender();
  });
  intersection.observe(host);
  document.addEventListener('visibilitychange', visibility);
  motion.addEventListener('change', requestRender);

  return () => {
    disposed = true; cancelAnimationFrame(pending); observer.disconnect(); intersection.disconnect();
    document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', requestRender);
    controls.removeEventListener('change', requestRender); controls.dispose();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    models.traverse(node => {
      if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
        geometries.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
      }
      if (node.userData.disposeTexture instanceof THREE.Texture) textures.add(node.userData.disposeTexture);
    });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
    disposeCourseScene(course); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  };
}
