// Solara Bay — Danny Reyes on foot: third-person walking and running, jumping,
// a boxy animated character, and combat with fists and a pistol.
MH.player = (function () {
  var scene = null;
  var group = null;
  var legL = null, legR = null, armL = null, armR = null;
  var pistolMesh = null;
  var muzzle = null;
  var muzzleLife = 0;
  var tracer = null;
  var tracerLife = 0;
  var driveOrbit = 0;

  var WALK_SPEED = 5.2;
  var RUN_SPEED = 8.6;
  var PUNCH_RANGE = 2.3;
  var PUNCH_DAMAGE = 12;
  var SHOT_DAMAGE = 34;
  var SHOT_RANGE = 48;
  var MAG_SIZE = 12;

  var player = {
    pos: new THREE.Vector3(0, 0, 120),
    heading: 0,
    vy: 0,
    yOff: 0,
    health: 100,
    maxHealth: 100,
    ammo: MAG_SIZE,
    weapon: 'fists', // 'fists' | 'pistol'
    reloading: 0,
    punchTimer: 0,
    punchCooldown: 0,
    walkPhase: 0,
    inCar: false,
    car: null,
    camYaw: 0,
    camPitch: 0.32,
    camDist: 7,
    invulnerable: 0,
    dead: false
  };

  function buildCharacter(shirtColor, skinColor, pantsColor) {
    var g = new THREE.Group();
    var skin = new THREE.MeshLambertMaterial({ color: skinColor });
    var shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
    var pants = new THREE.MeshLambertMaterial({ color: pantsColor });
    var capMat = new THREE.MeshLambertMaterial({ color: 0x22303c });

    var legGeo = new THREE.BoxGeometry(0.24, 0.8, 0.26);
    legL = new THREE.Group();
    var ll = new THREE.Mesh(legGeo, pants);
    ll.position.y = -0.4;
    legL.add(ll);
    legL.position.set(-0.15, 0.8, 0);
    g.add(legL);
    legR = new THREE.Group();
    var lr = new THREE.Mesh(legGeo, pants);
    lr.position.y = -0.4;
    legR.add(lr);
    legR.position.set(0.15, 0.8, 0);
    g.add(legR);

    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.72, 0.36), shirt);
    torso.position.y = 1.16;
    torso.castShadow = true;
    g.add(torso);

    var head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skin);
    head.position.y = 1.72;
    head.castShadow = true;
    g.add(head);
    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), capMat);
    cap.position.y = 1.9;
    g.add(cap);

    var armGeo = new THREE.BoxGeometry(0.2, 0.66, 0.22);
    armL = new THREE.Group();
    var al = new THREE.Mesh(armGeo, shirt);
    al.position.y = -0.3;
    armL.add(al);
    armL.position.set(-0.42, 1.46, 0);
    g.add(armL);
    armR = new THREE.Group();
    var ar = new THREE.Mesh(armGeo, shirt);
    ar.position.y = -0.3;
    armR.add(ar);
    armR.position.set(0.42, 1.46, 0);
    g.add(armR);

    pistolMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.14, 0.34),
      new THREE.MeshLambertMaterial({ color: 0x1a1d20 })
    );
    pistolMesh.position.set(0, -0.62, 0.12);
    pistolMesh.visible = false;
    armR.add(pistolMesh);
    return g;
  }

  /** Who can be hit by a punch or a shot: foot cops and pedestrians. */
  function hittableTargets() {
    var out = [];
    var cops = MH.police ? MH.police.cops : [];
    for (var i = 0; i < cops.length; i++) if (!cops[i].down) out.push(cops[i]);
    var peds = MH.traffic ? MH.traffic.peds : [];
    for (var j = 0; j < peds.length; j++) if (peds[j].state !== 'down') out.push(peds[j]);
    return out;
  }

  function damageTarget(t, amount, kx, kz) {
    t.health -= amount;
    if (t.health <= 0) {
      t.health = 0;
      t.state = 'down';
      t.downTimer = 6;
      if (t.kind === 'cop') {
        MH.police.addHeat(25, 'cop down');
        if (Math.random() < 0.5 && MH.pickups) MH.pickups.spawnHealth(t.pos.x, t.pos.z);
      } else {
        MH.police.addHeat(15, 'pedestrian down');
      }
    } else if (t.kind === 'ped') {
      t.state = 'flee';
      t.fleeTimer = 4;
    }
    if (kx !== undefined) {
      t.pos.x += kx; t.pos.z += kz;
    }
  }

  player.init = function (s) {
    scene = s;
    group = buildCharacter(0x2e8f8a, 0xc98d64, 0x2c3440);
    scene.add(group);
    // Muzzle flash sprite at the gun tip.
    var mmat = new THREE.SpriteMaterial({
      map: MH.makeGlowTexture(), color: 0xffd76a, transparent: true, opacity: 0, depthWrite: false
    });
    muzzle = new THREE.Sprite(mmat);
    muzzle.scale.set(0.9, 0.9, 1);
    scene.add(muzzle);
    // Bullet tracer line.
    var tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    tracer = new THREE.Line(tgeo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    tracer.frustumCulled = false;
    scene.add(tracer);
  };

  player.reset = function (x, z) {
    player.pos.set(x, 0, z);
    player.heading = 0;
    player.vy = 0;
    player.yOff = 0;
    player.health = player.maxHealth;
    player.ammo = MAG_SIZE;
    player.weapon = 'fists';
    player.reloading = 0;
    player.punchTimer = 0;
    player.punchCooldown = 0;
    player.inCar = false;
    player.car = null;
    player.camYaw = 0;
    player.camPitch = 0.32;
    player.invulnerable = 0;
    player.dead = false;
    if (group) group.visible = true;
    if (pistolMesh) pistolMesh.visible = false;
  };

  player.setWeapon = function (w) {
    if (player.weapon === w) return;
    player.weapon = w;
    if (pistolMesh) pistolMesh.visible = (w === 'pistol');
    MH.audio.uiClick();
  };

  player.takeDamage = function (n) {
    if (player.dead || player.invulnerable > 0) return;
    player.health -= n;
    MH.hud.damageFlash(0.5);
    if (player.health <= 0) {
      player.health = 0;
      player.dead = true;
    }
  };

  player.heal = function (n) {
    player.health = Math.min(player.maxHealth, player.health + n);
  };

  player.punch = function () {
    if (player.punchCooldown > 0 || player.inCar) return;
    player.punchCooldown = 0.45;
    player.punchTimer = 0.25;
    MH.audio.punch();
    var fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    var targets = hittableTargets();
    var hitAny = false;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var dx = t.pos.x - player.pos.x, dz = t.pos.z - player.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > PUNCH_RANGE) continue;
      var dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < 0.35) continue;
      damageTarget(t, PUNCH_DAMAGE, fx * 1.2, fz * 1.2);
      hitAny = true;
    }
    if (hitAny) MH.audio.crash(false);
  };

  player.shoot = function () {
    if (player.inCar || player.reloading > 0) return;
    if (player.ammo <= 0) {
      player.startReload();
      return;
    }
    player.ammo--;
    MH.audio.gunshot();
    // Aim along the camera forward direction.
    var cam = MH.mainCamera;
    var origin = new THREE.Vector3();
    origin.copy(player.pos); origin.y = 1.45;
    var dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    var best = null, bestScore = 0.14, bestDist = SHOT_RANGE;
    var targets = hittableTargets();
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var tx = t.pos.x - origin.x, ty = 1.1 - origin.y, tz = t.pos.z - origin.z;
      var d = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (d > SHOT_RANGE) continue;
      var ang = Math.acos(MH.clamp((tx * dir.x + ty * dir.y + tz * dir.z) / (d || 1), -1, 1));
      if (ang < bestScore && d < bestDist) {
        bestScore = ang; bestDist = d; best = t;
      }
    }
    var end = origin.clone().add(dir.clone().multiplyScalar(best ? bestDist : SHOT_RANGE));
    if (best) {
      end.set(best.pos.x, 1.1, best.pos.z);
      var kx = dir.x * 0.8, kz = dir.z * 0.8;
      damageTarget(best, SHOT_DAMAGE, kx, kz);
    }
    // Muzzle flash + tracer, both fade fast.
    muzzle.position.copy(origin).add(dir.clone().multiplyScalar(0.9));
    muzzle.material.opacity = 0.95;
    muzzleLife = 0.06;
    var pos = tracer.geometry.attributes.position.array;
    pos[0] = origin.x; pos[1] = origin.y; pos[2] = origin.z;
    pos[3] = end.x; pos[4] = end.y; pos[5] = end.z;
    tracer.geometry.attributes.position.needsUpdate = true;
    tracer.material.opacity = 0.9;
    tracerLife = 0.08;
    player.camPitch = MH.clamp(player.camPitch + 0.012, 0.05, 1.15);
    if (player.ammo === 0) player.startReload();
  };

  player.startReload = function () {
    if (player.reloading > 0 || player.ammo === MAG_SIZE) return;
    player.reloading = 1.2;
    MH.hud.subtitle('Reloading…', 1.2);
  };

  player.update = function (dt, mouse) {
    if (player.dead) return;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.punchCooldown > 0) player.punchCooldown -= dt;
    if (player.punchTimer > 0) player.punchTimer -= dt;
    if (player.reloading > 0) {
      player.reloading -= dt;
      if (player.reloading <= 0) {
        player.ammo = MAG_SIZE;
        MH.audio.uiClick();
      }
    }
    if (muzzleLife > 0) {
      muzzleLife -= dt;
      if (muzzleLife <= 0) muzzle.material.opacity = 0;
    }
    if (tracerLife > 0) {
      tracerLife -= dt;
      tracer.material.opacity = Math.max(0, tracerLife / 0.08) * 0.9;
    }
    if (player.inCar) {
      if (group) group.visible = false;
      return;
    }
    if (group) group.visible = true;

    // Keys move relative to the camera yaw (the camera applies mouse deltas).
    mouse = mouse || { dx: 0, dy: 0 };

    var input = MH.input;
    var fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    var str = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    var speed = input.sprint ? RUN_SPEED : WALK_SPEED;
    var moving = (fwd !== 0 || str !== 0);
    if (moving) {
      var len = Math.sqrt(fwd * fwd + str * str);
      fwd /= len; str /= len;
      var sin = Math.sin(player.camYaw), cos = Math.cos(player.camYaw);
      // Camera looks toward -forward of the yaw: forward on the ground is (-sin, -cos).
      var mx = -sin * fwd + cos * str;
      var mz = -cos * fwd - sin * str;
      var nx = player.pos.x + mx * speed * dt;
      var nz = player.pos.z + mz * speed * dt;
      var hit = MH.world.collide(nx, nz, 0.6);
      player.pos.x = hit.x;
      player.pos.z = hit.z;
      player.heading = Math.atan2(mx, mz);
      player.walkPhase += dt * speed * 1.6;
    }
    // Jump: simple vertical hop, purely visual.
    if (input.jump && player.yOff === 0 && player.vy === 0) player.vy = 5.2;
    if (player.vy !== 0 || player.yOff > 0) {
      player.vy -= 14 * dt;
      player.yOff += player.vy * dt;
      if (player.yOff <= 0) { player.yOff = 0; player.vy = 0; }
    }
    // Weapon switching and attacks.
    if (input.isDown('Digit1')) player.setWeapon('fists');
    if (input.isDown('Digit2')) player.setWeapon('pistol');
    if (input.consumeClick()) {
      if (player.weapon === 'fists') player.punch();
      else player.shoot();
    }
    if (input.isDown('KeyR')) player.startReload();

    // Pose the character.
    if (group) {
      group.position.set(player.pos.x, player.yOff, player.pos.z);
      group.rotation.y = player.heading;
      var swing = moving ? Math.sin(player.walkPhase) * 0.55 : 0;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      if (player.punchTimer > 0) {
        armR.rotation.x = -1.9 + (0.25 - player.punchTimer) * 4;
        armL.rotation.x = 0;
      } else if (player.weapon === 'pistol') {
        armR.rotation.x = -1.35;
        armL.rotation.x = -1.1;
      } else {
        armR.rotation.x = -swing * 0.7;
        armL.rotation.x = swing * 0.7;
      }
    }
  };

  /** Third-person camera: over the shoulder on foot, chase cam in a car. */
  player.updateCamera = function (camera, dt, mouse) {
    mouse = mouse || { dx: 0, dy: 0 };
    if (player.inCar && player.car) {
      driveOrbit = MH.clamp(driveOrbit - mouse.dx * 0.003, -1.1, 1.1);
      driveOrbit = MH.lerp(driveOrbit, 0, Math.min(1, dt * 0.7));
      var car = player.car;
      var yaw = car.heading + Math.PI + driveOrbit;
      var dist = 10.5;
      var tx = car.pos.x, ty = 1.6, tz = car.pos.z;
      var cx = tx + Math.sin(yaw) * dist * Math.cos(0.32);
      var cz = tz + Math.cos(yaw) * dist * Math.cos(0.32);
      var cy = ty + 3.6;
      camera.position.set(cx, cy, cz);
      camera.lookAt(tx + Math.sin(car.heading) * 5, 1.4, tz + Math.cos(car.heading) * 5);
      return;
    }
    player.camYaw -= mouse.dx * 0.0032;
    player.camPitch = MH.clamp(player.camPitch + mouse.dy * 0.0028, 0.05, 1.15);
    var target = new THREE.Vector3(player.pos.x, player.pos.y + 1.6, player.pos.z);
    var dist2 = player.camDist;
    var ox = Math.sin(player.camYaw) * Math.cos(player.camPitch) * dist2;
    var oy = Math.sin(player.camPitch) * dist2;
    var oz = Math.cos(player.camYaw) * Math.cos(player.camPitch) * dist2;
    camera.position.set(target.x + ox, Math.max(0.6, target.y + oy), target.z + oz);
    camera.lookAt(target);
  };

  return player;
})();
