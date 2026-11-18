// Solara Bay — saving to localStorage: money, missions, and where Danny stands.
// Saved when a mission is completed and when the game is paused.
MH.save = (function () {
  var KEY = 'solara-bay-save-v1';

  return {
    KEY: KEY,

    has: function () {
      try { return !!window.localStorage.getItem(KEY); } catch (e) { return false; }
    },

    save: function () {
      try {
        var data = {
          money: MH.state.money,
          health: MH.player.health,
          ammo: MH.player.ammo,
          missionsDone: MH.state.missionsDone.slice(),
          playerX: MH.player.pos.x,
          playerZ: MH.player.pos.z,
          savedAt: Date.now()
        };
        window.localStorage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch (e) { return false; }
    },

    load: function () {
      try {
        var raw = window.localStorage.getItem(KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (typeof data.money !== 'number' || !Array.isArray(data.missionsDone)) return null;
        return data;
      } catch (e) { return null; }
    },

    clear: function () {
      try { window.localStorage.removeItem(KEY); } catch (e) {}
    }
  };
})();
