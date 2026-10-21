// themes.js - ten built-in themes. 'cat' holds palette overrides; the accessory layer is chosen by theme id (see sprites.js ACC).

export const ORDER = ["cozy", "night", "transparent", "frost", "paper", "arcade", "forest", "savanna", "terminal", "highcontrast"];

export const THEMES = {
  "cozy": {
    "name": "Cozy",
    "mode": "dark",
    "sky": [
      "#2a1f2d",
      "#3b2a38"
    ],
    "stage": {
      "top": "#f3d9c4",
      "left": "#d9a88c",
      "right": "#c28f78",
      "rug": "#e8b9a0"
    },
    "glass": {
      "fill": "rgba(255,240,230,0.14)",
      "stroke": "rgba(255,230,210,0.5)"
    },
    "text": "#fbeee2",
    "textDim": "#cdb8a8",
    "accent": "#ff9f6b",
    "accent2": "#ffd08a",
    "halo": "#ffffff",
    "bg": {
      "mode": "stars",
      "colors": [
        "#ffe3c2",
        "#ffffff"
      ]
    },
    "font": "system-ui, sans-serif",
    "radius": 14,
    "border": 1,
    "cat": {
      "B": "#2b2430",
      "O": "#120e16",
      "S": "#1f1a25",
      "H": "#463c52",
      "E": "#9b5a6a",
      "N": "#f0a1a1",
      "Y": "#ffd16b",
      "A": "#e8684a",
      "a": "#b84a34",
      "w": "#9a8aa0"
    }
  },
  "night": {
    "name": "Night",
    "mode": "dark",
    "sky": [
      "#05050f",
      "#0b0b22"
    ],
    "stage": {
      "top": "#2a2a55",
      "left": "#1d1d40",
      "right": "#15152f",
      "rug": "#34346a"
    },
    "glass": {
      "fill": "rgba(140,150,255,0.12)",
      "stroke": "rgba(170,180,255,0.45)"
    },
    "text": "#e8e9ff",
    "textDim": "#a3a6d6",
    "accent": "#8c9bff",
    "accent2": "#c3a6ff",
    "halo": "#ffffff",
    "bg": {
      "mode": "stars",
      "colors": [
        "#ffffff",
        "#b7c3ff"
      ]
    },
    "font": "system-ui, sans-serif",
    "radius": 14,
    "border": 1,
    "cat": {
      "A": "#6a74d8",
      "a": "#4a52a8",
      "X": "#f6e6a8",
      "Y": "#ffe9a0"
    }
  },
  "transparent": {
    "name": "Transparent",
    "mode": "dark",
    "sky": [
      null,
      null
    ],
    "stage": {
      "top": "rgba(255,255,255,0.10)",
      "left": "rgba(255,255,255,0.06)",
      "right": "rgba(255,255,255,0.04)",
      "rug": "rgba(255,255,255,0.08)"
    },
    "glass": {
      "fill": "rgba(255,255,255,0.08)",
      "stroke": "rgba(255,255,255,0.55)"
    },
    "text": "#ffffff",
    "textDim": "#dfe6ee",
    "accent": "#7fd3ff",
    "accent2": "#b8f0ff",
    "halo": "#ffffff",
    "bg": {
      "mode": "none",
      "colors": []
    },
    "font": "system-ui, sans-serif",
    "radius": 16,
    "border": 1,
    "catAlpha": 0.9,
    "cat": {
      "O": "#ffffff",
      "B": "#1b1830",
      "H": "#4a4570"
    }
  },
  "frost": {
    "name": "Frost",
    "mode": "light",
    "sky": [
      "#cfe8f7",
      "#e8f5fc"
    ],
    "stage": {
      "top": "#f4fbff",
      "left": "#bfdcee",
      "right": "#a8cde4",
      "rug": "#dff1fa"
    },
    "glass": {
      "fill": "rgba(255,255,255,0.35)",
      "stroke": "#ffffff"
    },
    "text": "#1b3a4f",
    "textDim": "#4f7389",
    "accent": "#4aa8d8",
    "accent2": "#8fd0f0",
    "halo": "#ffffff",
    "bg": {
      "mode": "snow",
      "colors": [
        "#ffffff",
        "#bfe3f5"
      ]
    },
    "font": "system-ui, sans-serif",
    "radius": 18,
    "border": 1,
    "cat": {
      "H": "#5d7a92",
      "A": "#8fd0f0",
      "a": "#5fb0d8",
      "X": "#d8f3ff",
      "Y": "#bfeaff",
      "w": "#9fc0d4"
    }
  },
  "paper": {
    "name": "Paper",
    "mode": "light",
    "sky": [
      "#f3eee2",
      "#f3eee2"
    ],
    "stage": {
      "top": "#fffaf0",
      "left": "#e5dcc6",
      "right": "#d6ccb0",
      "rug": "#f0e6cf"
    },
    "glass": {
      "fill": "rgba(255,255,255,0.6)",
      "stroke": "#2b2620"
    },
    "text": "#2b2620",
    "textDim": "#6b6256",
    "accent": "#d9482b",
    "accent2": "#2f6fb0",
    "halo": "#2b2620",
    "bg": {
      "mode": "dots",
      "colors": [
        "#cfc6b0"
      ]
    },
    "font": "Georgia, serif",
    "radius": 4,
    "border": 2,
    "cat": {
      "B": "#2b2b2b",
      "O": "#111111",
      "S": "#222222",
      "H": "#4a4a4a",
      "A": "#f2c744",
      "X": "#e8a0a0",
      "Y": "#f2c744"
    }
  },
  "arcade": {
    "name": "Arcade",
    "mode": "dark",
    "sky": [
      "#0d0020",
      "#12002b"
    ],
    "stage": {
      "top": "#2b0a5e",
      "left": "#1b063d",
      "right": "#110327",
      "rug": "#3d0f86"
    },
    "glass": {
      "fill": "rgba(255,0,200,0.10)",
      "stroke": "#ff3df2"
    },
    "text": "#f4eaff",
    "textDim": "#b79bd6",
    "accent": "#ff3df2",
    "accent2": "#29f2ff",
    "halo": "#29f2ff",
    "bg": {
      "mode": "stars",
      "colors": [
        "#ff3df2",
        "#29f2ff",
        "#ffe94d"
      ]
    },
    "font": "'Courier New', monospace",
    "radius": 2,
    "border": 2,
    "cat": {
      "H": "#5a2a8a",
      "Y": "#29f2ff",
      "A": "#ff3df2",
      "a": "#a3199a",
      "N": "#ff9ad8"
    }
  },
  "forest": {
    "name": "Forest",
    "mode": "dark",
    "sky": [
      "#0a1f17",
      "#0f2a1f"
    ],
    "stage": {
      "top": "#2f5a3e",
      "left": "#234632",
      "right": "#1a3626",
      "rug": "#3d6e4a"
    },
    "glass": {
      "fill": "rgba(200,255,210,0.10)",
      "stroke": "rgba(190,240,200,0.45)"
    },
    "text": "#e6f5e8",
    "textDim": "#9cc4a4",
    "accent": "#7bd88f",
    "accent2": "#e6d27a",
    "halo": "#e6f5a0",
    "bg": {
      "mode": "fireflies",
      "colors": [
        "#e6f5a0",
        "#b8ff9a"
      ]
    },
    "font": "system-ui, sans-serif",
    "radius": 12,
    "border": 1,
    "cat": {
      "A": "#6fcf7d",
      "a": "#3f9a52",
      "Y": "#c8ff7a",
      "H": "#2f4a3a"
    }
  },
  "savanna": {
    "name": "Savanna Dusk",
    "mode": "dark",
    "sky": [
      "#2d1b3d",
      "#6b2f52",
      "#c85a4a",
      "#f0a05a"
    ],
    "stage": {
      "top": "#f0b27a",
      "left": "#c97a4f",
      "right": "#a35c3c",
      "rug": "#e8956a"
    },
    "glass": {
      "fill": "rgba(255,220,180,0.15)",
      "stroke": "rgba(255,214,170,0.55)"
    },
    "text": "#fff1e0",
    "textDim": "#e0b99a",
    "accent": "#ffb45a",
    "accent2": "#ff6f61",
    "halo": "#ffe7b0",
    "bg": {
      "mode": "stars",
      "colors": [
        "#ffe7b0",
        "#ffffff"
      ]
    },
    "font": "system-ui, sans-serif",
    "radius": 14,
    "border": 1,
    "cat": {
      "A": "#ff8a3d",
      "a": "#c5571f",
      "Y": "#ffb84a",
      "H": "#4a3558"
    }
  },
  "terminal": {
    "name": "Terminal",
    "mode": "dark",
    "sky": [
      "#010603",
      "#020a04"
    ],
    "stage": {
      "top": "#0b2a12",
      "left": "#071a0b",
      "right": "#04110a",
      "rug": "#0e3a18"
    },
    "glass": {
      "fill": "rgba(0,255,100,0.06)",
      "stroke": "#19ff6a"
    },
    "text": "#b6ffcb",
    "textDim": "#5fbf7f",
    "accent": "#19ff6a",
    "accent2": "#a0ffc0",
    "halo": "#19ff6a",
    "bg": {
      "mode": "matrix",
      "colors": [
        "#19ff6a",
        "#0e8a3a"
      ]
    },
    "font": "'Courier New', monospace",
    "radius": 0,
    "border": 1,
    "cat": {
      "B": "#07130a",
      "O": "#19ff6a",
      "S": "#050e07",
      "H": "#124a22",
      "E": "#0e8a3a",
      "N": "#19ff6a",
      "Y": "#19ff6a",
      "w": "#0e8a3a",
      "X": "#19ff6a"
    }
  },
  "highcontrast": {
    "name": "High Contrast",
    "mode": "dark",
    "sky": [
      "#000000",
      "#000000"
    ],
    "stage": {
      "top": "#000000",
      "left": "#000000",
      "right": "#000000",
      "rug": "#000000"
    },
    "glass": {
      "fill": "rgba(0,0,0,0.95)",
      "stroke": "#ffffff"
    },
    "text": "#ffffff",
    "textDim": "#ffffff",
    "accent": "#ffe600",
    "accent2": "#00e5ff",
    "halo": "#ffe600",
    "bg": {
      "mode": "none",
      "colors": []
    },
    "font": "system-ui, sans-serif",
    "radius": 0,
    "border": 3,
    "cat": {
      "O": "#ffffff",
      "B": "#000000",
      "S": "#000000",
      "H": "#333333",
      "Y": "#ffe600",
      "E": "#ffffff",
      "N": "#ffffff",
      "w": "#ffffff"
    }
  }
};
