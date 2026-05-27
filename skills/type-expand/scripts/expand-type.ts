#!/usr/bin/env node
/* eslint-disable no-console */

import fs from "fs";
import path from "path";
import { createRequire } from "module";

function parseArgs(argv: string[]) {
  const read = (name: string): string | undefined => {
    const index = argv.findIndex((arg) => arg === `--${name}`);
    if (index < 0 || index + 1 >= argv.length) return undefined;
    return argv[index + 1];
  };

  const filePath = read("file");
  const typeName = read("type");
  const projectPath = read("project");
  const maxDepth = Number.parseInt(read("maxDepth") ?? "8", 10);
  const maxNodes = Number.parseInt(read("maxNodes") ?? "10000", 10);

  if (!filePath || !typeName) {
    throw new Error(
      "Usage: expand-type.ts --file <path> --type <TypeAlias> [--project <tsconfig>] [--maxDepth <n>] [--maxNodes <n>]",
    );
  }

  return {
    filePath: path.resolve(filePath),
    typeName,
    projectPath: projectPath ? path.resolve(projectPath) : undefined,
    maxDepth,
    maxNodes,
  };
}

function findTsConfigPath(filePath: string, explicitProjectPath?: string) {
  if (explicitProjectPath) {
    if (!fs.existsSync(explicitProjectPath)) {
      throw new Error(`tsconfig not found: ${explicitProjectPath}`);
    }
    return explicitProjectPath;
  }

  let current = path.dirname(filePath);
  for (;;) {
    const candidate = path.join(current, "tsconfig.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Could not locate tsconfig.json from ${filePath}. Pass --project explicitly.`);
}

function loadTypeScript(tsConfigPath: string) {
  const projectRoot = path.dirname(tsConfigPath);
  const projectRequire = createRequire(path.join(projectRoot, "package.json"));
  try {
    return projectRequire("typescript");
  } catch {
    throw new Error(
      `Cannot resolve TypeScript from project root: ${projectRoot}. Install it in that project or pass a different --project.`,
    );
  }
}

function createProgram(ts: any, tsConfigPath: string, filePath: string) {
  const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsConfigPath),
    undefined,
    tsConfigPath,
  );

  const rootNames = new Set(parsed.fileNames.map((name: string) => path.resolve(name)));
  rootNames.add(path.resolve(filePath));

  return ts.createProgram({
    rootNames: [...rootNames],
    options: parsed.options,
    projectReferences: parsed.projectReferences,
  });
}

function findTypeAliasNode(ts: any, sourceFile: any, typeName: string) {
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === typeName) {
      return statement;
    }
  }
  throw new Error(`Type alias "${typeName}" not found in ${sourceFile.fileName}`);
}

function propertyNameText(name: string) {
  return /^[$A-Z_][0-9A-Z_$]*$/i.test(name) ? name : JSON.stringify(name);
}

function createTypeKey(checker: any, type: any, typeFormatFlags: number) {
  return `${type.flags}:${checker.typeToString(type, undefined, typeFormatFlags)}`;
}

