import { formatJava } from "./codeExporter";

// Loosely typed on purpose — the repo's `../types` module is mid-refactor and
// doesn't re-export PathChain / SequenceItem cleanly.
type Point = any;
type Line = any;
type PathChain = any;
type SequenceItem = any;

// PedroPathing's default field length (Pose.mirror() uses 141.5).
const FIELD_LENGTH = 141.5;

export interface IvyPathsOptions {
  className?: string;
  packageName?: string;
  // The constructor always takes your Robot and pulls the Follower off
  // robot.drivetrain (ClosePaths.java style). When true it additionally
  // derives the alliance from robot.alliance and emits
  // `activeX = isRed ? X.mirror() : X` runtime mirroring; when false the
  // poses are used directly with no mirroring.
  allianceMirror?: boolean;
}

export interface IvyOpModeOptions {
  className?: string;
  packageName?: string;
  // Style B only: bake mirrored coordinates into the pose literals.
  mirrorPoses?: boolean;
}

// -------------------------------------------------------------------------
// number / identifier helpers
// -------------------------------------------------------------------------

function num(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n === 0 ? 0 : n); // normalise -0
  return n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function normDeg(d: number): number {
  let x = ((d % 360) + 360) % 360;
  if (x > 180) x -= 360;
  return x;
}

// PedroPathing Pose.mirror(): x -> FIELD - x, y -> y, heading -> normalize(180 - heading)
function mirrorHeadingDeg(d: number): number {
  return normDeg(180 - d);
}

function mirrorPoint<T extends { x: number; y: number }>(p: T): T {
  const q: any = { ...p, x: FIELD_LENGTH - p.x, y: p.y };
  if (q.heading === "constant" && typeof q.degrees === "number")
    q.degrees = mirrorHeadingDeg(q.degrees);
  if (q.heading === "linear") {
    if (typeof q.startDeg === "number") q.startDeg = mirrorHeadingDeg(q.startDeg);
    if (typeof q.endDeg === "number") q.endDeg = mirrorHeadingDeg(q.endDeg);
  }
  return q;
}

/** Deep-copy start/lines with every coordinate mirrored (Style B "mirror poses"). */
export function mirrorPathData(
  startPoint: Point,
  lines: Line[],
): { startPoint: Point; lines: Line[] } {
  return {
    startPoint: mirrorPoint(startPoint),
    lines: (lines || []).map((l) => ({
      ...l,
      endPoint: mirrorPoint(l.endPoint as any),
      controlPoints: (l.controlPoints || []).map((c: any) => mirrorPoint(c)),
    })),
  };
}

function ident(input: string | undefined, fallback: string): string {
  const c = (input || "").replace(/[^a-zA-Z0-9]/g, "");
  if (!c) return fallback;
  if (/^[0-9]/.test(c)) return fallback + c;
  return c;
}
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const upperFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function endpointHeadingDeg(ep: any): number {
  if (ep.heading === "constant") return ep.degrees ?? 0;
  if (ep.heading === "linear") return ep.endDeg ?? 0;
  return 0;
}
function startHeadingDeg(sp: any): number {
  if (sp.heading === "constant") return sp.degrees ?? 0;
  if (sp.heading === "linear") return sp.startDeg ?? 0;
  return 0;
}

// Extra trailing args for setLinearHeadingInterpolation (path parameter 0..1).
function linearTimingArgs(ep: any): string {
  const hasStart = Number.isFinite(ep.startT) && ep.startT > 0;
  const hasEnd = Number.isFinite(ep.endT) && ep.endT < 1;
  if (hasStart)
    return `, ${num(ep.startT)}, ${num(Number.isFinite(ep.endT) ? ep.endT : 1)}`;
  if (hasEnd) return `, ${num(ep.endT)}`;
  return "";
}

// -------------------------------------------------------------------------
// path model
// -------------------------------------------------------------------------

interface Segment {
  startName: string;
  endName: string;
  controlNames: string[];
  controlLiterals: string[];
  curveType: "BezierLine" | "BezierCurve";
  headingType: "constant" | "linear" | "tangential";
  timingArgs: string;
  reversed: boolean;
}
interface ChainModel {
  method: string;
  lineIds: string[];
  segments: Segment[];
}
interface PathModel {
  poseDecls: { name: string; literal: string }[];
  chains: ChainModel[];
  scheduleItems: ({ kind: "chain"; method: string } | { kind: "wait"; ms: number })[];
}

