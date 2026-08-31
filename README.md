# Pedro Pathing Visualizer

Big Thanks to #16166 Watt's Up for developing this, we really appreciate your work.

This is our team's fork, with IVY code export and a local "send straight into the
Android Studio project" bridge added.

## Run it

Requires **Node 18 or newer** and **git**. Clone it once:

```bash
git clone https://github.com/filipp-os/Visualizer.git
```

### One-click launch (recommended)

After cloning, use the launcher for your OS from the project folder. It installs
dependencies the first time, starts the dev server, and opens your browser.
Close the window to stop it.

| OS | File | How |
| --- | --- | --- |
| **Windows** | `start-visualizer.cmd` | double-click |
| **macOS** | `start-visualizer.command` | double-click (first time: right-click → Open) |
| **Linux** | `start-visualizer.sh` | `chmod +x` it, then run it or use `start-visualizer.desktop` |

### Or run it manually

```bash
cd Visualizer && npm install
```

```bash
npm start
```

Open the URL it prints (default <http://localhost:5173>) in any browser.

## Export straight into your robot project (optional)

```bash
cp visualizer.export.example.json visualizer.export.json
```

Edit `visualizer.export.json` and set `projectRoot` to your robot-code
checkout's Java source root (`.../TeamCode/src/main/java`). Leave `packages`
and `allowGit` as they are so everyone's generated classes land in the same
package. Reload the page, then use **Export → IVY — Paths class / Full OpMode**;
a "Send to project" panel appears above the code.

Full details, including the Delete and git-add/untrack buttons, are in
[EXPORT_BRIDGE.md](EXPORT_BRIDGE.md).

## Staying up to date

```bash
git pull && npm install
```

Then restart `npm run dev`.
