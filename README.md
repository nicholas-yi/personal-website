# nicholasyi.me

Source for [nicholasyi.me](https://nicholasyi.me), my personal website: research, writing, and a few things I like, set inside an interactive ASCII rainstorm.

A static site in plain HTML, CSS, and JavaScript. No framework, build step, tracking, external fonts, or runtime dependencies.

## What's on the page

- **ASCII rain** that bends around your cursor in a teardrop-shaped wake, beads and slides off a little house's roof, and ripples a puddle at the bottom of the screen.
- **Click-to-open umbrellas** anchored to the page that catch rain and leave a dry pocket below.
- **Procedural sound** (opt-in): looping rain layers and drips plus soft interaction sounds, all synthesized with the Web Audio API with no audio files.
- **A graph playground**: connect nodes for my work and interests and get a short reply about how they relate.
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
