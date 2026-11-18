// Solara Bay — the city of Solara Bay: a sun-soaked coastal grid of roads, towers,
// palms, beach and water, built once from a seed. Also owns the collision boxes
// (building footprints) and the road network the traffic and police drive on.
MH.world = (function () {
  var PITCH = 62;      // distance between road centre lines
  var ROAD_W = 14;     // road width
  var ROADS = [-310, -248, -186, -124, -62, 0, 62, 124, 186, 248, 310];
  var BOUNDS = { minX: -330, maxX: 330, minZ: -330, maxZ: 470 };
  var BEACH_Z = 330;   // sand starts here
  var WATER_Z = 400;   // water starts here

  var scene = null;
  var rng = null;
  var aabbs = [];          // {x1,z1,x2,z2} building footprints
  var waterMat = null;
  var foam = null;
  var time = 0;
  var mapCanvas = null;   // pre-rendered top-down map for the HUD minimap

  // Fixed story places, picked on the grid so missions always have somewhere to go.
  var SPOTS = {
    coupe: { x: 93, z: -93 },      // parking lot where the red coupe waits (mission 1)
    garage: { x: -93, z: 217 },   // Sly's garage, mission 1 delivery
    beachHut: { x: -40, z: 362 }, // lifeguard hut, mission 2 pickup
    pierEnd: { x: 120, z: 448 },  // pier drop-off, mission 2 delivery
    marina: { x: 217, z: 300 },   // marina lot with the gold Comet, mission 3
    hideout: { x: -217, z: 279 }, // warehouse hideout, mission 3 delivery
    playerStart: { x: 0, z: 120 } // where Danny starts, on foot downtown
  };

  function canvasTexture(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function buildingTexture(base, lit) {
    return canvasTexture(128, 256, function (g, w, h) {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (var y = 12; y < h - 12; y += 22) {
        for (var x = 10; x < w - 10; x += 20) {
          var on = Math.random() < lit;
          g.fillStyle = on ? '#ffd98a' : '#1d2733';
          g.fillRect(x, y, 12, 14);
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, h - 18, w, 18);
    });
  }

  function roadTexture() {
    var tex = canvasTexture(64, 64, function (g, w, h) {
      g.fillStyle = '#2e3138';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#3a3e46';
      g.fillRect(0, 0, 3, h);
      g.fillRect(w - 3, 0, 3, h);
      g.fillStyle = '#e8c33c';
      g.fillRect(w / 2 - 2, 8, 4, 20);
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function signTexture(text, fg, bg) {
    return canvasTexture(512, 128, function (g, w, h) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = fg;
      g.font = 'bold 64px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
    });
  }

  function addBox(x, y, z, w, h, d, mat, shadow) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (shadow) { m.castShadow = true; m.receiveShadow = true; }
    scene.add(m);
    return m;
  }

  function addAABB(x1, z1, x2, z2) {
    aabbs.push({ x1: x1, z1: z1, x2: x2, z2: z2 });
  }

  function buildSky() {
    var tex = canvasTexture(16, 512, function (g, w, h) {
      var grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0.0, '#2a1e5e');
      grad.addColorStop(0.35, '#7a3b8f');
      grad.addColorStop(0.6, '#e2607a');
      grad.addColorStop(0.8, '#ff9a5c');
      grad.addColorStop(1.0, '#ffc46b');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    });
    var sky = new THREE.Mesh(
      new THREE.SphereGeometry(950, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
    );
    scene.add(sky);
    // Low sun disc over the water, due west-southwest.
    var sun = new THREE.Mesh(
      new THREE.CircleGeometry(34, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false })
    );
    sun.position.set(-420, 95, 620);
    sun.lookAt(0, 60, 0);
    scene.add(sun);
  }

  function buildGround() {
    // Base: sidewalk-grey ground for the whole city slab.
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(680, 830),
      new THREE.MeshLambertMaterial({ color: 0x8a8d90 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 65);
    ground.receiveShadow = true;
    scene.add(ground);

    // Roads: dark strips with a dashed centre line, slightly above the ground.
    var rtex = roadTexture();
    var roadMat = new THREE.MeshLambertMaterial({ map: rtex });
    for (var i = 0; i < ROADS.length; i++) {
      var c = ROADS[i];
      var texX = rtex.clone();
      texX.needsUpdate = true;
      texX.repeat.set(1, 22);
      var matX = new THREE.MeshLambertMaterial({ map: texX });
      var rx = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 680), matX);
      rx.rotation.x = -Math.PI / 2;
      rx.position.set(c, 0.02, 0);
      rx.receiveShadow = true;
      scene.add(rx);
      var texZ = rtex.clone();
      texZ.needsUpdate = true;
      texZ.repeat.set(1, 22);
      var matZ = new THREE.MeshLambertMaterial({ map: texZ });
      var rz = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 680), matZ);
      rz.rotation.x = -Math.PI / 2;
      rz.rotation.z = Math.PI / 2;
      rz.position.set(0, 0.02, c);
      rz.receiveShadow = true;
      scene.add(rz);
    }

    // Beach sand and the sea.
    var sand = new THREE.Mesh(
      new THREE.PlaneGeometry(680, 72),
      new THREE.MeshLambertMaterial({ color: 0xe8c98f })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.03, BEACH_Z + 35);
    sand.receiveShadow = true;
    scene.add(sand);

    waterMat = new THREE.MeshPhongMaterial({
      color: 0x1e6f8f, shininess: 120, specular: 0x99ccff,
      transparent: true, opacity: 0.92
    });
    var water = new THREE.Mesh(new THREE.PlaneGeometry(1000, 560), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.0, WATER_Z + 270);
    scene.add(water);

    // Foam line where the waves meet the sand.
    foam = new THREE.Mesh(
      new THREE.PlaneGeometry(680, 3),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, 0.06, WATER_Z - 2);
    scene.add(foam);
  }

  function buildBlocks(seedRng) {
    var variants = [
      buildingTexture('#7d8aa0', 0.35),
      buildingTexture('#a08a6d', 0.3),
      buildingTexture('#6d7f8a', 0.4),
      buildingTexture('#8a6d7d', 0.3)
    ];
    var mats = variants.map(function (t) {
      return new THREE.MeshLambertMaterial({ map: t });
    });
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4d52 });
    var special = {
      '93,-93': 'lot', '-93,217': 'garage', '-217,279': 'hideout', '217,279': 'marina'
    };
    var plazas = { '-31,-31': 1, '155,93': 1, '-155,-217': 1 };

    for (var bx = 0; bx < 10; bx++) {
      for (var bz = 0; bz < 10; bz++) {
        var cx = -279 + bx * PITCH;
        var cz = -279 + bz * PITCH;
        var key = cx + ',' + cz;
        if (special[key]) continue;
        if (plazas[key]) continue; // park: palms and benches instead of a tower
        var distC = Math.sqrt(cx * cx + cz * cz);
        var tall = MH.clamp(1 - distC / 420, 0, 1);
        var roll = seedRng();
        if (roll < 0.22) {
          // Two mid buildings side by side.
          var h1 = 9 + seedRng() * 14 + tall * 16;
          var h2 = 9 + seedRng() * 14 + tall * 16;
          var m1 = addBox(cx - 11, h1 / 2, cz, 20, h1, 34, MH.pick(seedRng, mats), true);
          var m2 = addBox(cx + 11, h2 / 2, cz, 20, h2, 34, MH.pick(seedRng, mats), true);
          addBox(cx - 11, h1 + 0.4, cz, 21, 0.8, 35, roofMat, false);
          addBox(cx + 11, h2 + 0.4, cz, 21, 0.8, 35, roofMat, false);
          addAABB(cx - 21, cz - 17, cx - 1, cz + 17);
          addAABB(cx + 1, cz - 17, cx + 21, cz + 17);
        } else {
          var h = 10 + seedRng() * 16 + tall * 22;
          var w = 26 + seedRng() * 12;
          var d = 26 + seedRng() * 12;
          addBox(cx, h / 2, cz, w, h, d, MH.pick(seedRng, mats), true);
          addBox(cx, h + 0.4, cz, w + 1, 0.8, d + 1, roofMat, false);
          addAABB(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
        }
      }
    }

    // Sly's garage: low wide workshop with a painted sign.
    var g = addBox(SPOTS.garage.x, 3, SPOTS.garage.z, 44, 6, 26,
      new THREE.MeshLambertMaterial({ color: 0x9a7b4f }), true);
    addAABB(SPOTS.garage.x - 22, SPOTS.garage.z - 13, SPOTS.garage.x + 22, SPOTS.garage.z + 13);
    var gsign = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 7.5),
      new THREE.MeshBasicMaterial({ map: signTexture("SLY'S GARAGE", '#ffe9a8', '#5a3b1e') })
    );
    gsign.position.set(SPOTS.garage.x, 5.2, SPOTS.garage.z - 13.2);
    gsign.rotation.y = Math.PI;
    scene.add(gsign);

    // Hideout warehouse.
    addBox(SPOTS.hideout.x, 4, SPOTS.hideout.z, 40, 8, 30,
      new THREE.MeshLambertMaterial({ color: 0x5d6b7a }), true);
    addAABB(SPOTS.hideout.x - 20, SPOTS.hideout.z - 15, SPOTS.hideout.x + 20, SPOTS.hideout.z + 15);

    // Marina lot: flat asphalt with painted bays, no building.
    var lot = new THREE.Mesh(
      new THREE.PlaneGeometry(52, 40),
      new THREE.MeshLambertMaterial({ color: 0x3a3d42 })
    );
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(SPOTS.marina.x, 0.04, SPOTS.marina.z);
    lot.receiveShadow = true;
    scene.add(lot);

    // Parking lot where the coupe waits.
    var lot2 = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 44),
      new THREE.MeshLambertMaterial({ color: 0x3a3d42 })
    );
    lot2.rotation.x = -Math.PI / 2;
    lot2.position.set(SPOTS.coupe.x, 0.04, SPOTS.coupe.z);
    lot2.receiveShadow = true;
    scene.add(lot2);

    // Lifeguard hut on the beach, on stilts.
    var hutMat = new THREE.MeshLambertMaterial({ color: 0xf2f2ee });
    addBox(SPOTS.beachHut.x, 1.6, SPOTS.beachHut.z, 4, 3, 4, hutMat, true);
    addBox(SPOTS.beachHut.x, 3.4, SPOTS.beachHut.z, 5, 0.4, 5,
      new THREE.MeshLambertMaterial({ color: 0xe2607a }), true);
    addAABB(SPOTS.beachHut.x - 2, SPOTS.beachHut.z - 2, SPOTS.beachHut.x + 2, SPOTS.beachHut.z + 2);

    // Wooden pier out into the water, with the drop-off at its end.
    var plankMat = new THREE.MeshLambertMaterial({ color: 0x8a6b45 });
    for (var p = 0; p < 12; p++) {
      addBox(SPOTS.pierEnd.x, 0.12, WATER_Z + 4 + p * 4, 5, 0.24, 3.6, plankMat, false);
    }

    // North hills and the big SOLARA sign on the ridge.
    var hillMat = new THREE.MeshLambertMaterial({ color: 0x4d5a3a });
    addBox(-140, 6, -360, 180, 12, 40, hillMat, false);
    addBox(120, 9, -365, 220, 18, 46, hillMat, false);
    addBox(0, 4, -352, 120, 8, 30, hillMat, false);
    var sign = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 22),
      new THREE.MeshBasicMaterial({ map: signTexture('SOLARA', '#fff3d6', '#2a1e5e'), transparent: true })
    );
    sign.position.set(120, 24, -340);
    scene.add(sign);
  }

  function buildPalmsAndLights(seedRng) {
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
    var frondMat = new THREE.MeshLambertMaterial({ color: 0x3f7a3a });
    var trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.5, 6);
    var frondGeo = new THREE.ConeGeometry(2.2, 2.6, 6);
    function palm(x, z) {
      var trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 2.75, z);
      trunk.rotation.z = MH.rand(seedRng, -0.08, 0.08);
      trunk.castShadow = true;
      scene.add(trunk);
      var fronds = new THREE.Mesh(frondGeo, frondMat);
      fronds.position.set(x, 6.1, z);
      fronds.scale.set(1, 0.55, 1);
      fronds.castShadow = true;
      scene.add(fronds);
    }
    // A row of palms along the beach, and a few in the plazas.
    for (var i = 0; i < 26; i++) {
      palm(-300 + i * 25 + MH.rand(seedRng, -6, 6), BEACH_Z + MH.rand(seedRng, 6, 26));
    }
    var plazas = [[-31, -31], [155, 93], [-155, -217]];
    for (var q = 0; q < plazas.length; q++) {
      for (var k = 0; k < 5; k++) {
        palm(plazas[q][0] + MH.rand(seedRng, -16, 16), plazas[q][1] + MH.rand(seedRng, -16, 16));
      }
    }
    // Streetlights at every other intersection.
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f34 });
    var lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    var poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6, 6);
    var lampGeo = new THREE.SphereGeometry(0.32, 8, 6);
    for (var ix = 0; ix < ROADS.length; ix += 2) {
      for (var iz = 0; iz < ROADS.length; iz += 2) {
        var pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(ROADS[ix] + 8, 3, ROADS[iz] + 8);
        scene.add(pole);
        var lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(ROADS[ix] + 8, 6.1, ROADS[iz] + 8);
        scene.add(lamp);
      }
    }
  }

  function buildMapLayer() {
    var c = document.createElement('canvas');
    c.width = 220; c.height = 220;
    var g = c.getContext('2d');
    function toMap(v, min, max) { return (v - min) / (max - min) * 220; }
    // Sea and sand.
    g.fillStyle = '#14486b';
    g.fillRect(0, 0, 220, 220);
    g.fillStyle = '#e8c98f';
    g.fillRect(0, toMap(BEACH_Z, -340, 480), 220, toMap(WATER_Z, -340, 480) - toMap(BEACH_Z, -340, 480));
    // City ground.
    g.fillStyle = '#5d6167';
    g.fillRect(0, 0, 220, toMap(BEACH_Z, -340, 480));
    // Roads.
    g.fillStyle = '#2e3138';
    for (var i = 0; i < ROADS.length; i++) {
      var rx = toMap(ROADS[i], -340, 480);
      g.fillRect(rx - 2, 0, 4, toMap(BEACH_Z, -340, 480));
      var rz = toMap(ROADS[i], -340, 480);
      g.fillRect(0, rz - 2, 220, 4);
    }
    // Buildings.
    g.fillStyle = '#9aa2ad';
    for (var b = 0; b < aabbs.length; b++) {
      var a = aabbs[b];
      g.fillRect(toMap(a.x1, -340, 480), toMap(a.z1, -340, 480),
        toMap(a.x2, -340, 480) - toMap(a.x1, -340, 480),
        toMap(a.z2, -340, 480) - toMap(a.z1, -340, 480));
    }
    mapCanvas = c;
  }

  return {
    SPOTS: SPOTS,
    ROADS: ROADS,
    BOUNDS: BOUNDS,

    build: function (s, seed) {
      scene = s;
      rng = MH.mulberry32(seed);
      aabbs = [];
      time = 0;
      buildSky();
      buildGround();
      buildBlocks(rng);
      buildPalmsAndLights(rng);
      buildMapLayer();
    },

    get mapCanvas() { return mapCanvas; },

    update: function (dt) {
      time += dt;
      if (waterMat) waterMat.color.setHSL(0.55, 0.62, 0.32 + Math.sin(time * 0.6) * 0.02);
      if (foam) foam.material.opacity = 0.4 + Math.sin(time * 1.4) * 0.18;
    },

    /** Push a circle (x, z, radius) out of every building and the city bounds. */
    collide: function (x, z, r) {
      var hit = false;
      for (var i = 0; i < aabbs.length; i++) {
        var a = aabbs[i];
        var cx = MH.clamp(x, a.x1, a.x2);
        var cz = MH.clamp(z, a.z1, a.z2);
        var dx = x - cx, dz = z - cz;
        var d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          hit = true;
          if (d2 > 0.0001) {
            var d = Math.sqrt(d2);
            x = cx + dx / d * r;
            z = cz + dz / d * r;
          } else {
            // Centre inside the box: push out along the smallest penetration.
            var pl = x - (a.x1 - r), pr = (a.x2 + r) - x;
            var pt = z - (a.z1 - r), pb = (a.z2 + r) - z;
            var m = Math.min(pl, pr, pt, pb);
            if (m === pl) x = a.x1 - r;
            else if (m === pr) x = a.x2 + r;
            else if (m === pt) z = a.z1 - r;
            else z = a.z2 + r;
          }
        }
      }
      var nx = MH.clamp(x, BOUNDS.minX + r, BOUNDS.maxX - r);
      var nz = MH.clamp(z, BOUNDS.minZ + r, BOUNDS.maxZ - r);
      if (nx !== x || nz !== z) hit = true;
      return { x: nx, z: nz, hit: hit };
    },

    /** Is this point on a road (within the road half-width plus a margin)? */
    isOnRoad: function (x, z) {
      for (var i = 0; i < ROADS.length; i++) {
        if (Math.abs(x - ROADS[i]) < ROAD_W / 2 + 1) return true;
        if (Math.abs(z - ROADS[i]) < ROAD_W / 2 + 1) return true;
      }
      return false;
    },

    /** A random point on a road, optionally near (x, z). */
    randomRoadPoint: function (r, nearX, nearZ) {
      var line = MH.pick(r, ROADS);
      var along = MH.rand(r, -300, 300);
      var lane = MH.pick(r, [-3.2, 3.2]);
      var p;
      if (MH.chance(r, 0.5)) p = { x: line + lane, z: along };
      else p = { x: along, z: line + lane };
      if (nearX !== undefined) {
        // Try a few times to land near the target.
        for (var t = 0; t < 6; t++) {
          if (MH.dist2d(p.x, p.z, nearX, nearZ) < 160) break;
          line = MH.pick(r, ROADS);
          along = MH.rand(r, -300, 300);
          lane = MH.pick(r, [-3.2, 3.2]);
          p = MH.chance(r, 0.5) ? { x: line + lane, z: along } : { x: along, z: line + lane };
        }
      }
      return p;
    },

    /** A random point on a sidewalk beside a road. */
    randomSidewalkPoint: function (r) {
      var line = MH.pick(r, ROADS);
      var along = MH.rand(r, -300, 300);
      var off = MH.pick(r, [-9.5, 9.5]);
      if (MH.chance(r, 0.5)) return { x: line + off, z: along };
      return { x: along, z: line + off };
    },

    /** A random parking spot inside a lot or along a road edge. */
    randomParkedSpot: function (r) {
      if (MH.chance(r, 0.5)) {
        return {
          x: SPOTS.coupe.x + MH.rand(r, -18, 18),
          z: SPOTS.coupe.z + MH.rand(r, -16, 16),
          heading: MH.rand(r, 0, MH.TAU)
        };
      }
      var p = this.randomRoadPoint(r);
      return { x: p.x, z: p.z, heading: MH.rand(r, 0, MH.TAU) };
    }
  };
})();