function buildModel(
  startPoint: Point,
  lines: Line[],
  pathChains: PathChain[],
  sequence: SequenceItem[],
): PathModel {
  // Pose declarations: `start` first, then each line's endpoint. Endpoints
  // that share a name AND land on the same spot reuse the same pose (so a
  // shoot → pickup → shoot chain reuses `shoot`, like ClosePaths.java).
  const poseDecls: { name: string; literal: string }[] = [];
  const declaredMeta = new Map<string, { x: number; y: number }>();
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-3;

  poseDecls.push({
    name: "start",
    literal: `new Pose(${num(startPoint.x)}, ${num(startPoint.y)}, Math.toRadians(${num(startHeadingDeg(startPoint))}))`,
  });
  declaredMeta.set("start", { x: startPoint.x, y: startPoint.y });

  const resolveEndpointName = (ln: Line, i: number): string => {
    const ep = ln.endPoint;
    const deg = endpointHeadingDeg(ep);
    const base = lowerFirst(ident(ln.name, `pose${i + 1}`));
    let name = base;
    let k = 1;
    while (declaredMeta.has(name)) {
      const m = declaredMeta.get(name)!;
      if (close(m.x, ep.x) && close(m.y, ep.y)) return name; // same waypoint → reuse
      name = `${base}_${++k}`;
    }
    poseDecls.push({
      name,
      literal: `new Pose(${num(ep.x)}, ${num(ep.y)}, Math.toRadians(${num(deg)}))`,
    });
    declaredMeta.set(name, { x: ep.x, y: ep.y });
    return name;
  };

  const endNameOf = new Map<string, string>();
  const startNameOf = new Map<string, string>();
  const lineById = new Map<string, Line>();
  let prev = "start";
  lines.forEach((ln, i) => {
    const id = ln.id || `line-${i}`;
    lineById.set(id, ln);
    startNameOf.set(id, prev);
    const nm = resolveEndpointName(ln, i);
    endNameOf.set(id, nm);
    prev = nm;
  });

  // chains → methods (fall back to one chain per line)
  const srcChains =
    pathChains && pathChains.length
      ? pathChains
      : lines.map((l, i) => ({
          id: l.id || `c${i}`,
          name: l.name || `path${i + 1}`,
          color: "",
          lineIds: [l.id || `line-${i}`],
        }));

  const usedMethod = new Set<string>();
  const uniqMethod = (base: string) => {
    let n = base || "path";
    let i = 2;
    while (usedMethod.has(n)) n = `${base}${i++}`;
    usedMethod.add(n);
    return n;
  };

  const chains: ChainModel[] = [];
  srcChains.forEach((ch, ci) => {
    const ids = (ch.lineIds || []).filter((id: string) => lineById.has(id));
    if (!ids.length) return;
    const method = lowerFirst(uniqMethod(ident(ch.name, `path${ci + 1}`)));
    let ctrl = 0;
    const segments: Segment[] = ids.map((id: string) => {
      const ln = lineById.get(id)!;
      const ep: any = ln.endPoint;
      const cps = ln.controlPoints || [];
      const controlNames = cps.map(() => `${method}Control${++ctrl}`);
      const controlLiterals = cps.map(
        (c: any) => `new Pose(${num(c.x)}, ${num(c.y)})`,
      );
      return {
        startName: startNameOf.get(id)!,
        endName: endNameOf.get(id)!,
        controlNames,
        controlLiterals,
        curveType: cps.length ? "BezierCurve" : "BezierLine",
        headingType:
          ep.heading === "constant"
            ? "constant"
            : ep.heading === "linear"
              ? "linear"
              : "tangential",
        timingArgs: ep.heading === "linear" ? linearTimingArgs(ep) : "",
        reversed: !!ep.reverse,
      } as Segment;
    });
    chains.push({ method, lineIds: ids, segments });
  });

  // append control-point pose declarations
  chains.forEach((cm) =>
    cm.segments.forEach((s) =>
      s.controlNames.forEach((nm, k) =>
        poseDecls.push({ name: nm, literal: s.controlLiterals[k] }),
      ),
    ),
  );

  // schedule order: follow `sequence`; emit each chain at its first line,
  // waits become waitMs(...). Any chain not in the sequence is appended.
  const lineToMethod = new Map<string, string>();
  chains.forEach((cm) => cm.lineIds.forEach((id) => lineToMethod.set(id, cm.method)));
  const scheduleItems: PathModel["scheduleItems"] = [];
  const emitted = new Set<string>();
  (sequence || []).forEach((it: any) => {
    if (it.kind === "wait") {
      scheduleItems.push({
        kind: "wait",
        ms: Math.max(0, Math.round(it.durationMs || 0)),
      });
    } else {
      const m = lineToMethod.get(it.lineId);
      if (m && !emitted.has(m)) {
        emitted.add(m);
        scheduleItems.push({ kind: "chain", method: m });
      }
    }
  });
  chains.forEach((cm) => {
    if (!emitted.has(cm.method)) {
      emitted.add(cm.method);
      scheduleItems.push({ kind: "chain", method: cm.method });
    }
  });

  return { poseDecls, chains, scheduleItems };
}

