---
aliases:
  - AI
  - Artificial Intelligence
tags:
  - architecture
  - local-first
status: active
related: "[[Knowledge Graph]]"
references:
  - "[[Architecture#Boundaries]]"
---

# Artificial Intelligence

Inline tag #knowledge.

See [[Architecture]].
See [[Architecture#Boundaries|architecture boundaries]].
See [[#Artificial Intelligence]].
See [[Blocks#^decision-42]].

Standard Markdown: [Privacy](Privacy.md).
Relative Markdown: [Decision](../Decisions/ADR-001.md#Context).

Embed note: ![[Architecture#Summary]]
Embed image: ![[attachments/diagram.png|640]]

A stable paragraph. ^decision-42

Inline code `[[Ignored]]`.

```md
[[Also ignored]]
#not-a-tag
```


==Highlighted knowledge==

Inline comment %%this stays in editing only [[Comment Target]] #comment-tag%% remains visible.

%%
Block comment
[[Also Commented]]
#block-comment-tag
%%

> [!warning]+ Deployment warning
> Check the release plan before deploying.

A standard footnote.[^source]

[^source]: Source material.

An inline footnote ^[Inline source material].


Inline math $E = mc^2$.

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

```javascript
const answer = 42;
console.log(answer);
```

```mermaid
flowchart LR
  Markdown --> Parser
  Parser --> ReadingView
```
