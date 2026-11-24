# Audio credits

The site's rain and fireplace ambience uses self-hosted excerpts from these
Creative Commons Zero (CC0) recordings:

| Local recording | Original | Creator | Download source |
| --- | --- | --- | --- |
| [Garden rain](public/audio/garden-rain.mp3) | [Soft rain.WAV, Freesound #640655](https://freesound.org/people/barkenov/sounds/640655/) | barkenov | [MP3 mirror](https://rainsoundsforsleeping.com/audio/rain-base.mp3) |
| [Forest rain](public/audio/forest-rain.mp3) | [ForestRainShower1a, Freesound #383064](https://freesound.org/people/AlanCat/sounds/383064/) | AlanCat | [MP3 mirror](https://rainsoundsforsleeping.com/audio/leaves.mp3) |
| [Fireplace](public/audio/fireplace.mp3) | [Fireplace Sound loop](https://opengameart.org/content/fireplace-sound-loop) | PagDev | [WAV](https://opengameart.org/sites/default/files/fire.wav) |

The rain mirror's [per-file licensing record](https://rainsoundsforsleeping.com/licensing/)
also identifies its recordings as CC0. The fireplace's OpenGameArt page identifies
it as CC0. This license permits reuse, modification and commercial use without
required attribution; these credits are provided voluntarily. The creators do not
endorse this website. See the [CC0 dedication](https://creativecommons.org/publicdomain/zero/1.0/).

## Processing

The garden and forest excerpts are 42 and 50 seconds long. The fireplace is also
trimmed to an excerpt. All three were high-/low-pass filtered, level-balanced and
encoded as stereo MP3s, totaling about 1.9 MB. Visitors fetch them from this site,
not the source mirror.

[rain-audio.js](public/rain-audio.js) applies an equal-power overlap for seamless
loops, bounded playback-rate variation for rain, and a proximity-based crossfade
between rain and fireplace. The small interaction sounds are synthesized locally
and do not use third-party recordings.

## Playback

Sound is off on every page load. Only the sound control enables it; no audio
context or recording request starts before opt-in. Muting and hidden tabs suspend
the audio context, and loading/decoding failures are reported rather than replaced
with unrelated audio.

The optional Spotify player is separate: it loads only when requested, requires
the visitor to start playback, and is not controlled by the site's ambience mute.
Its setup and privacy boundary are documented in [SPOTIFY-SETUP.md](SPOTIFY-SETUP.md).
