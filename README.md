# Sweeping Area

An interactive educational tool that teaches area through geometric sweeping, dissection, and Cavalieri's principle. Originally written in Dart 1.x (~2015-2019), now migrated to **TypeScript + Canvas API**.

## What it does

Students work through a sequence of activities:

1. **Set up** — position and configure a sweeper (a line segment that defines one side of a parallelogram)
2. **Sweep** — drag the sweeper to trace out a parallelogram and see its area
3. **Cut & Rearrange** — dissect the shape and rearrange the pieces to form a rectangle
4. **Cavalieri** — set sweeper to horizontal.  Then, tilt the device (or simulate tilting) and watch the sweeper "fall" to trace out a shape that has constant cross-sectional dimension, and hence area equal to length * height, demonstrating Cavalieri's principle

An alternative entry path uses a **Geoboard**: students draw a freehand polygon by dragging vertices on a peg grid, then proceed directly to Cut & Rearrange with their custom shape.

## Tech stack

- **Vite** + **TypeScript**
- **Canvas 2D API** (no rendering library)
- **Vitest** for unit tests

## Getting started

```bash
npm install
npm run dev        # dev server at http://localhost:5175
npm run build      # production build
npm run test       # run unit tests
```

## App entry points

| URL | Description |
|-----|-------------|
| `http://localhost:5175/` | Main app (default sweep path) |
| `http://localhost:5175/?testShape=geoboard` | Start directly in Geoboard mode |
| `http://localhost:5175/?testShape=arrow` | Start in Cut mode with a non-convex arrow shape (dev test) |
| `http://localhost:5175/harness.html` | Gallery test harness (see below) |

---

## Gallery integration

The app is designed to be embedded as an `<iframe>` and communicate with a parent shell via the **MessagePort** protocol. This enables gallery-style workflows where students can publish, browse, and remix each other's work.

### Protocol

The handshake uses a `MessageChannel` so all traffic is directed (not broadcast):

**Step 1 — App signals readiness:**
```
App → parent window:  { type: "ready" }
```
Posted to `window.parent` as soon as the app initialises.

**Step 2 — Parent transfers a port:**
```
Parent → app iframe:  postMessage({ type: "connect" }, "*", [port])
```
The parent creates a `MessageChannel` and transfers one end (`port2`) to the iframe. The app receives this and listens on the port for all subsequent messages.

**Step 3 — Ongoing traffic on the port:**

| Direction | Message |
|-----------|---------|
| Parent → App | `{ type: "loadState", state: <SerializedState> }` |
| Parent → App | `{ type: "requestState" }` |
| App → Parent | `{ type: "state", state: <SerializedState>, thumbnail: "<dataURL>" }` |

The thumbnail is a 200×200 JPEG `data:` URL captured from the main canvas at publish time.

### State format

```jsonc
{
  "version": 1,
  "config": {                         // optional — passed through as-is
    "rotationsAllowed": true,
    "reflectionsAllowed": true,
    "galleryUrl": "https://..."
  },
  "grid": {
    "hTicks": 20, "vTicks": 10,
    "hSubTicks": 1, "vSubTicks": 1,
    "hunits": "in", "vunits": "in"
  },
  "mode": 3,                          // 1=setup, 2=sweep, 3=cut, 5=geoboard
  "sweeper": { "x1": 2, "y1": 3, "x2": 5, "y2": 7 },  // modes 1–2 only
  "sweep":   { "draggedUnits": 4, "dragIsVertical": true }, // mode 2 only
  "pieces": [                         // modes 3 and 5
    {
      "vertices": [{ "x": 2, "y": 6 }, ...],
      "color": { "r": 136, "g": 136, "b": 255, "a": 0.5 }
    }
  ],
  "cutSubMode": "rearrange"           // mode 3 only: "choose"|"cutAll"|"custom"|"rearrange"
}
```

**Notes:**
- Coordinates are in *sub-tick* space (`value = ticks × hSubTicks`). With the default `hSubTicks=1` this equals tick coordinates directly.
- Mid-Cavalieri states (mode 4) are never serialized. If `requestState` arrives while the Cavalieri fall is in progress, the fall is stopped, the shape is committed to cut mode, and *that* state is serialized.
- The `config` block is owned by the parent shell / activity author. The app accepts and restores it as-is. If the shell needs to enforce activity constraints (e.g. no rotations allowed), it should re-apply those after calling `loadState`.
- All states are restorable — setup, mid-sweep, post-cut, geoboard, rearranged pieces, etc.

### Relevant source files

| File | Role |
|------|------|
| `src/messaging.ts` | `initMessaging()` — wires up the `ready` signal and `MessagePort` handler |
| `src/serialization.ts` | `serializeState()`, `deserializeState()`, `captureThumb()` |
| `src/harness.ts` | Test harness logic (gallery column, publish, modal) |
| `harness.html` | Test harness HTML entry point |

---

## Gallery test harness

`harness.html` is a self-contained test page that simulates the gallery shell. Use it to verify the full publish/load round-trip before integrating with the real gallery.

**Setup:**
```bash
npm install && npm run dev
```
Then open `http://localhost:5175/harness.html` in your browser.

**Layout:**
- **Left column** — scrollable gallery of published thumbnails, with a Publish button at the bottom
- **Right panel** — the app, live in an iframe

**Workflow:**
1. Open `http://localhost:5175/harness.html`
2. The harness automatically connects to the app via `MessagePort` (status shows "Connected")
3. Interact with the app — set up the sweeper, sweep, cut, rearrange pieces, or use the Geoboard
4. Click **Publish** — a thumbnail of the current state is added to the gallery column
5. Continue working and publish again; each publish adds a new entry (the gallery is append-only)
6. Click any thumbnail — a modal appears with a larger preview
7. Click **Load into workspace** — the app restores to exactly that saved state, ready to remix

The harness intentionally passes `config` through unchanged, matching the app's production behaviour. Config override (for activity-level constraints) is a responsibility of the real gallery shell.
