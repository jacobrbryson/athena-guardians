# Decryption bot-check art

Drop the bot-check images here. Files in `guardians/public/` are served at the
site root, so a file `guardians/public/decryption/c1-yellow.png` is referenced in
code as `/decryption/c1-yellow.png`.

The challenges, their prompts, expected filenames, and **answer keys** are
authored in [`src/missions/challenges.ts`](../../src/missions/challenges.ts). Each
challenge already renders with an emoji/text fallback, so the flow is playable
**before** any art lands — adding images just upgrades the visuals. When you add
art, confirm the `correct` answer key matches it and remove the `// TODO author`
note for that challenge.

## Expected files (current placeholders)

| Challenge | Mechanic | Files | Answer key (`correct`) |
|-----------|----------|-------|------------------------|
| `c1-yellow-circle` | tap the one that matches | `c1-red.png`, `c1-yellow.png`, `c1-blue.png`, `c1-green.png` | option `yellow` |
| `c2-find-stars` | tap every matching tile (3×3) | *(optional)* one `c2.png` sliced into 9, **or** none (emoji tiles) | tiles `[0,4,8]` |
| `c3-pattern-next` | pick what comes next | *(emoji only — no art needed)* | option `up` (△) |
| `c4-tap-in-order` | tap tiles in sequence (1×3) | *(optional)* `c4.png`, **or** none (number tiles) | order `[1,2,0]` |
| `c5-find-the-lake` | tap the matching picture | `c5-mountain.png`, `c5-lake.png`, `c5-desert.png`, `c5-city.png` | option `lake` |

### Image-sliced grids (`c2`, `c4`)

If you supply a single `image` for a `grid` challenge, it's sliced into `rows×cols`
tiles automatically (top-left = index 0, row-major). Set the challenge's `image`
field to e.g. `/decryption/c2.png` and the `correct` indices to the tiles the
player must pick. Leave `image` unset to keep the emoji/number tiles.

## The decrypted message

The five message fragments (`cipher` → `clear`) are also in `challenges.ts`
(`DECRYPTED_MESSAGE`). Edit the `clear` text to whatever the real intercepted
message should say; keep each `cipher` roughly the same length so the reveal
lines up.