function renderType(type: any, context: any, depth: number): string {
  const { ts, checker, typeFormatFlags } = context;
  context.renderedNodeCount += 1;

  if (context.renderedNodeCount > context.maxNodes) {
    context.unresolvedNotes.add("maxNodes reached: some branches were truncated.");
    return "unknown /* truncated:maxNodes */";
  }
  if (depth > context.maxDepth) {
    context.unresolvedNotes.add("maxDepth reached: some nested fields were truncated.");
    return "unknown /* truncated:maxDepth */";
  }

  const format = () => checker.typeToString(type, undefined, typeFormatFlags);

  if (type.flags & ts.TypeFlags.String) return "string";
  if (type.flags & ts.TypeFlags.Number) return "number";
  if (type.flags & ts.TypeFlags.Boolean) return "boolean";
  if (type.flags & ts.TypeFlags.BigInt) return "bigint";
  if (type.flags & ts.TypeFlags.Symbol) return "symbol";
  if (type.flags & ts.TypeFlags.Undefined) return "undefined";
  if (type.flags & ts.TypeFlags.Null) return "null";
  if (type.flags & ts.TypeFlags.Void) return "void";
  if (type.flags & ts.TypeFlags.Never) return "never";
  if (type.flags & ts.TypeFlags.Unknown) return "unknown";
  if (type.flags & ts.TypeFlags.Any) return "any";
  if (
    type.flags &
    (ts.TypeFlags.StringLiteral |
      ts.TypeFlags.NumberLiteral |
      ts.TypeFlags.BooleanLiteral |
      ts.TypeFlags.BigIntLiteral)
  ) {
    return format();
  }

  if (type.flags & ts.TypeFlags.TypeParameter) {
    const constrained = checker.getBaseConstraintOfType(type);
    if (constrained) return renderType(constrained, context, depth + 1);
    const text = format();
    context.unresolvedNotes.add(`Unresolved generic type parameter: ${text}`);
    return `${text} /* unresolved:type-parameter */`;
  }

  if (type.flags & ts.TypeFlags.Conditional) {
    const text = format();
    context.unresolvedNotes.add(`Conditional type not fully reduced: ${text}`);
    return `${text} /* unresolved:conditional */`;
  }

  const typeKey = createTypeKey(checker, type, typeFormatFlags);
  if (context.visited.has(typeKey)) {
    context.unresolvedNotes.add(`Circular reference: ${format()}`);
    return "unknown /* circular */";
  }

  context.visited.add(typeKey);
  try {
    if (type.isUnion()) {
      return type.types.map((member: any) => renderType(member, context, depth + 1)).join(" | ");
    }

    if (type.isIntersection()) {
      return type.types.map((member: any) => renderType(member, context, depth + 1)).join(" & ");
    }

    if (checker.isArrayType(type)) {
      const elementType = checker.getElementTypeOfArrayType(type);
      return `Array<${elementType ? renderType(elementType, context, depth + 1) : "unknown"}>`;
    }

    if (checker.isTupleType(type)) {
      const args = checker.getTypeArguments(type);
      const text = args.map((arg: any) => renderType(arg, context, depth + 1)).join(", ");
      return `[${text}]`;
    }

    if (type.flags & ts.TypeFlags.Object) {
      const properties = checker.getPropertiesOfType(type);
      const stringIndex = checker.getIndexTypeOfType(type, ts.IndexKind.String);
      const numberIndex = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
      const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);

      if (properties.length === 0 && !stringIndex && !numberIndex && signatures.length === 0) {
        const text = format();
        if (text.includes("infer ")) {
          context.unresolvedNotes.add(`Infer placeholder remained: ${text}`);
          return `${text} /* unresolved:infer */`;
        }
        return text;
      }

      const items: string[] = [];
      const sorted = [...properties].sort((a, b) => a.getName().localeCompare(b.getName()));
      for (const prop of sorted) {
        const declaration = prop.valueDeclaration ?? prop.declarations?.[0];
        const propType = checker.getTypeOfSymbolAtLocation(prop, declaration ?? prop);
        const optional = (prop.flags & ts.SymbolFlags.Optional) !== 0;
        const modifiers =
          declaration && ts.canHaveModifiers(declaration) ? ts.getModifiers(declaration) : undefined;
        const isReadonly = Boolean(
          modifiers?.some((modifier: any) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword),
        );
        const name = propertyNameText(prop.getName());
        const value = renderType(propType, context, depth + 1);
        items.push(`${isReadonly ? "readonly " : ""}${name}${optional ? "?" : ""}: ${value};`);
      }

      if (stringIndex) {
        items.push(`[key: string]: ${renderType(stringIndex, context, depth + 1)};`);
      }
      if (numberIndex) {
        items.push(`[index: number]: ${renderType(numberIndex, context, depth + 1)};`);
      }
      if (signatures.length > 0) {
        const signatureText = signatures
          .map((sig: any) => checker.signatureToString(sig, undefined, typeFormatFlags))
          .join(" | ");
        items.push(`/* call */ ${signatureText};`);
      }

      return `{ ${items.join(" ")} }`;
    }

    return format();
  } finally {
    context.visited.delete(typeKey);
  }
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const tsConfigPath = findTsConfigPath(args.filePath, args.projectPath);
  const ts = loadTypeScript(tsConfigPath);
  const program = createProgram(ts, tsConfigPath, args.filePath);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(args.filePath);
  if (!sourceFile) {
    throw new Error(`Source file not found in program: ${args.filePath}`);
  }

  const aliasNode = findTypeAliasNode(ts, sourceFile, args.typeName);
  const aliasType = checker.getTypeAtLocation(aliasNode.type);
  const typeFormatFlags =
    ts.TypeFormatFlags.NoTruncation |
    ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
    ts.TypeFormatFlags.WriteArrayAsGenericType;

  const context = {
    ts,
    checker,
    typeFormatFlags,
    maxDepth: args.maxDepth,
    maxNodes: args.maxNodes,
    visited: new Set<string>(),
    renderedNodeCount: 0,
    unresolvedNotes: new Set<string>(),
  };

  if (aliasType.isUnion()) {
    const members = aliasType.types.map((member: any) => `| ${renderType(member, context, 0)}`);
    console.log(`export type ${args.typeName} =\n${members.join("\n")};`);
  } else {
    console.log(`export type ${args.typeName} =\n| ${renderType(aliasType, context, 0)};`);
  }

  if (context.unresolvedNotes.size > 0) {
    console.log("\n/* unresolved notes */");
    for (const note of context.unresolvedNotes) {
      console.log(`- ${note}`);
    }
  }
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
