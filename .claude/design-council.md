# Design Council Process

Use this only for genuine architectural forks (trigger criteria in AGENTS.md).
Never for routine implementation, and never to generate the actual code, only
to reach and record a decision. You still write the code yourself afterward.

## Step 0: your own instinct first, before any subagent runs

Ask the user to state their own initial hypothesis in 2-3 sentences before
dispatching anything. Write it into the DECISIONS.md entry as "Initial
instinct" before proceeding. Do not skip this even if the user wants to jump
straight to the council. The point of this process is building the user's own
judgment, not replacing it.

## Step 1: proposers (parallel, isolated, genuinely divergent)

Dispatch `proposer-a`, `proposer-b`, and `proposer-c` in parallel. Give each:
- The actual relevant files and code
- The actual constraint or requirement driving the decision
- Any AGENTS.md conventions relevant to this fork, restated explicitly. A
  subagent's starting context may or may not include AGENTS.md automatically,
  don't assume it already has this, whichever way step 0's test came out.
- ONE distinct angle to argue from, different per proposer (e.g. one optimizes
  for testability, one for future extension, one for minimal surface area).
  Pick angles that genuinely conflict, not cosmetic variations.

Do NOT show any proposer the others' output. Do NOT tell them what you (the
lead) think the answer is.

## Step 2: verifier (adversarial, same raw material as the proposers)

Dispatch `verifier`. Give it:
- All three proposals in full
- The SAME raw ground-truth material the proposers had (the actual code,
  actual tests, actual constraints), not just the proposals' own reasoning
- The same restated AGENTS.md conventions given to the proposers, for the
  same reason

Task: find where each proposal actually breaks against that material. Do not
ask it to confirm the proposals are fine, ask it to try to break them.

CRITICAL RULE: never give a verifier a conclusion to support. Always give it
the raw material and an open, adversarial question. A verifier told "this is
correct, explain why" is not verifying anything, it is decorating an unproven
claim with confident-sounding detail. A verifier that inherits a generator's
conclusion instead of checking the raw source is exactly the failure mode this
whole process exists to prevent.

## Step 3: verifier-of-verifier (checks rigor, not the proposals directly)

Dispatch `verifier-of-verifier`. Give it the first verifier's full findings
plus the same raw material. Task: check whether the first verifier meaningfully
challenged each proposal, or just agreed with everything. Flag anything the
first verifier waved through without real scrutiny.

## Step 4: chairman (synthesis)

Dispatch `chairman`. Give it everything: the user's initial instinct, all three
proposals, both verifier reports. Task: recommend one direction, and explicitly
state what it kept and rejected from each input and why. A final answer with no
visible reasoning trail is a failed output.

## Step 5: write the decision, dated

Append the chairman's full output to `DECISIONS.md` under a header naming the
fork.

## Step 6: required, not optional, close the loop yourself

Prompt the user to write 3-5 sentences in their own words explaining the
decision as if answering an interview question about it. Append this under the
chairman's entry. Do not consider the fork resolved until this is written.
This step is the actual point of the whole process, everything before it is
scaffolding for this.
