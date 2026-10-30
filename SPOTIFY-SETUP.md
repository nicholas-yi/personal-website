# Connect the turntable

The floating card is implemented, but it does not invent a listening activity before you connect your account. The profile link still works without setup or JavaScript.

Public check on October 30, 2026: `https://nicholasyi.me/` responds successfully, but `/api/listening` still returns 404. The public domain is reachable; the new Worker/API changes still need to be deployed and authorized. This is a point-in-time check, not an automatic connection status.

## Which domain goes where?

Yes: use **`https://nicholasyi.me` as the Spotify app's Website**, and serve the public site and listening API on that domain.

The Website field and the OAuth redirect are not the same thing:

| Purpose | Exact address | Where it belongs |
| --- | --- | --- |
| Public website | `https://nicholasyi.me` | Spotify app Website; Cloudflare custom domain |
| One-time account authorization | `http://127.0.0.1:4387/callback` | Spotify app Redirect URIs |
| Hosted listening data | `https://nicholasyi.me/api/listening` | Called by the deployed card; not an OAuth redirect |
| Local website preview | `http://127.0.0.1:4173` | Your browser while `npm start` runs; not an OAuth redirect |

Our authorization helper runs on your computer, so Spotify redirects back to that helper even when the resulting authorization will be used by the hosted site. A redirect to your laptop does **not** make visitors' listening requests depend on your laptop. After upload, Cloudflare holds the private token and serves visitors independently.

Do **not** register `https://nicholasyi.me/callback` for this implementation: no public callback route exists. Do not use the website root or `/api/listening` as a redirect either. Spotify requires an exact registered callback; `localhost` is not accepted, whereas an explicit HTTP loopback IP is allowed.

## 0. Check the Cloudflare domain

If `https://nicholasyi.me` already opens this website with HTTPS, leave the working domain configuration alone.

If it is not connected:

1. Make sure `nicholasyi.me` is an active zone in your Cloudflare account. If it was bought elsewhere, follow Cloudflare's zone setup and registrar nameserver instructions; buying a second domain is not necessary.
2. Open **Workers & Pages -> personal-website -> Settings -> Domains & Routes -> Add -> Custom Domain**.
3. Enter `nicholasyi.me` and add it. Cloudflare creates the DNS record and certificate for the Worker.
4. Wait for the domain/certificate to become active, then open `https://nicholasyi.me`.
5. If an existing DNS record or a different service already uses this hostname, resolve that conflict deliberately rather than deleting records blindly. Cloudflare does not allow a custom domain over an existing CNAME.

The Worker must be the one deployed from this project, including [worker.mjs](worker.mjs), not a separate static-only upload. It forwards ordinary pages to static assets and handles `/api/listening` itself.

## What visitors see

- Hover or keyboard-focus the record player, or tap **now / lately**.
- The artwork card is hover/focus/tap-only; it never opens on a timer. Escape dismisses it. Tiny moving record sleeves near the platter are original decorative shapes, not Spotify cover art.
- If Spotify reports an active song, the card says **listening now**.
- Otherwise it shows the latest item in your Spotify listening history, with its date, labeled **last listened**.
- **Recently on the turntable** shows up to three distinct recent tracks, with stationary cover art and links, inside that same optional card. Duplicate replays are collapsed; the search window is the latest ten history items, not a lifetime listening profile.
- The card links to the song, shows unmodified stationary artwork and Spotify attribution, and never starts Spotify audio automatically. **Open Spotify player** loads an optional official embed; visitors press Play themselves. Closing the card or hiding the page unloads the embed.
- Spotify's embed has no supported volume-control API. A 25%-volume hover preview is not implemented or simulated, and it does not use or expose the site owner's playback token. Spotify may require the visitor to sign in or provide only a preview, depending on availability/account policy.
- Only the current/latest track and up to three recent tracks are returned. Tokens, account details, device information, and the rest of your history are never sent to visitors. The existing `user-read-recently-played` authorization already covers this shelf; no new scope or reconnection is required.
- An explicitly reported private session hides the activity. Local files and unsupported media are not presented as live songs.

