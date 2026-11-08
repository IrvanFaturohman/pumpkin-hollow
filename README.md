# Pumpkin Hollow (prototype)

An open-map arcade idle game set on an American U-Pick pumpkin farm. Grow pumpkins, stock the farm stand, and open the farm to visitors: U-Pick, apple cider, hayride, corn maze and a pie shop. The goal is a blue ribbon at the County Fair.

Design notes: `../riset-gameplay/DESAIN-PUMPKIN-HOLLOW.md`

## Running it
```bash
npm install
npm run dev
```
Every push to `main` deploys to GitHub Pages automatically.

## Controls
- Drag anywhere (floating joystick) or use WASD / arrow keys.
- Walk on empty soil to plant. Walk over ripe pumpkins to pick them.
- Stand in a dashed zone to drop off or pick up items.
- Stand on a price tile to pay for it.
- Stand on 🚜 to start the hayride.

## Debug (⚙️ button or the `` ` `` key)
- Game speed x1/x2/x4.
- +500 coins.
- Grow all pumpkins.
- Restart.

## Tuning
All the numbers live in `src/config.ts`: prices, unlock costs, grow time, basket size, and so on.
