# groundwork-web

Frontend for **Groundwork**: your life system as a book. Next.js 15, React 19, Tailwind 4, TipTap, React Flow.

## Run it

```bash
npm install
cp .env.example .env.local    # API_URL=http://localhost:4000 (where groundwork-api runs)
npm run dev                   # http://localhost:3000
```

Start **groundwork-api** first. The first visit asks you to create your account.

Production: `npm run build && npm start` (set `API_URL` in the environment; it's read at runtime).

## The universe (home screen, `/universe`)

A 3D solar system, built with three.js through React Three Fiber, drei and post-processing. Everything is drawn procedurally, so it needs no external assets.

- **Sun:** the sun at the centre is the engine.
  - Each **year-book** orbits it on its own circular orbit.
  - Every orbit has a unique radius, so no two orbits can ever touch.
  - Orbits have different tilts and speeds, with outer books moving slower.
- **Search:** search a year in the HUD and that book flies off its orbit and lands in front of you. All the other books line up in a 3D **carousel** you can move through (← / →).
  - Searching a year that doesn't exist **forges a new book**: it's born at the sun and flies to its own orbit.
- **Open:** Enter or "Open book" opens the book in 3D on today's page.
  - **The 3D pages are your real 2D pages.** Each one is rendered off-screen with the same components as write mode and photographed with `html-to-image`, with your handwriting font embedded. A drawn version shows for a moment until the photo is ready, and photos are retaken after you write.
  - **Turn pages by hand:** press and hold a page, then drag. The paper follows your pointer and curls. Grab near the top and the top corner leads; grab near the bottom and the bottom corner leads. Let go past about 40%, or flick, and it finishes turning; otherwise it falls back.
  - A quick click, or ← / →, turns a page automatically.
- **Write mode:** Enter or double-click a page.
  - The camera flies into the page, which becomes the editable paper page, with the 3D page-turn kept.
  - Esc flies you back out.
- **Release:** Esc again closes the book. ✕ (Release) sends every book drifting back to its orbit.
- **Settings:** the gear in the top-right sets orbit speed, orbit paths and glow (turn glow off on slow machines).

Code: `components/universe/` (scene, sun, book3d with the page-turn, procedural textures, HUD, write overlay) and `lib/universe.ts` (state, orbits, transitions).

## How the book works

- **One book per year.** Each **month** is a section in the contents sidebar, with a mini calendar. Days you kept the Floor are filled in, and days with notes have a dot.
- **Every day is one sheet of paper:**
  - **Front:** the tracking page (Floor, study, food, body, waves, close the day).
  - **Back:** notes, with a Google-Docs-style editor (fonts, sizes, headings, bold/italic/underline/strike, colour, highlight, alignment, lists, checklists, indent, quotes, code blocks, tables, links, sub/superscript, word count).
  - Press **Notes / Front** to turn the page.
- **Review pages:** a **weekly review** follows each Sunday, a **monthly review** follows each month's last day, and the **yearly review** is the very last page of the book. Their numbers are counted automatically from your daily pages. Each one also has a notes back.
- Use **← / →** to turn pages. Everything **saves automatically** as you write. The footer of each page shows "Saved ✓".
- **Handwriting fonts** (16 Google Fonts) can be switched from the top bar or in Settings.
- **Roadmaps:** goals drawn as graphs.
  - Double-click to add a step, and drag between steps to connect them.
  - The app works out what's unlocked, and those steps appear in "Next up" on today's page.

## Layout

```
app/
  (app)/book/[year]/[page]   the book (page ids: d-YYYY-MM-DD · w-<monday> · m-YYYY-MM · y)
  (app)/maps, maps/[id]      roadmaps + graph canvas
  (app)/settings             fonts, private wave letters, password, export
  login/                     first-run setup + login
  api/[...path]/route.ts     same-origin proxy to groundwork-api
components/book/             paper primitives, daily front, review fronts, notes back, contents, page-turn view
components/editor/           rich-text editor (TipTap) + font-size extension
components/maps/             React Flow canvas + step panel
lib/                         api client, dates, book page order, fonts, hooks (autosave, settings)
```
