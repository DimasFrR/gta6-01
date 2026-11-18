[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/DimasFrR/gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/DimasFrR/gta6-01/reward.svg)](https://make.fun/c/gta6-01)

# Solara Bay

A sun-soaked open-world crime game for the **make.fun `gta6-01`** bounty
("Make GTA 6"). Explore the coastal city of **Solara Bay** on foot and by car,
steal cars, outrun the police, and run three story missions for the fixer
Selma "Sly" Ortiz. Everything is original: the city, the characters, the
story, the art and the music are all made for this game.

## The city

Solara Bay is a grid of avenues and streets with towers, plazas, palm trees, a
sandy beach and the sea to the south, all under a low sunset sun. Traffic
cars follow the roads, pedestrians walk the sidewalks, and the police respond
to your wanted level with patrol cars and foot cops.

## Missions

1. **First Wheels** — steal the red coupe from the uptown lot and deliver it
   to Sly's Garage. ($500)
2. **Beach Run** — grab a package at the lifeguard hut and run it to the end
   of the pier in 90 seconds, with the beach patrol on your tail. ($800)
3. **The Golden Comet** — take the gold Comet from the guarded marina lot and
   lose a three-star wanted level to deliver it to the hideout. ($1,500)

## Controls

| Key | Action |
| --- | --- |
| W A S D | Walk / drive |
| Mouse | Look around (click the game to lock the camera) |
| Shift | Sprint |
| Space | Jump on foot / handbrake in a car |
| F | Enter / exit a car |
| E | Pick up / interact |
| 1 / 2 | Fists / pistol |
| Left click | Punch / shoot |
| R | Reload |
| P | Pause (progress saves) |
| M | Mute |

The wanted level (1–5 stars) rises when you steal cars, hit pedestrians or
police, or fight the law. Lose the police and stay clean and the heat cools
down. Health and ammo pickups are scattered around the sidewalks. Your
money, missions and position save automatically (localStorage) — use
**Continue** on the title screen to pick up where you left off.

## Sound

All sound is synthesized live with the Web Audio API — engine hum, sirens,
gunshots, pickups and a small synthwave music loop. No audio files.

## How to run

No build step. Serve the `game/` folder with any static server and open it in
desktop Chrome:

```sh
node serve.ts
# then open http://localhost:8080
```

The game plays fully offline: the only library is the vendored
`game/three.min.js` (three.js r158), and everything else is a file under
`game/`.

## Shots

`shots.json` lists the four screenshots in `screenshots/` (the first by name
is the cover). Each is a real render of the game in a browser, staged with
`?shot=…&seed=N`:

- `1-chase.jpg` — a three-star police chase, the cover
- `2-drive.jpg` — driving through downtown
- `3-foot.jpg` — Danny on foot in the city
- `4-mission.jpg` — mission 1, delivering the coupe

## Layout

```
game/
  index.html        page, HUD and screens
  three.min.js      vendored three.js r158 (the only library)
  src/
    util.js         seeded random, math helpers
    audio.js        Web Audio synth: engine, sirens, shots, music
    input.js        keyboard + mouse, pointer lock, autopilot override
    world.js        the city: roads, towers, palms, beach, sea, sky
    vehicles.js     cars, arcade driving, damage and smoke
    player.js       Danny on foot: movement, camera, fists and pistol
    traffic.js      traffic cars, pedestrians, pickups
    police.js       wanted level, pursuit cars, foot cops
    missions.js     three story missions, markers, dialogue
    hud.js          HUD, minimap, subtitles, screens
    save.js         localStorage save / continue
    shots.js        deterministic screenshot scenes
    main.js         boot, game loop, modes, car enter/exit
```

## License

MIT — see `LICENSE`.