The backend uses your existing Cloudflare Worker and a KV namespace. It can run on their free tiers within their quotas; it is not an unlimited free service. No paid plan or external model service is configured. Requests are cached for 30 seconds; the browser polls only while the card is open and the page is visible. KV writes are for token refresh/rotation, not for every visitor or poll.

## 1. Register your Spotify app

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) with your Premium account.
2. Create an app, for example **Nic's turntable**:
   - Description: `Current and recent listening activity on my personal website.`
   - Website: `https://nicholasyi.me`
   - API: **Web API**. You do not need the Web Playback SDK.
3. Add this exact redirect URI and save the app settings:

   ```text
   http://127.0.0.1:4387/callback
   ```

4. Copy the app's **Client ID**, not its client secret. If Spotify asks for app users/allowlisting, authorize with the Premium account that owns the app and matches your profile. This is a single-account integration; visitors do not authorize the app.

The helper uses [Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow). No client secret is needed. It requests only `user-read-currently-playing` and `user-read-recently-played`, not playback controls, email, or playlists.

## 2. Authorize your account locally

Open PowerShell in the project directory:

```powershell
Set-Location 'C:\Users\nicholasyi\MAIDAP Code\career code\personal-website'
npm run spotify:connect
```

Paste the Client ID into the terminal prompt. Leave that terminal running. Open the full authorization URL it prints in Edge **on this same computer**, sign into the account linked from your record player, and approve the two listening permissions. Finish within five minutes; rerun the command if it times out.

Spotify will return you to `http://127.0.0.1:4387/callback?...`. A "Connected locally" message means the helper completed. If the callback is refused, check that the helper is still running and that port 4387 was free; do not change the redirect to port 4173. This consent also means that your current/latest listening activity will be public on your site.

The loopback-only helper checks a random OAuth state and the account ID before saving `.spotify-auth.json`. It never prints tokens. The file is outside `public/`, excluded by `.gitignore`, and not served by the preview.

**Never paste that file, its tokens, or a client secret into chat, a GitHub issue, or a commit.**

### Optional: test locally before uploading

While `.spotify-auth.json` exists, the ordinary Node preview can read it:

```powershell
npm start
```

Open `http://127.0.0.1:4173`. Hover/focus the record player or tap **now / lately**. You can also open `http://127.0.0.1:4173/api/listening` directly.

- Play a non-local Spotify song on any device signed into your account; wait about 30-60 seconds for the card/API caches to refresh.
- Pause Spotify. The card should change to **last listened**, showing the most recent track Spotify has actually added to listening history, not an invented timestamp.
- If no history is available, the card says so. It does not autoplay Spotify audio.

If port 4173 already has an older preview running, stop that specific preview in its own terminal with Ctrl+C, then restart. Alternatively:

```powershell
$env:PORT = '4174'
npm start
# Open http://127.0.0.1:4174
```

Stop the authenticated local preview before uploading. It may have refreshed/rotated the local token, so upload the current file, not an earlier copy. For regular local work after production is connected, use the read-only mirror below instead of keeping duplicate private tokens.

## 3. Add the private Cloudflare storage

If needed, sign into your existing Cloudflare account:

```powershell
npx wrangler login
```

If you already have a `SPOTIFY_STORE` KV binding on this Worker, reuse it. Otherwise create the namespace and let Wrangler add its real ID to your configuration:

```powershell
npx wrangler kv namespace create SPOTIFY_STORE --binding SPOTIFY_STORE --update-config
```

Upload the private authorization without displaying its contents:

```powershell
npx wrangler kv key put spotify-auth --binding=SPOTIFY_STORE --remote --path=.spotify-auth.json
```

Keep the resulting `kv_namespaces` binding in [wrangler.jsonc](wrangler.jsonc). For example, Wrangler adds a binding named `SPOTIFY_STORE` and a real namespace ID. Those names/IDs are configuration, not Spotify tokens, and may be committed. Do not put credentials in the config or create a placeholder namespace ID.

The upload command targets the remote namespace. A local Wrangler namespace is separate; simply running `npx wrangler dev` does not automatically copy this credential into it.

## 4. Publish and check

