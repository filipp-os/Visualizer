# Local export bridge

Write generated **IVY** classes straight from the visualizer into your Android
Studio project — no download step, works in any browser (Firefox included),
because the write happens in the local Node process that serves the app.

## One-time setup

1. Run the visualizer locally:

   ```bash
   npm install
   npm run dev
   ```

   (`npm run preview` after `npm run build` works too — anything that starts a
   Vite server.)

2. Copy the example config and edit the paths:

   ```bash
   cp visualizer.export.example.json visualizer.export.json
   ```

   ```jsonc
   {
     // Absolute path to your TeamCode Java SOURCE ROOT — the folder that
     // directly contains "org/". On a stock FTC project:
     //   .../FtcRobotController/TeamCode/src/main/java
     "projectRoot": "/Users/you/FtcRobotController/TeamCode/src/main/java",

     // Where visualizer output lands, relative to projectRoot. Kept separate
     // from your hand-written code on purpose.
     "packages": {
       "paths": "org/firstinspires/ftc/teamcode/vis/paths",
       "auto":  "org/firstinspires/ftc/teamcode/vis/auto"
     },

     "allowGit": true   // just surfaces the current branch in the UI
   }
   ```

   `visualizer.export.json` is git-ignored — each teammate points it at their
   own checkout.

3. Reload the visualizer. Open **Export → IVY — Paths class** (or **Full
   OpMode**). A "Send to project" strip appears above the code.

## Using it

- **Write new class** — generates the file into the right package. If a class of
  that name already exists it refuses and offers **Overwrite it**.
- **Update existing…** — pick a class the visualizer made before and overwrite
  it in place (two clicks: select, then confirm).
- **Paths classes** go to `packages.paths`, **full OpModes** to `packages.auto`,
  so visualizer output never mixes with your own classes.

Every generated file starts with a banner comment naming the source `.pp` and
the export time. A manifest at `<projectRoot>/.visualizer-manifest.json` tracks
what the visualizer has written (that's what powers the "Update existing" list).

The `package` line in each file is derived from where it's written, so it always
matches its folder regardless of the package shown in the on-screen preview.

## Notes / limits

- **Local only.** The bridge is part of the dev/preview server; a statically
  hosted build has no bridge and the panel shows "Local export unavailable".
- **Loopback only.** Requests from anything other than `127.0.0.1` are refused.
- **Confined + `.java` only.** Writes cannot escape `projectRoot`, and only
  `*.java` (plus the manifest) can be written.
- **No git actions.** `allowGit` only shows the branch/dirty state; the bridge
  never stages, commits, or pushes. Commit the `vis/` files yourself.
- Updating the visualizer for the team = `git pull` this repo once. Generated
  classes live in *your* project repo, not here.
