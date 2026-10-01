# Fenrir Link

Fenrir Link is the phone app for [Fenrir](https://iksamxul.github.io/fenrir/), the app that hosts a modded Minecraft world
for friends from one Windows PC.

Scan a code once, and the phone keeps the link like a passkey, in the Android Keystore or the iOS Keychain:

- **Your own server.** The code on Fenrir's Dashboard (the Fenrir Link card) links the phone remote. You see who is on,
  start, stop or restart the world, answer friends who want to play, message everyone and start a backup.
- **A friend's world.** The code on Fenrir Connect's You card links your live page. You see whether the world is up and
  who is playing, ask your host to start it, answer game nights and chat with everyone in the world.

The app talks only to the Fenrir that made the code.

## Builds

GitHub Actions builds both apps on every `v*` tag (`.github/workflows/build.yml`):

- `FenrirLink.apk`: Android 8 and later, signed with the project's release key, which lives in the repository secrets.
- `FenrirLink.ipa`: iPhone, built without signing. Install it with AltStore or Sideloadly, which sign it with your own
  Apple ID.

To work on the interface on a computer, run `npm install`, then `npm run build`, then serve the folder and open
`dev/index.html`, which fakes Fenrir's answers.
