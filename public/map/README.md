# Torn-map corner art

Drop the four corner images (and a test placeholder) here. Served at the site
root, so `guardians/public/map/nw.png` is referenced as `/map/nw.png`.

Each Guardian family uncovers one corner by finishing the decryption challenges.
The family → corner mapping lives in
[`core_api/src/config/missions.js`](../../../core_api/src/config/missions.js):

| Family  | Corner | File      |
|---------|--------|-----------|
| Wallace | NW     | `nw.png`  |
| Bryson  | NE     | `ne.png`  |
| Morgan  | SW     | `sw.png`  |
| Abassi  | SE     | `se.png`  |
| Doe *(test account)* | — | `test.png` |

While the mission is in progress, the panel shows a 2×2 grid of the four corners
above, filling in as each family decrypts theirs (NW, NE / SW, SE — cut your
source map into those quarters for `nw/ne/sw/se.png`). Corners reveal as soon as
that family reports, not all at once.

**`final.png`** — the single fully-assembled map, shown once ALL four real
families have reported. This replaces the per-corner grid with one hero image as
the mission's payoff, so it should be the same map at full resolution (not just
the four quarters stitched together — feel free to add detail/flourish that
wasn't visible per-corner).

Missing files degrade gracefully (the corner/final image is hidden, falling back
to a text label), so the flow is testable before the art arrives.
