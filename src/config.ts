// All tunable numbers in one place.

export type ItemKind = 'pumpkin' | 'apple' | 'cider' | 'pie';

export const CFG = {
  startMoney: 0,
  player: {
    speed: [5.0, 5.6, 6.3],
    speedPrice: [60, 220],
    basket: [8, 12, 16, 22, 30],
    basketPrice: [30, 100, 220, 450],
  },
  grow: {
    time: [9, 7, 5.5, 4.2], // seconds from seed to ripe
    timePrice: [80, 220, 500],
  },
  price: { pumpkin: 5, upick: 8, cider: 10, hayride: 6, maze: 10, pie: 25 },
  standSlots: 8,
  apples: { perTree: 5, regrow: 2.4 },
  press: { applesPerJug: 2, every: 1.0, maxOut: 12, maxIn: 24 },
  oven: { pumpkinsPerPie: 2, every: 1.6, maxOut: 10, maxIn: 20 },
  hayride: { seats: 6, speed: 4.2, waitAuto: 7 },
  visitors: { walk: 2.6, firstDelay: 1.2 },
  workers: { speed: 3.4, carry: 8 },
};

// Pad prices, in unlock order.
export const UNLOCK = {
  patchB: 20,
  upick: 60,
  orchard: 120, // orchard + cider mill together
  farmhand1: 120,
  hayride: 200,
  driver: 150,
  maze: 260,
  bakery: 340,
  farmhand2: 220,
  giant: 700,
};
