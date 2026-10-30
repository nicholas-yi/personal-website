# nicholasyi.me

Source for [nicholasyi.me](https://nicholasyi.me), my personal website: research, writing, and a few things I like, set inside an interactive ASCII rainstorm.

A static site in plain HTML, CSS, and JavaScript. No framework, build step, tracking, external fonts, or runtime dependencies.

## What's on the page

- **ASCII rain** that bends around your cursor in a teardrop-shaped wake, beads and slides off a little house's roof, and ripples a puddle at the bottom of the screen.
- **Click-to-open umbrellas** anchored to the page that catch rain and leave a dry pocket below. A native 24-by-28px umbrella cursor marks eligible empty space on fine-pointer devices; its canopy reflects the open/closed state. Links, selectable copy, controls, graph, and house keep their familiar cursors and behavior. Touch and forced-colors mode use native cursors.
- **Procedural sound** (opt-in): looping rain layers and drips plus soft interaction sounds, all synthesized with the Web Audio API with no audio files.
- **A graph playground**: connect nodes for my work and interests and get a short reply about how they relate. The graph starts quietly, without introductory/status filler or an empty result panel; meaningful selections, results, errors, and accessible keyboard help remain.
- **A separate About page**: the full staircase biography lives at [about.html](public/about.html), reachable from the global navigation on every page. Home ends with a roofed fireplace and a small About link; the legacy `#about` anchor still reaches that ending. Every page uses the same responsive, rain-catching roof and dry house body around its fireplace.
- **Sidequest staircases**: semantic lists with faint graph-like dots and connectors, responsive indentation, and a stepped closing line. The dots echo graph ink colors; the fireplace has a static, restrained amber glow. The short list runs from shorter to longer phrases; wording stays in HTML and works without JavaScript. Redundant section subtitles and graph instruction paragraphs are omitted; accessible graph instructions remain.
- **Compartmentalized layout**: Home contains the introduction, selected work, graph, and roofed fireplace. The redundant Threads section and its notes navigation item are removed. All pages use one aligned row of work, play, about, and links, with 44px navigation targets.
- **Consistent typography**: serif reading copy and headings across all pages, with monospaced navigation, controls, labels, and ASCII art.
- **Accessibility**: respects reduced-motion preferences, pauses while the tab is hidden, supports keyboard navigation, and keeps all content and links usable without JavaScript.

## Run locally

Requires Node.js 20 or newer.

```sh
npm start   # http://127.0.0.1:4173
npm test    # Node's built-in test runner
```

## Deployment

Hosted on Cloudflare Workers (static assets) with Git-based deploys: every push to `main` goes live, and other branches get preview URLs. [wrangler.jsonc](wrangler.jsonc) publishes only `public/`. The build runs `npm test`, so a failing test blocks the deploy. [GitHub Actions](.github/workflows/test.yml) also runs the tests on every push and pull request.

To preview with Cloudflare's local runtime, run `npx wrangler dev`.

## Layout

```
public/      the site itself (HTML, CSS, JS)
tests/       unit tests for the rain, audio, graph, and page contracts
server.mjs   local-only preview server
```

The layout, ASCII art, animation, and sound are original.
