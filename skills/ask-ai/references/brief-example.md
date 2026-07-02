# Worked example — the dagre brief that worked

The brief below (2026-04-24) shows all five required sections in action: framing, inputs, expected vs actual, ruled out, length cap. It produced the correct diagnosis in one pass.

```
I have a puzzling bug with dagre graph layout. Same dagre@0.8.5, same
exact input, different outputs between Node.js and browser (Next.js 15
Turbopack bundle).

Input (5 nodes, 4 edges):
- nodes: brief (260x132), scriptA (300x186), workA (260x220),
  scriptB (300x186), workB (260x220) — all unique IDs
- edges: brief→scriptA, scriptA→workA, brief→scriptB, scriptB→workB
- config: { rankdir: 'LR', ranksep: 120, nodesep: 46, marginx: 64, marginy: 58 }

Code (simplified):
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph(DAGRE_CONFIG)
    for (const n of nodes) g.setNode(n.id, { width, height })
    for (const e of edges) g.setEdge(e.source, e.target)
    dagre.layout(g)

Node.js output (correct):
- scriptA (594, 168), scriptB (594, 434)

Browser output (WRONG):
- scriptA and scriptB both at (594, 434) — siblings collapse

Things I verified:
- All 5 node IDs are unique (confirmed in DOM data-id).
- All 4 edges have distinct source/target pairs.
- Dagre version is 0.8.5 in both.
- React Flow is not deduping.

What's going wrong? 200 words max.
```

The one-pass answer: `graphlib.setNode(v, value)` stores `value` by reference, and `dagre.layout()` mutates it to write x/y. The codebase's `resolveNodeSize` returned the same shared label object for every script node, so the last write won.
