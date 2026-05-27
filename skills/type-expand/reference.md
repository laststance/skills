# Type Expand Reference

## Quick Command

```bash
pnpm dlx tsx ~/.agents/skills/type-expand/scripts/expand-type.ts --file <filePath> --type <typeName>
```

## Examples

### Expand selected alias from current repository

```bash
pnpm dlx tsx ~/.agents/skills/type-expand/scripts/expand-type.ts \
  --file src/types/orderItemSetting.ts \
  --type OrderItemSetting
```

### Use explicit tsconfig

```bash
pnpm dlx tsx ~/.agents/skills/type-expand/scripts/expand-type.ts \
  --file /path/to/src/types/domain.ts \
  --type DomainType \
  --project /path/to/tsconfig.json
```

### Increase expansion depth

```bash
pnpm dlx tsx ~/.agents/skills/type-expand/scripts/expand-type.ts \
  --file /path/to/type-file.ts \
  --type VeryNestedType \
  --maxDepth 12 \
  --maxNodes 3000
```

## Output Notes

- Primary output is always:
  - `export type <TypeName> =`
  - followed by `| ...` expanded branches.
- If full reduction is not possible, unresolved notes are appended.
- Typical unresolved causes:
  - unconstrained generic parameters
  - unresolved conditional branches
  - recursion/depth guard fallback

## Troubleshooting

- `Type alias "X" not found`: verify `--file` and `--type`.
- `Could not locate tsconfig.json`: pass `--project`.
- If output is too shallow, increase `--maxDepth` and `--maxNodes`.