function renderMethod(cm: ChainModel, ref: (n: string) => string): string {
  const body = cm.segments
    .map((s) => {
      const pts =
        s.curveType === "BezierCurve"
          ? [s.startName, ...s.controlNames, s.endName].map(ref).join(", ")
          : [s.startName, s.endName].map(ref).join(", ");
      let headingCall: string;
      if (s.headingType === "constant")
        headingCall = `.setConstantHeadingInterpolation(${ref(s.endName)}.getHeading())`;
      else if (s.headingType === "linear")
        headingCall = `.setLinearHeadingInterpolation(${ref(s.startName)}.getHeading(), ${ref(s.endName)}.getHeading()${s.timingArgs})`;
      else headingCall = `.setTangentHeadingInterpolation()`;
      let seg =
        `                .addPath(new ${s.curveType}(${pts}))\n` +
        `                ${headingCall}`;
      if (s.reversed) seg += `\n                .setReversed()`;
      return seg;
    })
    .join("\n");
  return `    public CommandBuilder ${cm.method}() {
        PathChain path = follower.pathBuilder()
${body}
                .build();
        return new FollowPath(this.follower, path, true);
    }`;
}

// -------------------------------------------------------------------------
// Style A — IVY "Paths" command class (like ClosePaths.java)
// -------------------------------------------------------------------------

export async function generateIvyPathsClass(
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
  pathChains: PathChain[],
  opts: IvyPathsOptions = {},
): Promise<string> {
  const model = buildModel(startPoint, lines, pathChains || [], sequence || []);
  const mirror = !!opts.allianceMirror;
  const pkg = opts.packageName || "org.firstinspires.ftc.teamcode.pedroPathing";
  const cls = ident(opts.className || "Auto", "Auto") + "Paths";

  const activeName = (n: string) => "active" + upperFirst(n);
  const ref = mirror ? activeName : (n: string) => n;

  const poseDeclLines = model.poseDecls
    .map((d) => `    public static Pose ${d.name} = ${d.literal};`)
    .join("\n");

  const methods = model.chains.map((cm) => renderMethod(cm, ref)).join("\n\n");

  // The class is always constructed from your Robot (like ClosePaths.java): it
  // pulls the Follower off the drivetrain so the rest of your code stays the
  // same. When mirroring it also derives the alliance from `robot.alliance`.
  const projectImports = mirror
    ? `// NOTE: these imports are project-specific — adjust Robot, Alliance and
// FollowPath to match your package layout.
import org.firstinspires.ftc.teamcode.Config.Robot;
import org.firstinspires.ftc.teamcode.pedroPathing.FollowPath;
import org.firstinspires.ftc.teamcode.utilities.Alliance;`
    : `// NOTE: these imports are project-specific — adjust Robot and FollowPath
// to match your package layout.
import org.firstinspires.ftc.teamcode.Config.Robot;
import org.firstinspires.ftc.teamcode.pedroPathing.FollowPath;`;

  const fieldLines = mirror
    ? `    private final Follower follower;\n    Alliance alliance;`
    : `    private final Follower follower;`;

  let mirrorFields = "";
  let ctor: string;
  if (mirror) {
    mirrorFields =
      `\n    // Active poses used by the paths so the statics aren't mutated by repeated mirrors\n` +
      `    public final Pose ${model.poseDecls.map((d) => activeName(d.name)).join(", ")};\n`;
    ctor =
      `    public ${cls}(Robot robot) {\n` +
      `        this.follower = robot.drivetrain.getFollower();\n` +
      `        boolean isRed = robot.alliance == Alliance.RED;\n` +
      `        alliance = robot.alliance;\n\n` +
      model.poseDecls
        .map(
          (d) =>
            `        ${activeName(d.name)} = isRed ? ${d.name}.mirror() : ${d.name};`,
        )
        .join("\n") +
      `\n    }`;
  } else {
    ctor =
      `    public ${cls}(Robot robot) {\n` +
      `        this.follower = robot.drivetrain.getFollower();\n` +
      `    }`;
  }

  const file = `package ${pkg};

import com.bylazar.configurables.annotations.Configurable;
import com.pedropathing.follower.Follower;
import com.pedropathing.geometry.BezierCurve;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.geometry.Pose;
import com.pedropathing.ivy.CommandBuilder;
import com.pedropathing.paths.PathChain;

${projectImports}

@Configurable
public class ${cls} {
${fieldLines}

${poseDeclLines}
${mirrorFields}
${ctor}

${methods}
}
`;
  return formatJava(file);
}