Run the tests and use your existing Git/Cloudflare deployment workflow to publish the code and namespace binding:

```powershell
npm test
```

For a manual deployment instead, after the tests pass:

```powershell
npx wrangler deploy
```

Then open `https://nicholasyi.me/api/listening`, or open the record player's card on your site. The API returns `playing`, `recent`, `empty`, or `private`. Setup/authentication failures are explicit non-200 responses, not fabricated tracks.

If using Git-based deploys, include the Worker, Spotify modules, scripts, frontend changes, and real KV namespace binding in the deployment. The exact public README can stay as requested; this setup guide is separate. The account connection is not complete just because the frontend deploy succeeded.

Once the remote upload is complete and verified, remove the local credential file:

```powershell
Remove-Item -LiteralPath '.spotify-auth.json'
```

## 5. Show the real hosted activity in your local preview

Recommended after production is connected:

```powershell
npm start -- --live-spotify
```

Open `http://127.0.0.1:4173` (or your selected `PORT`). This optional local mode serves your local HTML/CSS/JavaScript, but mirrors the **public** `https://nicholasyi.me/api/listening` response through the local `/api/listening` route. It needs no local Spotify credential and does not ask visitors to log in. It forwards neither browser cookies nor a Spotify access token. Only the production Worker refreshes the private authorization.

The CLI banner says "read-only mirror" when this mode is active. It requires the production API to be deployed and connected. Until then, its card shows the actual setup/error state; it does not fabricate a song or fall back to a second token.

Without `--live-spotify`, `npm start` uses `.spotify-auth.json` if one exists, otherwise explicitly reports `not_connected`. This is useful for your initial local-only test before upload. Do not run local and hosted copies with independent copies of the same authorization indefinitely: Spotify may rotate refresh tokens.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Spotify says the redirect is invalid | The saved Redirect URI must be exactly `http://127.0.0.1:4387/callback`; not `localhost`, not `nicholasyi.me`, not port 4173. |
| The callback cannot connect | Run `npm run spotify:connect` first, keep it running, and complete login in Edge on the same computer. |
| The API returns HTML or 404 | Deploy the Worker version from this project and keep `run_worker_first` configured for `/api/listening`. The domain may still point to the older static-only deployment. |
| `503 {"error":"not_connected"}` | The Worker lacks `SPOTIFY_STORE`, or that exact namespace does not have the `spotify-auth` key. No credentials have been inferred from the public profile link. |
| `authorization_required` | Reconnect the matching Premium account, upload the new file, and check app owner/allowlisting and both scopes. |
| `429` or a short retry message | Spotify is rate-limiting the app; respect `Retry-After`. Do not keep refreshing the page to bypass it. |
| Local works, production does not | Check that the private file was uploaded with `--remote` to the namespace bound to the deployed Worker. Local files are deliberately never deployed as static assets. |
| Production works, local says unconnected | Start the local preview with `--live-spotify`; plain `npm start` intentionally does not use hosted credentials. |
| Song does not change immediately | Browser, Worker, and edge caches each have short lifetimes. Updates are approximate, not a second-by-second playback stream. Spotify also controls when history is updated. |


## Reconnecting or turning sharing off

Spotify's [current refresh-token policy](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens) requires reauthorization after six months. Revoking the app, changing permissions, or an expired token may require reconnecting sooner. Repeat steps 2 and the upload in step 3. No visitor needs to sign in.

To turn sharing off, revoke the app in your Spotify account or remove its private KV entry:

```powershell
npx wrangler kv key delete spotify-auth --binding=SPOTIFY_STORE --remote
```

Deleting/revoking prevents future authorized requests; already cached activity can remain briefly while the independent 30-second browser/Worker/edge caches expire. Allow roughly a minute or two rather than treating this as an instant privacy switch. Errors and unconnected states do not expose credentials. The ordinary profile link and the rest of the website remain usable.

## Official references

- [Spotify app Website and Redirect URI fields](https://developer.spotify.com/documentation/web-api/concepts/apps)
- [Spotify exact redirect/loopback requirements](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
- [Spotify PKCE authorization](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
- [Cloudflare Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
