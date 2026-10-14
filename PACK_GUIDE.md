# Desk Drawer buddy pack guide

This guide describes the `.deskpack` format currently accepted by Desk Drawer.
Packs are data only: the app never runs JavaScript, shell commands, or other
code from a pack.

## Folder contents

Create a folder with this structure and zip its contents as a `.deskpack`:

```text
my-pack/
  pack.json
  sprites/
    buddy.png
```

The sprite sheet is a PNG arranged as 32×32 pixel frames. It must be no larger
than 4 MB or 4096 pixels on either side, and must contain every frame index
used by the manifest. Each `.deskpack` may be at most 20 MB.

In **Settings > Buddy**, the custom-buddy creator accepts PNG sprite sheets
with 32×32 cells, at least 57 frames, and the same row-major animation indices
as the bundled Tabby and Slime atlases. It creates a pack that uses the saved
Behavior Lab rules. Smaller sheets can still be imported as hand-authored
`.deskpack` files when their manifest references only frames they contain.

## Manifest

The manifest is JSON with `schemaVersion: 1`. `buddy.sprite` must be a
relative path matching `sprites/<name>.png`; absolute paths and traversal
components are rejected. Frame dimensions must be exactly 32×32. `idle`,
`walk`, and `sleep` animations are required. Personality values are integers
from 0 to 100.

```json
{
  "schemaVersion": 1,
  "id": "my-buddy",
  "name": "My Buddy",
  "author": "Your name",
  "version": "1.0.0",
  "license": "CC0-1.0",
  "buddy": {
    "sprite": "sprites/buddy.png",
    "frame": { "w": 32, "h": 32 },
    "anchor": { "x": 16, "y": 31 },
    "animations": {
      "idle": { "frames": [0, 1], "fps": 2, "loop": true },
      "walk": { "frames": [2, 3], "fps": 6, "loop": true },
      "sleep": { "frames": [4], "fps": 1, "loop": true }
    }
  },
  "personality": {
    "energy": 50,
    "curiosity": 50,
    "chattiness": 30,
    "clinginess": 20,
    "sleepiness": 60
  },
  "lines": {},
  "rules": []
}
```

The anchor coordinates are integers from 0 to 31. Animation names are limited
to `idle`, `blink`, `walk`, `sit`, `sleep`, `yawn`, `perk`, `happy`, `curious`,
`eat`, `carried`, and `fall`. Each animation has 1–256 non-negative frame
indices, `fps` from 0.1 to 30, and a boolean `loop`.

Dialogue groups are named keys in `lines`; each group contains at most 100
non-empty strings, each no longer than 200 characters. The total rule limit
is 200. Rules and actions use the same whitelist as the built-in Behavior Lab.
An animation or dialogue-group action must reference a name declared in this
manifest. Unknown fields and actions are rejected.
`setState: "hidden"` is rejected for behavior actions; hide/show is reserved for
explicit Buddy mode and operating-system safety handling.

## Test and import

1. Run `npm test` and `npm run build` from the project root.
2. In Behavior Lab, load a sample pack and inspect the JSON validation status.
3. Export the pack, import the `.deskpack`, review the preview, and confirm
   installation. Imported packs remain disabled until explicitly enabled.
4. Verify the imported sprite and behavior, then disable and delete the test
   pack.
5. Test malformed JSON, traversal paths, unexpected ZIP entries, duplicate
   entries, and oversized or invalid images; each must be rejected.

Never include secrets, personal data, executable content, SVGs, or assets you
do not have permission to distribute. Declare the actual license for your art
and dialogue in the manifest.
