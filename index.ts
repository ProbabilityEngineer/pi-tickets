import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const ACTIONS = ["ready", "list", "show", "create", "start", "close", "note", "status", "update"] as const;
const STATUSES = ["open", "in_progress", "closed"] as const;
const TYPES = ["bug", "feature", "task", "epic", "chore"] as const;
const MAX_OUTPUT = 40_000;
const TICKET_PROMPT_SNIPPET =
	"Ticket routing: for non-trivial feature/fix work, use ticket ready/show/create/start/close to track tk tickets; set cwd for tickets in another repo.";
const TICKET_GUIDELINES = [
	"For non-trivial feature/fix work, check ready tickets or create/start/close a ticket when useful; ticket actions may modify .tickets/ but should not touch code unless the task requires it.",
	"When managing tickets for a repo other than the current Pi cwd, pass the ticket tool cwd parameter instead of manually writing .tickets files.",
];

type RunResult = { code: number | null; stdout: string; stderr: string };
type ToolCtx = { cwd?: string };

type TicketParams = {
	action: (typeof ACTIONS)[number];
	cwd?: string;
	id?: string;
	title?: string;
	description?: string;
	design?: string;
	acceptance?: string;
	type?: (typeof TYPES)[number];
	priority?: number;
	assignee?: string;
	externalRef?: string;
	parent?: string;
	tags?: string;
	note?: string;
	status?: (typeof STATUSES)[number];
	limit?: number;
};

function text(content: string, details: Record<string, unknown> = {}) {
	return { content: [{ type: "text" as const, text: content }], details };
}

function requireField(value: unknown, name: string) {
	const str = String(value ?? "").trim();
	if (!str) throw new Error(`${name} is required`);
	return str;
}

function clampLimit(value: unknown) {
	const n = Number(value ?? 20);
	return Math.max(1, Math.min(100, Number.isFinite(n) ? Math.floor(n) : 20));
}

async function runTk(args: string[], cwd?: string): Promise<RunResult> {
	return await new Promise((resolve) => {
		const child = spawn("tk", args, {
			cwd: cwd ?? process.cwd(),
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (data: Buffer) => {
			stdout += String(data);
			if (stdout.length > MAX_OUTPUT) child.kill();
		});
		child.stderr.on("data", (data: Buffer) => {
			stderr += String(data);
			if (stderr.length > MAX_OUTPUT) child.kill();
		});
		child.on("error", (error) =>
			resolve({ code: 127, stdout, stderr: String(error) }),
		);
		child.on("close", (code) => resolve({ code, stdout, stderr }));
	});
}

function emptyOutputFor(action: TicketParams["action"]) {
	if (action === "ready") return "No ready tickets.";
	if (action === "list") return "No tickets found.";
	return "No ticket output.";
}

function output(result: RunResult, action: TicketParams["action"]) {
	const stdout = result.stdout.trim();
	const stderr = result.stderr.trim();
	if (stdout && stderr) return `${stdout}\n\nstderr:\n${stderr}`;
	return stdout || stderr || emptyOutputFor(action);
}

async function findTicketsDir(start: string) {
	let dir = path.resolve(start);
	while (true) {
		const candidate = path.join(dir, ".tickets");
		try {
			const stat = await fs.stat(candidate);
			if (stat.isDirectory()) return candidate;
		} catch {
			// keep walking
		}
		const parent = path.dirname(dir);
		if (parent === dir) throw new Error("no .tickets directory found");
		dir = parent;
	}
}

async function ticketPath(cwd: string, id: string) {
	const ticketsDir = await findTicketsDir(cwd);
	const entries = await fs.readdir(ticketsDir);
	const exact = `${id}.md`;
	const matches = entries.filter((entry) =>
		entry === exact || (entry.endsWith(".md") && entry.startsWith(id)),
	);
	if (matches.length === 0) throw new Error(`ticket ${id} not found`);
	if (matches.length > 1) throw new Error(`ticket id ${id} is ambiguous: ${matches.join(", ")}`);
	return path.join(ticketsDir, matches[0]);
}

function formatFrontmatterValue(value: string | number | string[]) {
	if (Array.isArray(value)) return `[${value.map((item) => String(item).trim()).filter(Boolean).join(", ")}]`;
	return String(value);
}

function setFrontmatter(content: string, fields: Record<string, string | number | string[] | undefined>) {
	const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
	if (!match) throw new Error("ticket file missing frontmatter");
	const lines = match[1].split(/\r?\n/);
	const seen = new Set<string>();
	const next = lines.map((line) => {
		const key = line.split(":", 1)[0];
		if (!(key in fields) || fields[key] === undefined) return line;
		seen.add(key);
		return `${key}: ${formatFrontmatterValue(fields[key])}`;
	});
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined && !seen.has(key)) next.push(`${key}: ${formatFrontmatterValue(value)}`);
	}
	return `---\n${next.join("\n")}\n---\n${content.slice(match[0].length)}`;
}

