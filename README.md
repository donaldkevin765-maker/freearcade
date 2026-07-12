# FreeArcade

**Free Arcade Games — 25 browser games. No download needed.**

A collection of arcade, puzzle, action, and strategy games built with Godot 4.2.2. All assets are 100% original and procedurally generated — safe for monetization with AdSense and other ad networks.

## Live Site

https://freearcade.vercel.app

## Tech Stack

- **Engine**: Godot 4.2.2 (GDScript)
- **Web Build**: HTML5 / WebAssembly
- **Hosting**: Vercel (static files)

## Monetization

- Google AdSense (auto ads + banner ads)
- Popunder ads
- Push notification ads
- Offer wall
- Ko-fi donations

## Structure

| Path | Content |
|---|---|
| `index.html` | Main page (SEO, ads, game canvas) |
| `index.wasm` + `index.js` | Godot engine WebAssembly |
| `index.pck` | Game assets |
| `monetization.js` | Popunder, push, offer wall scripts |
| `robots.txt` | AI crawler configuration |
| `sitemap.xml` | Search engine sitemap |
| `godot-source/` | Godot source files (.gd, .tscn) |

## Development

Open `godot-source/` in Godot 4.2.2 to edit the source. Export to HTML5 and replace root files.
