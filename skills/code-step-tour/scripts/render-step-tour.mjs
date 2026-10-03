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
    errors.push(...validateReact(step));
  }
  return errors;
}

function validateReact(step) {
  const react = step.react;
  if (react == null) return [];
  const errors = [];
  const label = step.label ?? step.id;
  const nodes = react.hierarchy;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    errors.push(`react on ${label} needs a hierarchy from the page down to the hook caller`);
  }
  for (const node of nodes ?? []) {
    if (!node.name || !node.file || !Number.isInteger(node.line)) {
      errors.push(`hierarchy node on ${label} needs name, file, and integer line`);
    }
  }
  if (!react.caller) {
    errors.push(`caller on ${label} is required`);
  } else if (!react.caller.name || !react.caller.file || !Number.isInteger(react.caller.line)) {
    errors.push(`caller on ${label} needs name, file, and integer line`);
  } else {
    const leaf = nodes?.[nodes.length - 1];
    if (leaf && leaf.name !== react.caller.name) {
      errors.push(`caller on ${label} must be the last hierarchy node`);
    }
  }
  if (react.hook != null && typeof react.hook !== "string") {
    errors.push(`hook on ${label} must be a string`);
  }
  for (const prop of react.props ?? []) {
    if (!prop.name || !prop.from || !prop.to || !prop.file || !Number.isInteger(prop.line)) {
      errors.push(`prop on ${label} needs name, from, to, file, and integer line`);
    }
  }
  for (const item of react.context ?? []) {
    if (!item.name || !item.provider || !item.consumer || !item.file || !Number.isInteger(item.line)) {
      errors.push(`context on ${label} needs name, provider, consumer, file, and integer line`);
    }
  }
  return errors;
}
