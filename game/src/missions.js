// Solara Bay — three story missions for Danny Reyes, given by the fixer
// Selma "Sly" Ortiz: steal a coupe, run a beach delivery, then take the gold Comet
// and outrun the whole Solara Bay force. Objectives, markers, dialogue and rewards.
MH.missions = (function () {
  var scene = null;
  var marker = null;
  var markerDiamond = null;
  var markerRing = null;
  var prevE = false;
  var nextStartTimer = 0;
  var dialogueTimer = 0;
  var dialogueQueue = [];

  var MISSIONS = [
    {
      id: 'first-wheels',
      title: 'First Wheels',
      reward: 500,
      intro: [
        "Sly: Danny! Fresh off the bus, huh? Solara Bay eats the slow.",
        "Sly: A red coupe is sitting in the lot uptown. Bring it to my garage.",
        "Sly: Keep it clean — or at least keep it quick."
      ]
    },
    {
      id: 'beach-run',
      title: 'Beach Run',
      reward: 800,
      intro: [
        "Sly: Nice driving. Next job: a package at the lifeguard hut.",
        "Sly: Take it to the end of the pier. Ninety seconds, no excuses.",
        "Sly: Beach patrol is jumpy today. Don't let them see you grab it."
      ]
    },
    {
      id: 'golden-comet',
      title: 'The Golden Comet',
      reward: 1500,
      intro: [
        "Sly: Big one, Danny. A gold Comet is parked at the marina lot.",
        "Sly: Two guards watch it. Take the car, lose the heat, bring it home.",
        "Sly: Do this and you're not a newcomer anymore. You're Solara Bay."
      ]
    }
  ];

  var active = -1;      // index into MISSIONS, -1 = none
  var stage = 0;
  var stageTimer = 0;
  var state = 'idle';   // 'idle' | 'active' | 'done' | 'failed'
  var guardsSpawned = false;

  function markerAt(x, z, color) {
    if (!marker) {
      marker = new THREE.Group();
      var cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(2.4, 2.4, 26, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xffd23c, transparent: true, opacity: 0.16,
          side: THREE.DoubleSide, depthWrite: false
        })
      );
      cyl.position.y = 13;
      marker.add(cyl);
      markerDiamond = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.9),
        new THREE.MeshBasicMaterial({ color: 0xffd23c })
      );
      markerDiamond.position.y = 4.5;
      marker.add(markerDiamond);
      markerRing = new THREE.Mesh(
        new THREE.RingGeometry(1.8, 2.4, 24),
        new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
      );
      markerRing.rotation.x = -Math.PI / 2;
      markerRing.position.y = 0.1;
      marker.add(markerRing);
      scene.add(marker);
    }
    marker.visible = true;
    marker.position.set(x, 0, z);
    MH._markerPos = { x: x, z: z };
  }

  function clearMarker() {
    if (marker) marker.visible = false;
  }

  function say(lines) {
    for (var i = 0; i < lines.length; i++) dialogueQueue.push(lines[i]);
  }

  function setStage(s) {
    stage = s;
    var m = MISSIONS[active];
    if (active === 0) {
      if (s === 0) {
        MH.hud.setObjective('Go to the red coupe in the parking lot');
        markerAt(MH.world.SPOTS.coupe.x, MH.world.SPOTS.coupe.z);
      } else if (s === 1) {
        MH.hud.setObjective('Steal the coupe — press F near it');
        markerAt(MH.world.SPOTS.coupe.x, MH.world.SPOTS.coupe.z);
      } else if (s === 2) {
        MH.hud.setObjective("Deliver the coupe to Sly's Garage");
        markerAt(MH.world.SPOTS.garage.x, MH.world.SPOTS.garage.z);
      }
    } else if (active === 1) {
      if (s === 0) {
        MH.hud.setObjective('Meet the courier at the lifeguard hut');
        markerAt(MH.world.SPOTS.beachHut.x, MH.world.SPOTS.beachHut.z);
      } else if (s === 1) {
        MH.hud.setObjective('Deliver the package to the pier — 90 seconds!');
        markerAt(MH.world.SPOTS.pierEnd.x, MH.world.SPOTS.pierEnd.z);
        stageTimer = 90;
      }
    } else if (active === 2) {
      if (s === 0) {
        MH.hud.setObjective('Go to the marina lot');
        markerAt(MH.world.SPOTS.marina.x, MH.world.SPOTS.marina.z);
      } else if (s === 1) {
        MH.hud.setObjective('Steal the golden Comet');
        markerAt(MH.world.SPOTS.marina.x, MH.world.SPOTS.marina.z);
      } else if (s === 2) {
        MH.hud.setObjective('Deliver the Comet to the hideout');
        markerAt(MH.world.SPOTS.hideout.x, MH.world.SPOTS.hideout.z);
      }
    }
  }

  function complete() {
    var m = MISSIONS[active];
    MH.state.money += m.reward;
    MH.hud.toast('Mission complete: ' + m.title + '  +' + MH.fmtMoney(m.reward), 3.5);
    MH.audio.missionDone();
    MH.audio.cash();
    MH.state.missionsDone[active] = true;
    MH.save.save();
    clearMarker();
    state = 'done';
    if (active === 2) {
      say(["Sly: That's it, Danny. The Comet is ours. Solara Bay is yours now.",
           'Story complete — free roam. The city is yours, Danny.']);
      active = -1;
      MH.hud.setObjective('Free roam — Solara Bay is yours');
    } else {
      var next = active + 1;
      active = -1;
      nextStartTimer = 3;
      MH.hud.setObjective('Next job coming in…');
      MH.missions._next = next;
    }
  }

  function fail(reason) {
    var m = MISSIONS[active];
    MH.hud.toast('Mission failed: ' + reason, 3);
    MH.audio.missionFail();
    clearMarker();
    state = 'failed';
    var retry = active;
    active = -1;
    nextStartTimer = 2.5;
    MH.missions._next = retry;
    MH.hud.setObjective('Get ready to try again…');
  }

  return {
    MISSIONS: MISSIONS,
    coupeCar: null,
    cometCar: null,
    _next: -1,

    get active() { return active; },
    get state() { return state; },

    init: function (s) {
      scene = s;
    },

    start: function (index) {
      active = index;
      stage = 0;
      state = 'active';
      guardsSpawned = false;
      say(MISSIONS[index].intro);
      setStage(0);
    },

    update: function (dt) {
      // Dialogue lines, one at a time.
      if (dialogueQueue.length > 0) {
        dialogueTimer -= dt;
        if (dialogueTimer <= 0) {
          MH.hud.subtitle(dialogueQueue.shift(), 3.4);
          dialogueTimer = 3.6;
        }
      }
      if (marker && marker.visible) {
        markerDiamond.rotation.y += dt * 2;
        markerDiamond.position.y = 4.5 + Math.sin(MH.state.time * 2.4) * 0.4;
        markerRing.scale.setScalar(1 + Math.sin(MH.state.time * 3) * 0.08);
      }
      if (nextStartTimer > 0) {
        nextStartTimer -= dt;
        if (nextStartTimer <= 0 && MH.missions._next >= 0) {
          var n = MH.missions._next;
          MH.missions._next = -1;
          this.start(n);
        }
        return;
      }
      if (active < 0 || state !== 'active') return;

      var pp = MH.player.pos;
      var S = MH.world.SPOTS;
      var ePressed = MH.input.isDown('KeyE') && !prevE;
      prevE = MH.input.isDown('KeyE');

      if (active === 0) {
        if (stage === 0) {
          // Near the coupe itself (wherever it waits).
          if (this.coupeCar &&
              MH.dist2d(pp.x, pp.z, this.coupeCar.pos.x, this.coupeCar.pos.z) < 6) setStage(1);
        } else if (stage === 1) {
          if (MH.player.car === this.coupeCar) {
            MH.police.addHeat(8, 'stole the coupe');
            say(["Sly: That's the one! Now bring her to my garage, quick."]);
            setStage(2);
          }
        } else if (stage === 2) {
          if (MH.player.car === this.coupeCar &&
              MH.dist2d(pp.x, pp.z, S.garage.x, S.garage.z) < 10) {
            complete();
          } else if (this.coupeCar && this.coupeCar.wrecked) {
            fail('the coupe was wrecked');
          }
        }
      } else if (active === 1) {
        if (stage === 0) {
          if (MH.dist2d(pp.x, pp.z, S.beachHut.x, S.beachHut.z) < 4) {
            MH.hud.setObjective('Press E to take the package');
            if (ePressed) {
              MH.audio.pickup();
              MH.police.addHeat(20, 'spotted at the hut');
              say(["Sly: They saw you! Run it to the pier, now!"]);
              setStage(1);
            }
          }
        } else if (stage === 1) {
          stageTimer -= dt;
          MH.hud.setObjective('Deliver the package to the pier — ' + MH.fmtTime(stageTimer) + ' left');
          if (MH.dist2d(pp.x, pp.z, S.pierEnd.x, S.pierEnd.z) < 4) {
            complete();
          } else if (stageTimer <= 0) {
            fail('out of time');
          }
        }
      } else if (active === 2) {
        if (stage === 0) {
          if (MH.dist2d(pp.x, pp.z, S.marina.x, S.marina.z) < 12) {
            if (!guardsSpawned) {
              guardsSpawned = true;
              MH.police.spawnFootCop(S.marina.x - 6, S.marina.z - 4);
              MH.police.spawnFootCop(S.marina.x + 6, S.marina.z + 4);
              say(["Guard: Hey! Step away from the Comet!"]);
            }
            setStage(1);
          }
        } else if (stage === 1) {
          if (MH.player.car === this.cometCar) {
            MH.police.addHeat(55, 'stole the Comet');
            say(["Sly: The whole force is coming! Get to the hideout!"]);
            setStage(2);
          }
        } else if (stage === 2) {
          if (MH.player.car === this.cometCar &&
              MH.dist2d(pp.x, pp.z, S.hideout.x, S.hideout.z) < 11) {
            complete();
          } else if (this.cometCar && this.cometCar.wrecked) {
            fail('the Comet was wrecked');
          }
        }
      }
    }
  };
})();
