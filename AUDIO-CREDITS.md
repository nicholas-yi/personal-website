# Rain recording credits

The ambience uses two Creative Commons Zero (CC0) field recordings, not a synthesized white-noise bed:

| Local excerpt | Original recording | Creator | Source copy |
| --- | --- | --- | --- |
| `public/audio/garden-rain.mp3` | [Soft rain.WAV, Freesound #640655](https://freesound.org/people/barkenov/sounds/640655/) | barkenov | [MP3](https://rainsoundsforsleeping.com/audio/rain-base.mp3) |
| `public/audio/forest-rain.mp3` | [ForestRainShower1a, Freesound #383064](https://freesound.org/people/AlanCat/sounds/383064/) | AlanCat | [MP3](https://rainsoundsforsleeping.com/audio/leaves.mp3) |
| `public/audio/fireplace.mp3` | [Fireplace Sound loop](https://opengameart.org/content/fireplace-sound-loop) | PagDev | [WAV](https://opengameart.org/sites/default/files/fire.wav) |

Both original pages permit copying, modification, distribution, and commercial use without asking permission. The [source mirror's per-file licensing record](https://rainsoundsforsleeping.com/licensing/) identifies both as CC0. See the [CC0 dedication](https://creativecommons.org/publicdomain/zero/1.0/). Credit is provided voluntarily; these creators do not endorse this website.

The local files are 42-second garden and 50-second forest excerpts, lightly high-/low-pass filtered, level-balanced, and encoded at 128 kbps stereo MP3. They total about 1.5 MB. They are self-hosted; visitors never download audio from the source mirror. Runtime decoding applies a two-second equal-power overlap to each loop.

Both recordings now run exactly 25% slower than the previous tuning: garden around 0.885x, leaves around 0.96x, with slow, bounded variation (0.8625-0.9075x and 0.93-0.99x). A low-pass filter and master gain retain the hover-shelter muffling. Natural droplets replace synthesized ambient drips; interaction sounds remain generated locally.

Sound defaults enabled, but starts only after a trusted click or Enter/Space gesture. Muting remains available while recordings load. Failed requests/decode operations show an explicit error rather than silently reverting to synthetic noise. The sound context suspends while muted or the tab is hidden.

The fireplace recording is also CC0, confirmed on its OpenGameArt source page and by the creator. It is trimmed to a short excerpt, high-/low-pass filtered, level-balanced, and encoded as a stereo MP3, adding about 0.4 MB. It shares the existing audio context, seamless loop processing, master mute, and one weather timer.

As the fireplace approaches the reading area of the viewport, its crackle gain rises smoothly and rain recedes. The near/end-of-page rain gain is now 0.225 (25% below the previous 0.3). The fireplace maximum routing gain is 1.096875 (25% above the previous 0.8775, which included the earlier 35% increase). Source gains and the shared master remain separate, so these are mix coefficients rather than percentages of perceived loudness.

The crossfade uses viewport proximity or progress through the final half-screen of the document, whichever is greater. This ensures the requested mix is reached at every page's bottom even on a short viewport where the fireplace appears higher up. Otherwise fully offscreen fireplaces are silent. Proximity is measured with the existing scroll/layout pass, including when visual rain motion is paused; scrolling does not create a new sound player or bypass mute. Hover-shelter muffling is retained.

Placed umbrellas can be dragged open or folded; their state and document anchor are preserved. A click within 120px folds/unfolds in place, while a distant background click replaces the umbrella with a new open one. Dragging does not produce a toggle click. Arrow keys move a focused umbrella by 12px (36px with Shift). Graph, house, header, and footer remain foreground surfaces and cannot be covered by a dragged umbrella.

The ASCII platter, notes, tiny record sleeve, winged envelope, and document-bottom puddles are original decorative art. Hearth motion runs only while the fireplace is visible, rain motion is enabled, the document is visible, and reduced motion is not requested. Notes and the 10px square original sleeve originate at the platter; Spotify artwork is not used as a particle or animated.

The Spotify card appears only on hover, focus, or tap. An optional official player loads only when requested and unloads when the card closes or the page is hidden. There is no supported embed-volume API, no hover autoplay, and no promised 25% Spotify volume. The rain/sound controls govern this site's ambience and interaction sounds, not a cross-origin Spotify player.

Graph hover and keyboard focus retain the same 25% master-gain reduction and rain low-pass muffling as the cursor shelter, independently of the visual umbrella. The graph still releases the visual cursor shelter to keep drawing unobstructed. Quiet graph interaction also works with visual rain paused or reduced motion; it does not bypass mute or the first-gesture audio requirement.

The rain renderer uses a 64px spatial index of protected text instead of scanning every text rectangle for every glyph. Glyphs are rasterized once per resize into a small offscreen atlas, then drawn with image blits instead of repeated canvas text shaping. Document-space text/roof geometry is cached until resize, content reflow, font readiness, or an asset load; scrolling translates those cached bounds and only remeasures the fixed controls/header. Text inside already-protected house bodies and art panels is not redundantly measured. Per-drop roof collision checks no longer allocate and sort an array for each droplet.

Rain still draws at a capped 24fps with at most 1.5x canvas pixel density, preserving the number of raindrops and exact text exclusion boundaries. Puddles share that animation loop and render only when their document-bottom canvas is visible. The sticky header uses an opaque paper background rather than a live backdrop blur.

Six fixed note glyphs replace the earlier three, with staggered emission; two winged envelopes arrive on staggered 20-second cycles. Hovering/focusing the mailbox replaces those ambient arrivals with one envelope that approaches, perches until engagement ends, and departs. One cancellable timer tracks that phase; email navigation is unchanged. Reduced motion uses instant perching without a flight.

No animation spawns unbounded DOM or particle objects. The Links chair is original, static ASCII, with a three-quarter cushioned back and visible side edge, a seat opening toward the fireplace, and curved rockers. It shares the fireplace's ground row and responsive glyph sizing within its existing column. It uses no SVG, image request, mirrored text, or animation loop.

The three reflective question wisps remain compact and overlapping, rather than a tall stack; hover/focus brings a selected oval to the front. Static translucent gradients suggest fog without an animated blur. Slow CSS transform/opacity cycles let the wisps fade in and out; hover/focus restores full readability. Their fixed, keyboard-accessible hitboxes stay still. Hover/click spring impulses reuse the graph helper, stay within six pixels, and stop scheduling JavaScript frames when settled. Paused weather, hidden/offscreen scenes, and reduced motion stop decorative motion. All questions remain readable without JavaScript.

Document geometry is cached between reflows. The optional listening card is measured separately only while open, since it can extend outside the house and change placement during scrolling. Its size/visibility changes refresh the rain mask without rescanning all text. Page resizing, expanding writing, and font/image loads still refresh the document geometry.

Links and milestones form a single tall house. One roof shelters the title, the six discrete milestone floors, the optional writing, and the fireplace. Floor dividers run from wall to wall; opening a case study grows its floor rather than adding a separate house or exposing the reading area to rain.

About's supplied photo sits inside a taller, portrait-shaped ASCII frame; a face-biased CSS crop preserves its aspect ratio without altering the original file. The fireplace is taller too. An opening flower and a second, closed bud suggest growth still to come. Picture, fireplace, and flower retain equal third-width grid columns and shared ground/caption rows. Their glyph sizes follow the furniture container's width so the photo and artwork remain within their columns on narrow screens.
