// sprites.js - generated pixel data. Grid chars: '.' empty, '_' erase (overlays only), others map to a palette.
// Cat grid is 32x32. Icons are 16x16 (chars k f A a B Y N). Glyphs are 8x8 ('#' = ink).

export const BASE = [
  "................................",
  "......O..................O......",
  "......OO................OO......",
  "......OHO..............OBO......",
  "......OHEO............OEBO......",
  "......OBEEO..........OEEBO......",
  "......OBEEBO........OBEEBO......",
  "....OOBBBBBBOOOOOOOOBBBBBBOO....",
  "...OBHHHHHBBBBBBBBBBBBHHHHHBO...",
  "..OBBBBBBBBBBBBBBBBBBBBBBBBBBO..",
  "..OBBBBBBBBBBBBBBBBBBBBBBBBBBO..",
  "..OBBBBBBBBBBBBBBBBBBBBBBBBBBO..",
  "..OBBBBBBBBBBBBBBBBBBBBBBBBBBO..",
  "..OBBBBBBBBBBBBBBBBBBBBBBBBBBO..",
  "..OBBBBBBBBBBBBBBBBBBBBBBBBBBO..",
  "..OBBBBBBBBBBBBBBBBBBBBBBBBBBO..",
  "..OBBBBBBBBBBBBBBBBBBBBBBBBBBO..",
  "...OBBBBBBBBBBBBBBBBBBBBBBBBO...",
  "....OBBBBBBBBBBBBBBBBBBBBBBO....",
  "......OSSSSSSSSSSSSSSSSSSO......",
  "......OBBBBBBBBBBBBBBBBBBO......",
  ".....OHHHBBBBBBBBBBBBBBBBBO.....",
  ".....OHBBBBBBBBBBBBBBBBBBBO.....",
  ".....OBBBBBBBBBBBBBBBBBBBBO.....",
  ".....OBBBBBBBBBBBBBBBBBBBBO.....",
  ".....OBBBBBBBBBBBBBBBBBBBBO.....",
  ".....OBBBBBBBBBBBBBBBBBBBBO.....",
  "....OBBBBBBBBBBBBBBBBBBBBBBO....",
  "....OBBBBBBBBBBOOBBBBBBBBBBO....",
  "....OBBBBBBBBBBOOBBBBBBBBBBO....",
  "....OBBBOBBBBBBOOBBBBBBOBBBO....",
  "....OOOOOOOOOOOOOOOOOOOOOOOO...."
];

export const EYES = {
  open: { y: 11, rows: [".YYY.", "YWPYY", "YYPYY", ".YYY."] },
  blink: { y: 11, rows: [".....", ".....", "OOOOO", "....."] },
  happy: { y: 11, rows: ["..O..", ".O.O.", "O...O", "....."] },
  sleep: { y: 11, rows: [".....", "O...O", ".OOO.", "....."] },
  focus: { y: 11, rows: [".....", "OOOOO", "YYPYY", ".YYY."] },
  wide: { y: 10, rows: [".YYY.", "YYYYY", "YWPYY", "YYPYY", "YYYYY", ".YYY."] },
  lookLeft: { y: 11, rows: [".YYY.", "YPYYY", "YPYYY", ".YYY."] },
  lookRight: { y: 11, rows: [".YYY.", "YYYPY", "YYYPY", ".YYY."] },
  lookDown: { y: 11, rows: [".YYY.", "YYYYY", "YYPYY", ".YPY."] },
  lookUp: { y: 11, rows: [".YPY.", "YYPYY", "YYYYY", ".YYY."] }
};

export const MOUTH = {
  neutral: {"x": 14, "y": 17, "rows": ["O..O", ".OO.", "...."]},
  smile: {"x": 13, "y": 17, "rows": ["O....O", ".OOOO."]},
  open: {"x": 14, "y": 17, "rows": ["OOOO", "OMMO", "OTTO"]},
  flat: {"x": 14, "y": 17, "rows": ["OOOO"]}
};

export const NOSE = {"x": 15, "y": 16, "rows": ["NN"]};

export const WHISKERS = [
  {"x": 3, "y": 15, "rows": ["wwww"]},
  {"x": 3, "y": 17, "rows": ["wwww"]},
  {"x": 25, "y": 15, "rows": ["wwww"]},
  {"x": 25, "y": 17, "rows": ["wwww"]},
  {"x": 0, "y": 16, "rows": ["ww"]},
  {"x": 30, "y": 16, "rows": ["ww"]}
];

export const TAIL = [
  {"x": 26, "y": 19, "rows": [".OO...", "OBBO..", "OBBO..", "OBBO..", "OBBO..", ".OBBO.", ".OBBO.", ".OBBO.", ".OBBO.", ".OBBO."]},
  {"x": 26, "y": 19, "rows": ["..OO..", ".OBBO.", ".OBBO.", ".OBBO.", ".OBBO.", ".OBBO.", ".OBBO.", ".OBBO.", ".OBBO.", ".OBBO."]},
  {"x": 26, "y": 19, "rows": ["...OO.", "..OBBO", "..OBBO", "..OBBO", "..OBBO", ".OBBO.", ".OBBO.", ".OBBO.", ".OBBO.", ".OBBO."]}
];

