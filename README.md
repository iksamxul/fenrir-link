# Fenrir Link

Fenrir Link is the phone app for [Fenrir](https://iksamxul.github.io/fenrir/), the app that hosts your games, servers and sites
for friends from one Windows PC.

Scan a code once, and the phone keeps the link like a passkey, in the Android Keystore or the iOS Keychain:

- **Your own server.** The code on Fenrir's Dashboard (the Fenrir Link card) links the phone remote. Four tabs:
  - *Dashboard*: the world's state with start, stop and restart, TPS, tick time and memory, a chart of the last half
    hour, friends who want to play or need a hand, who is in the world, the other games' servers set up on the PC
    (Valheim, FiveM for GTA V and others: who is on, the join code, start and stop), the sites and apps the PC hosts
    (start and stop, and their public address to copy), the mashup builder (what it builds, and Yes or Not now to its
    question), the next game night and the timeline.
  - *Players*: who is on and for how long, a message to one player, kicks, the whitelist (add and take off), friends'
    keys and their state, the operators.
  - *Console*: the whole server console, live, with filters for chat, issues and Fenrir's own lines, quick commands and
    a command line.
  - *Tools*: back up now and the recent backups, save the world, day and clear weather, the note to friends (and a
    notification to all of them), who can start the world, a message to everyone, the address to join, a connection
    test and the Doctor's finding.
- **A friend's world.** The code on Fenrir Connect's You page links your live page. Four tabs:
  - *World*: whether the world is up and who is playing, asking your host to start it, the host's note, the game night
    with your answer, friends getting ready, the week in the world and the hall of records.
  - *Chat*: the world's chat, to read and to write in.
  - *You*: your week, asking your host for a hand and their answers, the world's screenshots, and sharing a picture.
  - *Tools*: the pack, the address to join, the world map, a connection test.

Home is a summary of every linked world: how many are online, who is playing and anything waiting on you. Settings
choose light or dark (or follow the phone) and the tap vibration.

The app talks only to the Fenrir that made the code.

## In a phone's browser

Fenrir also serves these screens itself, at the address a code opens: the host's `/<key>/admin` and a friend's `/<key>/status`. That is the direct install for an iPhone: point the Camera at the code, then Share → Add to Home Screen, and Fenrir Link opens full screen, straight to that world, with no App Store, no computer and no signing. Android's Chrome offers Install app on the same page. `src/web.js` is that shell (one world, no keychain: the address is the key); `npm run build:web` bundles it to `web/link.js`, and Fenrir's `fenrir/build/link_web.py` copies it, the styles, the page template (`web/page.html`) and the home-screen icons into `fenrir/static/link/`. `src/loop.js` is the polling and drawing both shells share; `src/store.js` is the app's keychain.

## Builds

GitHub Actions builds both apps on every `v*` tag (`.github/workflows/build.yml`):

- `FenrirLink.apk`: Android 8 and later, signed with the project's release key, which lives in the repository secrets.
- `FenrirLink.ipa`: iPhone, built without signing. Install it with AltStore or Sideloadly, which sign it with your own
  Apple ID.

To work on the interface on a computer, run `npm install`, then `npm run build`, then serve the folder and open
`dev/index.html`, which fakes Fenrir's answers (`?case=wake` adds a friend asking to play). The dashboard's tabs need
Fenrir 1.36 on the PC; with an older Fenrir the app says what an update adds and keeps working.
`python tools/make_dev_shots.py` draws the stand-in screenshots the dev page's gallery shows.
