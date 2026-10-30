# Rain recording credits

The ambience uses two Creative Commons Zero (CC0) field recordings, not a synthesized white-noise bed:

| Local excerpt | Original recording | Creator | Source copy |
| --- | --- | --- | --- |
| `public/audio/garden-rain.mp3` | [Soft rain.WAV, Freesound #640655](https://freesound.org/people/barkenov/sounds/640655/) | barkenov | [MP3](https://rainsoundsforsleeping.com/audio/rain-base.mp3) |
| `public/audio/forest-rain.mp3` | [ForestRainShower1a, Freesound #383064](https://freesound.org/people/AlanCat/sounds/383064/) | AlanCat | [MP3](https://rainsoundsforsleeping.com/audio/leaves.mp3) |

Both original pages permit copying, modification, distribution, and commercial use without asking permission. The [source mirror's per-file licensing record](https://rainsoundsforsleeping.com/licensing/) identifies both as CC0. See the [CC0 dedication](https://creativecommons.org/publicdomain/zero/1.0/). Credit is provided voluntarily; these creators do not endorse this website.

The local files are 42-second garden and 50-second forest excerpts, lightly high-/low-pass filtered, level-balanced, and encoded at 128 kbps stereo MP3. They total about 1.5 MB. They are self-hosted; visitors never download audio from the source mirror. Runtime decoding applies a two-second equal-power overlap to each loop.

Both recordings now run exactly 25% slower than the previous tuning: garden around 0.885x, leaves around 0.96x, with slow, bounded variation (0.8625-0.9075x and 0.93-0.99x). A low-pass filter and master gain retain the hover-shelter muffling. Natural droplets replace synthesized ambient drips; interaction sounds remain generated locally.

Sound defaults enabled, but starts only after a trusted click or Enter/Space gesture. Muting remains available while recordings load. Failed requests/decode operations show an explicit error rather than silently reverting to synthetic noise. The sound context suspends while muted or the tab is hidden.

The ASCII platter, notes, tiny record sleeve, winged envelope, and document-bottom puddles are original decorative art. Hearth motion runs only while the fireplace is visible, rain motion is enabled, the document is visible, and reduced motion is not requested. Notes and the 10px square original sleeve originate at the platter; Spotify artwork is not used as a particle or animated.

The Spotify card appears only on hover, focus, or tap. An optional official player loads only when requested and unloads when the card closes or the page is hidden. There is no supported embed-volume API, no hover autoplay, and no promised 25% Spotify volume. The rain/sound controls govern this site's ambience and interaction sounds, not a cross-origin Spotify player.

The rain renderer uses a 64px spatial index of protected text instead of scanning every text rectangle for every glyph. It draws at a capped 24fps with at most 1.5x canvas pixel density, while preserving the number of raindrops and exact text exclusion boundaries. Puddles share that animation loop and render only when their document-bottom canvas is visible.