function sectionRegex(heading: string) {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`\\n## ${escaped}\\n[\\s\\S]*?(?=\\n## |$)`);
}

function setSection(content: string, heading: string, value: string | undefined) {
	if (value === undefined) return content;
	const block = `\n## ${heading}\n\n${value.trim()}\n`;
	const regex = sectionRegex(heading);
	if (regex.test(content)) return content.replace(regex, block);
	return `${content.trimEnd()}\n${block}`;
}

function setTitleAndDescription(content: string, title?: string, description?: string) {
	const titleMatch = /^# .*$/m.exec(content);
	if (!titleMatch) throw new Error("ticket file missing title");
	let next = title ? content.replace(/^# .*$/m, `# ${title.trim()}`) : content;
	if (description === undefined) return next;
	const nextTitleMatch = /^# .*$/m.exec(next)!;
	const titleEnd = nextTitleMatch.index + nextTitleMatch[0].length;
	const prefix = next.slice(0, titleEnd);
	const rest = next.slice(titleEnd);
	const firstSection = /\n## /.exec(rest);
	const sections = firstSection ? rest.slice(firstSection.index) : "";
	return `${prefix}\n\n${description.trim()}\n${sections}`;
}

async function updateTicket(params: TicketParams, cwd?: string) {
	const id = requireField(params.id, "id");
	const file = await ticketPath(cwd ?? process.cwd(), id);
	let content = await fs.readFile(file, "utf8");
	content = setFrontmatter(content, {
		status: params.status,
		type: params.type,
		priority: params.priority,
		assignee: params.assignee,
		"external-ref": params.externalRef,
		tags: params.tags?.split(","),
	});
	content = setTitleAndDescription(content, params.title, params.description);
	content = setSection(content, "Design", params.design);
	content = setSection(content, "Acceptance Criteria", params.acceptance);
	await fs.writeFile(file, content.endsWith("\n") ? content : `${content}\n`);
	return `Updated ${id}`;
}

function argsFor(params: TicketParams) {
	switch (params.action) {
		case "ready":
			return ["ready"];
		case "list": {
			const args = ["list"];
			if (params.status) args.push(`--status=${params.status}`);
			return args;
		}
		case "show":
			return ["show", requireField(params.id, "id")];
		case "start":
			return ["start", requireField(params.id, "id")];
		case "close":
			return ["close", requireField(params.id, "id")];
		case "note":
			return ["add-note", requireField(params.id, "id"), requireField(params.note, "note")];
		case "status":
			return ["status", requireField(params.id, "id"), requireField(params.status, "status")];
		case "create": {
			const args = ["create", requireField(params.title, "title")];
			if (params.description) args.push("--description", params.description);
			if (params.design) args.push("--design", params.design);
			if (params.acceptance) args.push("--acceptance", params.acceptance);
			if (params.type) args.push("--type", params.type);
			if (params.priority != null) args.push("--priority", String(params.priority));
			if (params.assignee) args.push("--assignee", params.assignee);
			if (params.externalRef) args.push("--external-ref", params.externalRef);
			if (params.parent) args.push("--parent", params.parent);
			if (params.tags) args.push("--tags", params.tags);
			return args;
		}
		case "update":
			throw new Error("update is handled without tk args");
	}
}

function commandArgs(input: string) {
	const [action = "ready", ...rest] = input.trim().split(/\s+/).filter(Boolean);
	return { action, rest };
}

function parseCommandCwd(rest: string[], fallback?: string) {
	const cwdIndex = rest.findIndex((value) => value === "--cwd" || value === "--repo" || value === "-C");
	if (cwdIndex < 0) return { cwd: fallback, rest };
	const cwd = requireField(rest[cwdIndex + 1], "cwd");
	return { cwd: path.resolve(fallback ?? process.cwd(), cwd), rest: [...rest.slice(0, cwdIndex), ...rest.slice(cwdIndex + 2)] };
}

function tkArgsForCommand(input: string): string[] | null {
	const trimmed = input.trim();
	const { action, rest } = commandArgs(trimmed);
	if (!trimmed || action === "ready") return ["ready"];
	if (action === "list") return ["list"];
	if (action === "show") return ["show", requireField(rest[0], "id")];
	if (action === "start") return ["start", requireField(rest[0], "id")];
	if (action === "close") return ["close", requireField(rest[0], "id")];
	if (action === "note") return ["add-note", requireField(rest[0], "id"), requireField(rest.slice(1).join(" "), "note")];
	if (action === "status") return ["status", requireField(rest[0], "id"), requireField(rest[1], "status")];
	if (action === "create") return ["create", requireField(rest.join(" "), "title")];
	if (action === "init") return null;
	throw new Error(`Unknown /tickets action: ${action}`);
}

async function initTickets(cwd?: string) {
	const root = cwd ?? process.cwd();
	const dir = path.join(root, ".tickets");
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(path.join(dir, ".gitkeep"), "");
	return `Initialized ticket directory at ${path.relative(root, dir) || ".tickets"}`;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("tickets", {
		description: "Initialize or inspect tk tickets: init, ready, list, show/start/close <id>, status <id> <status>, create <title>, note <id> <text>; use --cwd <repo> for another repo",
		handler: async (args, ctx) => {
			try {
				const parsed = commandArgs(args);
				const scoped = parseCommandCwd(parsed.rest, ctx.cwd);
				const scopedInput = [parsed.action, ...scoped.rest].join(" ");
				if (parsed.action === "init") {
					ctx.ui.notify(await initTickets(scoped.cwd), "info");
					return;
				}
				const tkArgs = tkArgsForCommand(scopedInput)!;
				const result = await runTk(tkArgs, scoped.cwd);
				ctx.ui.notify(output(result, parsed.action as TicketParams["action"]), result.code === 0 ? "info" : "warning");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});

	pi.registerTool({
		name: "ticket",
		label: "Ticket",
		description: "Manage tk tickets with one compact tool: ready/list/show/create/start/close/note/status/update.",
		promptSnippet: TICKET_PROMPT_SNIPPET,
		promptGuidelines: TICKET_GUIDELINES,
		parameters: Type.Object({
			action: Type.String({ enum: [...ACTIONS] as string[] }),
			cwd: Type.Optional(Type.String({ description: "Repository cwd containing .tickets; use for ticket actions in another repo." })),
			id: Type.Optional(Type.String()),
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			design: Type.Optional(Type.String()),
			acceptance: Type.Optional(Type.String()),
			type: Type.Optional(Type.String({ enum: [...TYPES] as string[] })),
			priority: Type.Optional(Type.Number()),
			assignee: Type.Optional(Type.String()),
			externalRef: Type.Optional(Type.String()),
			parent: Type.Optional(Type.String()),
			tags: Type.Optional(Type.String()),
			note: Type.Optional(Type.String()),
			status: Type.Optional(Type.String({ enum: [...STATUSES] as string[] })),
			limit: Type.Optional(Type.Number()),
		}),
		async execute(_id: string, params: TicketParams, _signal: AbortSignal, _update: unknown, ctx: ToolCtx) {
			try {
				const cwd = params.cwd ? path.resolve(ctx.cwd ?? process.cwd(), params.cwd) : ctx.cwd;
				if (params.action === "update") {
					return text(await updateTicket(params, cwd), { code: 0, action: "update", cwd });
				}
				const args = argsFor(params);
				const result = await runTk(args, cwd);
				const rendered = output(result, params.action)
					.split(/\r?\n/)
					.slice(0, params.action === "ready" || params.action === "list" ? clampLimit(params.limit) : 200)
					.join("\n");
				return text(rendered, { code: result.code, command: "tk", args, cwd });
			} catch (error) {
				return text(error instanceof Error ? error.message : String(error), { code: 2 });
			}
		},
	} as any);
}
