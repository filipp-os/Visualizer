# Pedro Pathing Visualizer

Big Thanks to #16166 Watt's Up for developing this, we really appreciate your work.

This is our team's fork, with IVY code export and a local "send straight into the
Android Studio project" bridge added.

## Run it

Requires **Node 18 or newer** and **git**.

```bash
git clone https://github.com/filipp-os/Visualizer.git
```

```bash
cd Visualizer && npm install
```

```bash
npm run dev
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
