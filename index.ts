import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const ACTIONS = ["ready", "list", "show", "create", "start", "close", "note"] as const;
const STATUSES = ["open", "in_progress", "closed"] as const;
const TYPES = ["bug", "feature", "task", "epic", "chore"] as const;
const MAX_OUTPUT = 40_000;
const TICKET_PROMPT_SNIPPET =
	"Ticket routing: for non-trivial feature/fix work, use ticket ready/show/create/start/close to track tk tickets.";
const TICKET_GUIDELINES = [
	"For non-trivial feature/fix work, check ready tickets or create/start/close a ticket when useful; ticket actions may modify .tickets/ but should not touch code unless the task requires it.",
];

type RunResult = { code: number | null; stdout: string; stderr: string };
type ToolCtx = { cwd?: string };

type TicketParams = {
	action: (typeof ACTIONS)[number];
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
			return [
				"add-note",
				requireField(params.id, "id"),
				requireField(params.note, "note"),
			];
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
	}
}

function commandArgs(input: string) {
	const [action = "ready", ...rest] = input.trim().split(/\s+/).filter(Boolean);
	return { action, rest };
}

function tkArgsForCommand(input: string, cwd?: string): string[] | null {
	const trimmed = input.trim();
	const { action, rest } = commandArgs(trimmed);
	if (!trimmed || action === "ready") return ["ready"];
	if (action === "list") return ["list"];
	if (action === "show") return ["show", requireField(rest[0], "id")];
	if (action === "start") return ["start", requireField(rest[0], "id")];
	if (action === "close") return ["close", requireField(rest[0], "id")];
	if (action === "note") return ["add-note", requireField(rest[0], "id"), requireField(rest.slice(1).join(" "), "note")];
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
		description: "Initialize or inspect tk tickets: init, ready, list, show/start/close <id>, create <title>, note <id> <text>",
		handler: async (args, ctx) => {
			try {
				const parsed = commandArgs(args);
				if (parsed.action === "init") {
					ctx.ui.notify(await initTickets(ctx.cwd), "info");
					return;
				}
				const tkArgs = tkArgsForCommand(args, ctx.cwd)!;
				const result = await runTk(tkArgs, ctx.cwd);
				ctx.ui.notify(output(result, parsed.action as TicketParams["action"]), result.code === 0 ? "info" : "warning");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});

	pi.registerTool({
		name: "ticket",
		label: "Ticket",
		description:
			"Manage tk tickets with one compact tool: ready/list/show/create/start/close/note.",
		promptSnippet: TICKET_PROMPT_SNIPPET,
		promptGuidelines: TICKET_GUIDELINES,
		parameters: Type.Object({
			action: Type.String({ enum: [...ACTIONS] as string[] }),
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
				const args = argsFor(params);
				const result = await runTk(args, ctx.cwd);
				const rendered = output(result, params.action)
					.split(/\r?\n/)
					.slice(0, params.action === "ready" || params.action === "list" ? clampLimit(params.limit) : 200)
					.join("\n");
				return text(rendered, { code: result.code, command: "tk", args });
			} catch (error) {
				return text(error instanceof Error ? error.message : String(error), { code: 2 });
			}
		},
	} as any);
}
