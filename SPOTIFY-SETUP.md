# Connect the turntable

The optional record-player card shows current or recent listening from one
authorized Spotify account. Its profile link works without setup or JavaScript.
Visitors do not authorize the app.

## Prerequisites and addresses

- Run commands from your checkout's `personal-website` directory, with Node.js
  and npm available.
- Use the Spotify account that owns the developer app and matches the profile
  linked in [index.html](public/index.html). Spotify may require Premium and
  development-mode allowlisting; check its current dashboard requirements.
- Production uses the Cloudflare Worker in [worker.mjs](worker.mjs), with the
  `SPOTIFY_STORE` KV binding in [wrangler.jsonc](wrangler.jsonc).

| Purpose | Address |
| --- | --- |
| Public site / Spotify app Website | `https://nicholasyi.me` |
| Spotify app Redirect URI | `http://127.0.0.1:4387/callback` |
| Hosted listening API | `https://nicholasyi.me/api/listening` |
| Local website preview | `http://127.0.0.1:4173` |

The redirect must match exactly. Do not use `localhost`, the public site root,
`/api/listening`, or a public `/callback`: this implementation uses a one-time
loopback authorization helper, not a hosted callback.

If the production domain already serves this Worker over HTTPS, leave its
configuration alone. Otherwise add `nicholasyi.me` under the existing Worker's
**Settings -> Domains & Routes -> Custom Domain**, after checking for conflicting
DNS/service configuration. Do not delete working DNS records blindly.

## 1. Authorize locally

In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard),
create or reuse a Web API app, set the Website and exact Redirect URI above,
and copy its **Client ID**, not its client secret.

```powershell
npm run spotify:connect
```

Enter the Client ID when prompted. Open the printed authorization URL on the
same computer, approve the two read-only scopes, and complete the callback
within five minutes while the helper remains running. It uses Authorization
Code with PKCE, validates OAuth state and the expected account, and requests
only `user-read-currently-playing` and `user-read-recently-played`.

"Connected locally" means the helper saved `.spotify-auth.json`, not that the
hosted site is connected. This authorization allows current/recent listening
to be made public. The credential file is ignored by Git and outside `public/`;
never paste it or its tokens into chat, issues, source code, or commits.

For an optional initial local check:

```powershell
npm start
```

Open the card or local `/api/listening`. Play a non-local track, then pause it:
the card should move from **listening now** to **last listened** once Spotify
and the short caches update. Missing history is an explicit empty state, not
a fabricated track. If port 4173 is occupied, stop the specific preview or set
`$env:PORT = '4174'` before starting another.

Stop the authenticated local preview before uploading: it may have rotated
the refresh token, so use the current credential file.

## 2. Connect production storage

Sign into Cloudflare with `npx wrangler login` if needed. Reuse the Worker's
existing `SPOTIFY_STORE` binding; create it only if missing:

```powershell
npx wrangler kv namespace create SPOTIFY_STORE --binding SPOTIFY_STORE --update-config
```

Keep the real namespace binding in [wrangler.jsonc](wrangler.jsonc). Its ID is
configuration, not a credential. Upload authorization without printing it:

```powershell
npx wrangler kv key put spotify-auth --binding=SPOTIFY_STORE --remote --path=.spotify-auth.json
```

`--remote` is required for production; local Wrangler storage is separate.
Visitors depend on the hosted Worker, not the computer used for authorization.

## 3. Publish and verify

Run `npm test` before using the Git/Cloudflare deployment workflow described
in [README.md](README.md). A manual alternative is `npx wrangler deploy`, after
tests pass. Include the Worker and real KV binding, not just static assets.

Check the deployed `/api/listening` and card. Successful states are `playing`,
`recent`, `empty`, or `private`; connection/authentication failures are non-200
responses. Deployment and account authorization are separate checks.

After the hosted activity is verified, remove the local credential:

```powershell
Remove-Item -LiteralPath '.spotify-auth.json'
```

For routine local development, use the read-only public mirror:

```powershell
npm start -- --live-spotify
```

This serves local website assets but forwards the public listening response
without browser cookies or local Spotify tokens. Ordinary `npm start` instead
uses a local credential if present, otherwise returns `not_connected`. Avoid
running local and hosted copies with duplicate authorization indefinitely,
because Spotify may rotate refresh tokens.

## Visitor behavior and privacy

- Hover/focus the record player or tap **now / lately**; Escape dismisses it.
- The card exposes only the current/latest track and up to three distinct recent
  tracks from the latest ten history items. Tokens, devices and account details
  are not returned. Explicit private-session responses suppress activity;
  local files and unsupported media are not shown as live songs.
- Artwork is stationary and attributed. The official embed loads only after
  **Open Spotify player**, unloads when closed/hidden, and never autoplays.
  It has no supported volume-control API and is separate from site ambience.
- Responses are cached briefly (30 seconds); polling occurs only while the card
  and page are visible. This is not a real-time or lifetime listening history.
- The Worker uses Cloudflare KV for token rotation, not a write for every visit.
  Free-tier limits still apply.

## Recovery and disabling sharing

| Symptom | Action |
| --- | --- |
| Invalid redirect | Match `http://127.0.0.1:4387/callback` exactly in the dashboard. |
| Callback refused/timed out | Keep the helper running on the same computer, check port 4387, and repeat authorization. |
| API returns HTML/404 | Deploy this Worker and retain `run_worker_first` for `/api/listening`. |
| `not_connected` | Check the deployed `SPOTIFY_STORE` binding and its remote `spotify-auth` key. |
| `authorization_required` | Reauthorize the matching account, check scopes/allowlisting, and upload the new file. |
| Rate limited | Respect `Retry-After`; do not repeatedly refresh to bypass it. |
| Local works, hosted does not | Check `--remote` and the namespace bound to the deployed Worker. |
| Hosted works, local does not | Use `npm start -- --live-spotify`. |
| Stale song | Allow short browser/Worker/edge caches and Spotify history updates to settle. |

Token expiration, revocation or permission changes may require reauthorization;
consult Spotify's [refresh-token policy](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens).
Repeat authorization and remote upload rather than copying an older token.

To stop sharing, revoke the app in Spotify or delete the private remote entry:

```powershell
npx wrangler kv key delete spotify-auth --binding=SPOTIFY_STORE --remote
```

Previously cached activity can remain briefly; allow a minute or two for the
independent caches to expire. The profile link and website remain usable.

## References

- [Spotify app configuration](https://developer.spotify.com/documentation/web-api/concepts/apps)
- [Redirect URI rules](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
- [PKCE flow](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
- [Cloudflare Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