export const EAR_TWITCH = {"x": 20, "y": 0, "rows": [".......", "....._.", "....__O", "...__OO", "..__OBO", ".__OEBO", "__OEEBO", ".OBEEBO"]};

export const WAVE = {"x": 0, "y": 19, "rows": ["..OO..", ".OBBO.", "OBHBBO", "OBBBBO", "OBBBBO", ".OBBO."]};

export const ACC = {
  cozy: [{"x": 8, "y": 19, "rows": ["aAAaAAaAAaAAaAAa", "AAaAAaAAaAAaAAaA"]}, {"x": 19, "y": 21, "rows": ["AAAO", "AaAO", "aAAO", "AAaO", "OOOO"]}],
  night: [{"x": 8, "y": 19, "rows": ["AAaaAAaaAAaaAAaa"]}, {"x": 14, "y": 20, "rows": [".XX..", "X....", "X....", "X....", ".XX.."]}],
  transparent: [],
  frost: [{"x": 8, "y": 19, "rows": ["AAaaAAaaAAaaAAaa"]}, {"x": 14, "y": 20, "rows": ["..X..", "X.X.X", ".XXX.", "X.X.X", "..X.."]}],
  paper: [{"x": 24, "y": 0, "rows": ["......XX", ".....XAX", "....AAA.", "...AAA..", "..AAA...", ".NA.....", "..O....."]}],
  arcade: [{"x": 4, "y": 7, "rows": ["AAaaAAaaAAaaAAaaAAaaAAaa"]}, {"x": 0, "y": 10, "rows": ["AAAA", "AaaA", "AaaA", "AaaA", "AaaA", "AaaA", "AAAA"]}, {"x": 28, "y": 10, "rows": ["AAAA", "AaaA", "AaaA", "AaaA", "AaaA", "AaaA", "AAAA"]}],
  forest: [{"x": 13, "y": 2, "rows": ["..AA..", ".AAAa.", "AAAAa.", ".aAa..", "..O..."]}],
  savanna: [{"x": 9, "y": 19, "rows": ["AAAAAAAAAAAAAa", ".AAAAAAAAAAAa.", "..AAAAAAAAAa..", "...AAAAAAAa...", "....AAAAAa....", ".....AAAa.....", "......Aa......"]}],
  terminal: [{"x": 1, "y": 25, "rows": ["XXX", "XXX", "XXX", "XXX", "XXX"]}],
  highcontrast: []
};

export const BASEPAL = {
  "O": "#0a0912",
  "B": "#1e1b2e",
  "S": "#15131f",
  "H": "#3a3556",
  "E": "#8a4a78",
  "N": "#e89aa8",
  "w": "#7a7499",
  "Y": "#f2d35b",
  "P": "#07060d",
  "W": "#ffffff",
  "M": "#5a2a3c",
  "T": "#e07a8a",
  "A": "#ffffff",
  "a": "#aaaaaa",
  "X": "#ffffff"
};

