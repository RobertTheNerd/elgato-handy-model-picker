# Handy Model Picker for Stream Deck

**One key per [Handy](https://github.com/cjpais/Handy) speech-to-text model.** Press a key to make its model Handy's
active model. Each key shows whether its model is the active one, even when you switch models inside Handy.

<p>
  <img src="docs/images/key-active.svg" width="72" alt="Pink key: Handy's active model">
  <img src="docs/images/key-inactive.svg" width="72" alt="Grey key: downloaded, not active">
  <img src="docs/images/key-switching.svg" width="72" alt="Dashed pink frame: switching to this model">
  <img src="docs/images/key-missing.svg" width="72" alt="Grey key with slash: not configured or not downloaded">
</p>

## Key states

| Key                                                         | Meaning                                 | Pressing it                     |
| ----------------------------------------------------------- | --------------------------------------- | ------------------------------- |
| <img src="docs/images/key-active.svg" width="40" alt="">    | Handy's active model                    | Opens Handy if it isn't running |
| <img src="docs/images/key-inactive.svg" width="40" alt="">  | Downloaded, not active                  | Switches Handy to it            |
| <img src="docs/images/key-switching.svg" width="40" alt=""> | Handy is restarting with this model     | Shows ⚠                         |
| <img src="docs/images/key-missing.svg" width="40" alt="">   | Not configured, or no longer downloaded | Shows ⚠                         |

## Requirements

- macOS 12 or later
- Stream Deck app 7.1 or later
- Handy 0.9.7 or later (needs `handy --list-models --json`)

## Usage

1. Drag **Handy Model Picker → Select Model** onto a key.
2. Pick a model in the key's settings. Only models you've downloaded in Handy are listed. Download new ones in
   Handy, then press ↻ next to the list.
3. Press the key.

## How it works

Handy has no command for switching the model of a running instance. So when you press a key, the plugin:

1. quits Handy (SIGTERM, so macOS doesn't ask for any permission),
2. sets `selected_model` in `~/Library/Application Support/com.pais.handy/settings_store.json`, changing only that
   value, and
3. opens Handy again in the background with `--start-hidden`.

On an Apple silicon Mac this takes about a quarter of a second. Handy loads the new model when you next dictate, just
as it does after any launch, so the first dictation after a switch may take a moment longer. A recording in progress
is cut off by the restart.

The model list comes from `handy --list-models --json`. The active model comes from Handy's settings file, which
the plugin watches, so keys also update when you switch models inside Handy.

## Development

```sh
npm install
npm run build      # bundle src/ into the plugin
npm run link       # symlink the plugin into Stream Deck (restart the Stream Deck app the first time)
npm run restart    # reload the plugin after a build
npm run check      # format, typecheck, tests, manifest validation
npm run images     # regenerate icons and docs/images from src/icons.ts
npm run pack       # build dist/com.robert.handy-model-picker.streamDeckPlugin
```

Logs go to `com.robert.handy-model-picker.sdPlugin/logs/`.
