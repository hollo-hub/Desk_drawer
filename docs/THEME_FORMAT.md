# Desk Drawer theme format

Themes are UTF-8 JSON files with the `.desktheme` extension and `schemaVersion: 1`.
The app validates the complete object before accepting it and canonicalizes each
color to a safe hex or `rgba()` value; theme strings are never written directly
into CSS.

Required fields are `bg`, `wall`, `drawer`, `edge`, `ink`, `accent`, `buddy`,
and `desk`. Each is a hex, `rgb()`, `rgba()`, `hsl()`, `hsla()`, or `transparent`
color. Optional `inkSecondary`, `inkMuted`, `danger`, `success`, and `warning`
fields use the same color syntax.

Optional fields:

- `font`: `pixel`, `readable`, or `mono`
- `borderWidth`: integer from 2 to 4
- `cornerStyle`: `hard` or `soft`
- `shadowStyle`: `hard` or `none`
- `effects`: `windowEffect` (`none`, `mica`, `acrylic`), `panelOpacity` (0 to 1),
  `textOutline` (boolean), and `scanlines` (boolean, defaults to false)
- `background`: safe local asset identifier, never a URL
- `stickers`: up to 12 unique safe local asset identifiers; these are available
  in the Appearance sticker picker and are added to the desk manually
- `meta`: optional `id`, `name`, `author`, `version`, `license`, and
  `description` strings; names are limited to 60 characters

The built-in Cozy, Night, Transparent, Frost, Paper, Arcade, Forest,
Savanna dusk, Terminal, and High contrast palettes use this same validator.
Theme preferences (active theme, light/dark pairing, fixed local-time schedule,
accent/opacity overrides, custom JSON themes, and buddy palette following) are
stored separately with their own `schemaVersion`.

Transparent requires the Soft window style; with Native style the app uses a
solid Paper fallback. Frost requests the configured Windows material when
available and falls back to opaque theme colors if that request fails. Neither
material is required to keep the UI readable.

Unknown fields, unsupported schema versions, malformed or unsafe colors,
external URLs, and files larger than 50 KiB are rejected. A JSON-only `.desktheme` file may reference images already installed in the
asset manager; each reference is checked before the theme is accepted.

Themes may also be exported/imported as a ZIP bundle (still named
`.desktheme`) containing exactly `theme.json` and the images referenced by
`background` or `stickers`, stored as `assets/<id>.<extension>`. PNG, JPG/JPEG,
WebP, and GIF are supported; SVG and nested archives are not. Asset IDs must
match the manifest exactly, and paths must be safe, flat asset paths. Each
image is limited to 4 MiB, 4096 px per side, and 4 megapixels; the manifest is
limited to 50 KiB and the bundle and total expanded contents to 20 MiB.
Symlinks, special files, unknown entries, duplicate entries, traversal paths,
and unreferenced or missing assets are rejected. Imported images are validated
and installed through the existing local asset manager. Applying a theme uses
its background unless the user has selected a personal desk background; its
stickers remain available to add manually and are never placed automatically.
