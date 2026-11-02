# Bundled cat buddy packs

The bundled Tabby, Midnight Cat, and Snow Cat packs are derived from the
CC0-1.0 resources supplied in `gh/stuff/tabby-cat.deskpack`. The source `pack.json` used the placeholder author name “your name”; the
bundled manifests identify it as “Uncredited local resource” rather than
attributing it to a named person.

Each pack contains one 256×128 PNG sprite sheet with 25 used 32×32 frames and
the twelve declared animations: idle, blink, walk, sit, sleep, yawn, perk,
happy, curious, eat, carried, and fall. Animation frame rates and looping
behavior come from each validated manifest. Each palette is installed as an
independent pack, so the existing active-pack selector can choose one at a
time. Installation is local, validated by the existing archive reader, and
leaves the pack disabled until the user enables it.

The provided preview GIF/PNG and `catgen.py` are not runtime dependencies. The
generator was not run and pack files cannot execute code. The palette sheets
are the only sprite assets shipped in these built-in packs.
