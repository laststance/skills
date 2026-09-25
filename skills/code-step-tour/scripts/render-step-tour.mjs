import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = dirname(dirname(fileURLToPath(import.meta.url)));
const templatePath = resolve(skillDir, "assets/viewer.html");
const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error("usage: node render-step-tour.mjs <steps.json> <output.html>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(inputPath, "utf8"));
const errors = validate(data);
if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

const template = readFileSync(templatePath, "utf8");
const marker = "__STEP_TOUR_DATA__";
if (!template.includes(marker)) {
  console.error(`template is missing ${marker}`);
  process.exit(1);
}

const payload = JSON.stringify(data).replaceAll("<", "\\u003c");
writeFileSync(outputPath, template.replace(marker, payload));
console.log(outputPath);

function validate(value) {
  const errors = [];
  if (typeof value?.title !== "string" || value.title.length === 0) {
    errors.push("title is required");
  }
  if (!Array.isArray(value?.actors) || value.actors.length < 2 || value.actors.length > 6) {
    errors.push("actors must be 2 to 6");
  }
  if (!Array.isArray(value?.steps) || value.steps.length < 3 || value.steps.length > 12) {
    errors.push("steps must be 3 to 12");
  }
  const actorIds = new Set((value.actors ?? []).map((actor) => actor.id));
  for (const actor of value.actors ?? []) {
    if (!actor.id || !actor.label) errors.push(`actor ${actor.id ?? "?"} needs id and label`);
  }
  for (const step of value.steps ?? []) {
    if (!actorIds.has(step.from) || !actorIds.has(step.to)) {
      errors.push(`step ${step.id ?? step.label} points at an unknown actor`);
    }
    if (!step.label || !step.note) errors.push(`step ${step.id ?? "?"} needs label and note`);
    if (!Array.isArray(step.symbols) || step.symbols.length === 0) {
      errors.push(`step ${step.label ?? step.id} needs at least one symbol`);
    }
    for (const symbol of step.symbols ?? []) {
      if (!symbol.name || !symbol.file || !Number.isInteger(symbol.line) || !symbol.kind || !symbol.role) {
        errors.push(`symbol on ${step.label ?? step.id} needs kind, name, file, integer line, and role`);
      }
    }
  }
  return errors;
}