export const ICONS = {
  scenes: ["................", "......kkkkkkkkk.", "......kaaaaaaak.", "......kaaaaaaak.", "......kaaaaaaak.", "...kkkkkkkkkaak.", "...kAAAAAAAkkkk.", "...kAAAAAAAk....", "...kAAAAAAAk....", "kkkkkkkkkAAk....", "kfffffffkkkk....", "kfffffffk.......", "kfffffffk.......", "kfffffffk.......", "kkkkkkkkk.......", "................"],
  focus: ["................", "......kkkk......", "......kkkk......", ".......kkk...a..", ".....kkkfkkk..a.", "....kfffkfffk...", "...kffffkAAffk..", "...kffffkfAAfk..", "..kkffffkffAAkk.", "..kfffffkkkkffk.", "..kkfffffffffkk.", "...kfffffffffk..", "...kfffffffffk..", "....kfffffffk...", ".....kkkfkkk....", ".......kkk......"],
  clipboard: ["................", "......kkkk......", "...kkkkAAkkkk...", "...kffkkkkffk...", "...kffffffffk...", "...kffffffffk...", "...kffffffffk...", "...kfaaaaaafk...", "...kffffffffk...", "...kfaaaaaafk...", "...kffffffffk...", "...kfaaaaaafk...", "...kffffffffk...", "...kffffffffk...", "...kkkkkkkkkk...", "................"],
  links: ["................", "................", "................", "................", "kkkkkkkkk.......", "k.......k.......", "k.......k.......", "k......AAkkkkkkk", "k......AAffffffk", "kkkkkkkAAffffffk", ".......kfffffffk", ".......kfffffffk", ".......kkkkkkkkk", "................", "................", "................"],
  layouts: ["................", "................", ".kkkkkkkkkkkkkk.", ".kfffffkAAAAAAk.", ".kfffffkAAAAAAk.", ".kfffffkAAAAAAk.", ".kfffffkAAAAAAk.", ".kfffffkAAAAAAk.", ".kfffffkkkkkkkk.", ".kfffffkffffffk.", ".kfffffkffffffk.", ".kfffffkffffffk.", ".kfffffkffffffk.", ".kkkkkkkkkkkkkk.", "................", "................"],
  rename: ["................", "................", "................", "................", ".kkkkkkkkkkkkkk.", ".kffffffffffffk.", ".kfAAfAAfaaaffk.", ".kfAAfAAffafffk.", ".kffffffffafffk.", ".kfAAfAAffafffk.", ".kfAAfAAfaaaffk.", ".kffffffffffffk.", ".kkkkkkkkkkkkkk.", "................", "................", "................"],
  notes: ["................", "................", "..kkkkkkkkkkkk..", "..kAAAAAAAAAAk..", "..kAAAAAAAAAAk..", "..kAaaaaaaaaAk..", "..kAAAAAAAAAAk..", "..kAaaaaaaaaAk..", "..kAAAAAAAAAAk..", "..kAaaaaaaaaAk..", "..kAAAAAAAAAAk..", "..kAAAAAAAAAAk..", "..kAAAAAAAAAAf..", "..kkkkkkkkkkff..", "................", "................"],
  picker: ["................", "...........kkk..", "..........kkAkk.", ".........kkAAAkk", ".........kAAAAAk", ".........kkAAAkk", "..........kkAkk.", ".........kkkkk..", "........kk......", ".......kk.......", "......kk........", ".....kk.........", "....kk..........", "...kk...........", "..aa............", "................"],
  awake: ["................", "................", ".......A........", ".....A.A.A......", ".....A...A......", "................", "................", "...kkkkkkkk.....", "...kAAAAAAkkkk..", "...kffffffk..k..", "...kffffffk..k..", "...kffffffkkkk..", "...kffffffk.....", "...kkkkkkkk.....", "................", "..kkkkkkkkkkk..."],
  pin: ["................", ".....kkkkkk.....", ".....kAAAAk.....", ".....kkkkkk.....", "......kkkk......", "......kffk......", "......kffk......", "......kkkk......", "....kkkkkkkk....", "........k.......", "........k.......", "........k.......", "........k.......", "........k.......", "........k.......", "................"],
  tidy: ["............A...", "...........A.A..", "..........A.A...", ".kkkkkk....A....", ".kffffk.........", ".kkkkkkkkkkkkkk.", ".kffffffffffffk.", ".kffffffffffffk.", ".kffffffffffffk.", ".kffffffffffffk.", ".kffffffffffffk.", ".kffffffffffffk.", ".kffffffffffffk.", ".kkkkkkkkkkkkkk.", "................", "................"],
  buddy: ["................", "................", "....k......k....", "....k......k....", "...k........k...", "...kkkkkkkkkk...", "...kBBBBBBBBk...", "...kBBBBBBBBk...", "...kBYYBBYYBk...", "...kBBBBBBBBk...", "...kBBBNNBBBk...", "...kBBBBBBBBk...", "...kkkkkkkkkk...", "................", "................", "................"]
};

export const GLYPHS = {
  check: ["........", "......#.", ".....##.", "#...##..", "##.##...", ".###....", "..#.....", "........"],
  close: ["........", "##....##", ".##..##.", "..####..", "...##...", "..####..", ".##..##.", "##....##"],
  plus: ["...##...", "...##...", "...##...", "########", "########", "...##...", "...##...", "...##..."],
  minus: ["........", "........", "........", "########", "########", "........", "........", "........"],
  chevR: ["..#.....", "...#....", "....#...", ".....#..", "....#...", "...#....", "..#.....", "........"],
  chevD: ["........", "#.....#.", ".#...#..", "..#.#...", "...#....", "........", "........", "........"],
  play: ["#.......", "###.....", "#####...", "#######.", "#####...", "###.....", "#.......", "........"],
  pause: ["........", ".##..##.", ".##..##.", ".##..##.", ".##..##.", ".##..##.", ".##..##.", "........"],
  stop: ["........", ".######.", ".######.", ".######.", ".######.", ".######.", ".######.", "........"],
  search: [".####...", "#....#..", "#....#..", "#....#..", ".####...", "....##..", ".....##.", "......##"],
  pinG: ["..####..", "..#..#..", "..####..", "...##...", ".######.", "...##...", "...##...", "...#...."],
  trash: ["..####..", "########", "........", ".#.#.#..", ".#.#.#..", ".#.#.#..", ".#.#.#..", ".#####.."],
  copy: ["#####...", "#...#...", "#.#####.", "#.#...#.", "#.#...#.", "..#...#.", "..#####.", "........"],
  undo: ["..#.....", ".##.....", "#######.", ".##...##", "..#....#", "......##", ".####...", "........"],
  star: ["...##...", "...##...", "########", ".######.", "..####..", "..#..#..", ".#....#.", "........"],
  drag: ["........", ".#..#...", "........", ".#..#...", "........", ".#..#...", "........", "........"]
};
