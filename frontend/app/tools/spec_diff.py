"""Markdown list of differences: shared docs/api/openapi.yaml vs frontend/app/api/openapi.frontend.yaml."""
import yaml

base = yaml.safe_load(open('../../docs/api/openapi.yaml', encoding='utf-8'))
front = yaml.safe_load(open('api/openapi.frontend.yaml', encoding='utf-8'))
out = []


def props(schema):
    if not isinstance(schema, dict):
        return {}, set()
    p, req = {}, set(schema.get('required', []))
    for part in schema.get('allOf', []):
        pp, rr = props(part)
        p.update(pp)
        req |= rr
    p.update(schema.get('properties', {}))
    return p, req


def short(v):
    s = yaml.safe_dump(v, allow_unicode=True, default_flow_style=True, width=10_000).strip()
    return s if len(s) <= 140 else s[:137] + '...'


# Paths
bp, fp = base['paths'], front['paths']
added_paths = [f'{m.upper()} {p}' for p in fp for m in fp[p] if m in ('get', 'post', 'put', 'patch', 'delete') and (p not in bp or m not in bp[p])]
changed_ops = []
for p in fp:
    for m, op in fp[p].items():
        if m not in ('get', 'post', 'put', 'patch', 'delete') or p not in bp or m not in bp[p]:
            continue
        if yaml.safe_dump(op, sort_keys=True) != yaml.safe_dump(bp[p][m], sort_keys=True):
            changed_ops.append(f'{m.upper()} {p}')

out.append('## Paths\n')
out.append('### Added\n')
out += [f'- `{x}`' for x in added_paths] or ['- (none)']
out.append('\n### Changed (parameters, responses or descriptions)\n')
out += [f'- `{x}`' for x in changed_ops] or ['- (none)']

# Schemas
bs, fs = base['components']['schemas'], front['components']['schemas']
out.append('\n## Schemas\n')
new = [n for n in fs if n not in bs]
out.append('### Added\n')
out += [f'- `{n}`' for n in new] or ['- (none)']
out.append('\n### Changed\n')
for n in fs:
    if n not in bs or yaml.safe_dump(fs[n], sort_keys=True) == yaml.safe_dump(bs[n], sort_keys=True):
        continue
    fprops, freq = props(fs[n])
    bprops, breq = props(bs[n])
    lines = []
    for k in fprops:
        if k not in bprops:
            lines.append(f'  - + `{k}`: {short(fprops[k])}')
        elif yaml.safe_dump(fprops[k], sort_keys=True) != yaml.safe_dump(bprops[k], sort_keys=True):
            lines.append(f'  - ~ `{k}`: {short(bprops[k])} → {short(fprops[k])}')
    for k in bprops:
        if k not in fprops:
            lines.append(f'  - − `{k}` (removed)')
    if freq != breq:
        lines.append(f'  - required: +{sorted(freq - breq)} −{sorted(breq - freq)}')
    if not lines:
        lines.append('  - enum / description changed')
        if 'enum' in fs[n] or 'enum' in bs[n]:
            lines[-1] = f"  - enum: {bs[n].get('enum')} → {fs[n].get('enum')}"
    out.append(f'- `{n}`')
    out += lines

head = """# Frontend OpenAPI changes (proposal)

The React app generates its types from `openapi.frontend.yaml` (this folder), which is the shared
`docs/api/openapi.yaml` (commit 1d86de6) plus the fields the screens need. The shared file is owned with the
backend team and is **not** changed by the frontend; this list is the material to agree on together.
Once a change is accepted it moves to `docs/api/openapi.yaml` and is removed from here.

Regenerate this list: `python tools/spec_diff.py` (from `frontend/app`).

"""
open('api/OPENAPI_CHANGES.md', 'w', encoding='utf-8', newline='\n').write(head + '\n'.join(out) + '\n')
print(len(added_paths), 'paths added,', len(changed_ops), 'ops changed,', len(new), 'schemas added')