// -------------------------------------------------------------------------
// Style B — self-contained IVY OpMode (like Close.java, minus custom actions)
// -------------------------------------------------------------------------

export async function generateIvyOpMode(
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
  pathChains: PathChain[],
  opts: IvyOpModeOptions = {},
): Promise<string> {
  let sp = startPoint;
  let ls = lines;
  if (opts.mirrorPoses) {
    const m = mirrorPathData(startPoint, lines);
    sp = m.startPoint;
    ls = m.lines;
  }
  const model = buildModel(sp, ls, pathChains || [], sequence || []);
  const pkg = opts.packageName || "org.firstinspires.ftc.teamcode.opmode.autos";
  const cls = ident(opts.className || "Auto", "Auto");

  const poseDeclLines = model.poseDecls
    .map((d) => `    public static Pose ${d.name} = ${d.literal};`)
    .join("\n");
  const methods = model.chains
    .map((cm) => renderMethod(cm, (n) => n))
    .join("\n\n");

  const scheduleBody = model.scheduleItems
    .map((s) =>
      s.kind === "wait"
        ? `                        waitMs(${s.ms})`
        : `                        ${s.method}()`,
    )
    .join(",\n");

  const file = `package ${pkg};

import static com.pedropathing.ivy.commands.Commands.waitMs;

import com.bylazar.configurables.annotations.Configurable;
import com.pedropathing.follower.Follower;
import com.pedropathing.geometry.BezierCurve;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.geometry.Pose;
import com.pedropathing.ivy.CommandBuilder;
import com.pedropathing.ivy.groups.Groups;
import com.pedropathing.paths.PathChain;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;

// NOTE: these are project-specific — adjust the base OpMode, Robot, Alliance
// and FollowPath imports to match your setup.
import org.firstinspires.ftc.teamcode.Config.Command.CommandOpMode;
import org.firstinspires.ftc.teamcode.Config.Robot;
import org.firstinspires.ftc.teamcode.pedroPathing.FollowPath;
import org.firstinspires.ftc.teamcode.utilities.Alliance;

@Configurable
@Autonomous(name = "${cls}", group = "Auto")
public class ${cls} extends CommandOpMode {
    private Robot robot;
    private Follower follower;

    // Default alliance — the Robot constructor requires one. Change to
    // Alliance.RED (or subclass this OpMode) for the red-side auto.
    private Alliance alliance = Alliance.BLUE;

    // ---- Poses (generated from the visualizer${opts.mirrorPoses ? ", mirrored" : ""}) ----
${poseDeclLines}

    // ---- Path commands ----
${methods}

    @Override
    public void init() {
        robot = new Robot(hardwareMap, alliance, gamepad1);
        follower = robot.drivetrain.getFollower();
        follower.setStartingPose(start);
        follower.update();

        schedule(
                Groups.sequential(
${scheduleBody}
                )
        );
    }
}
`;
  return formatJava(file);
}
