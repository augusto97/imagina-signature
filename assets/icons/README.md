# Imagina Signatures — hosted icon set

PNG icons referenced by the **Social icons** and **Contact** blocks in the
exported email HTML. Email clients do not render inline SVG or `data:`
images, so every icon is a small PNG served from the plugin directory of
the customer's own site:

```
<plugin url>/assets/icons/<shape>-<tone>/<name>.png
```

- 96 × 96 px (crisp at up to 48 px on 2× screens), palette PNGs, ~1 KB each.
- Shapes: `circle`, `rounded` (rounded square), `plain` (glyph only, transparent).
- Tones: `brand` (official brand colour — white glyph on it for shapes),
  `dark` (#111827), `gray` (#6b7280), `light` (for dark backgrounds:
  white shape with a dark glyph, or a white glyph when plain).
- `manifest.json` lists every icon, its display name, brand colour and
  available variants. The editor imports it to build its pickers.

**Generated files — do not edit by hand.** Change
`scripts/icons/generate.mjs` and run `npm run icons:build`, then commit
this folder.

## Licences

| Source | Used for | Licence |
| --- | --- | --- |
| [Simple Icons](https://simpleicons.org) (`simple-icons` npm package) | Brand glyphs: X, Facebook, Instagram, YouTube, TikTok, GitHub, WhatsApp, Telegram, Threads, Bluesky, Mastodon, Pinterest, Behance, Dribbble, Medium, Discord, Spotify, Vimeo, Twitch, Reddit, Snapchat, Calendly | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) |
| [Lucide](https://lucide.dev) (`lucide-static` npm package) | Generic glyphs: website (globe), email, phone, mobile, address (map pin), calendar, link | ISC |
| Imagina Signatures | LinkedIn "in" letterforms and the composition of every icon (shapes, colours, gradients) | GPL-2.0-or-later, like the rest of the plugin |

Lucide licence (ISC):

> Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as
> part of Feather (MIT). All other copyright (c) for Lucide are held by
> Lucide Contributors 2022.
>
> Permission to use, copy, modify, and/or distribute this software for any
> purpose with or without fee is hereby granted, provided that the above
> copyright notice and this permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
> WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
> MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
> ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
> WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
> ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
> OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

## Trademarks

Brand names and logos are trademarks of their respective owners. They are
included only so users can link to their own profiles on those services,
which is the use most brand guidelines allow. Simple Icons'
[disclaimer](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md)
applies: check each brand's guidelines before using its mark in other ways.
