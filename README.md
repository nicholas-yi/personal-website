# nicholasyi.me

my little corner of the internet → **[nicholasyi.me](https://nicholasyi.me)**

it's where i keep my research, writing, and a few things i'm into. it also rains.

## things to poke at

- **the rain** — move your cursor through it and it'll part around you. it drips off the roof and ripples the puddle at the bottom
- **umbrellas** — click to open one. click again to fold it. i always have so many extra ones, feel free to ask me for one...
- **sound** — off by default; turn it on if you'd like. natural rain and fireplace recordings, with little click sounds made in browser
- **the graph** — connect my interests and see how they're related

no frameworks, no build step. just good ole html, css, and js. the live site uses cloudflare web analytics.

## running it

    npm start   # http://127.0.0.1:4173
    npm test

## how it ships

push to `main` → GitHub Actions runs tests, and the configured Cloudflare integration deploys it.

run `npm test` before pushing, then check both the Actions result and Cloudflare deployment. the repository's workflow runs tests but does not itself gate Cloudflare deployment.

Spotify setup and recovery: [connect the turntable](SPOTIFY-SETUP.md).

the ascii art, animation, and interaction sounds are original. the rain and fireplace recordings are CC0; see [credits](AUDIO-CREDITS.md). feel free to look around.
