# Fine-Tuning Roadmap for the Translation Engine

## Why we're doing this

The translation engine today calls one commercial API: Gemini 2.5 Flash for
all content (a Claude Haiku fallback existed until 2026-07 and was removed -
the site never translates sermons, so the "pastoral" routing tier it served
had no real content). That works, but every translation is a metered API
call, and no general-purpose
model ships with a feel for this congregation's specific register - Southern
Vietnamese, warm, communal, church-family vocabulary.

Meanwhile, the review panel at `/admin/translations` produces something no
amount of prompt engineering can: a steady stream of human-verified
translation pairs in exactly the register we want. Every approval - and
especially every edit-then-approve - is a bilingual admin saying "this is how
our community actually says this."

The plan: progressively build a fine-tuned open-source model on those
admin-approved pairs, improving Southern Vietnamese church-register quality
and reducing API dependency over time. The fine-tuned model is **not**
replacing the API immediately - it gets added as a second route alongside
Gemini, with the API fallback preserved indefinitely. The async
queue + fallback architecture is what makes the site robust; the local model
slots into it, it does not replace it.

The capture pipeline (the `fine_tuning_examples` table, the service hook in
`TranslationService.Approve`, and `scripts/export_training_pairs.py`) is live
now. Everything below is future work, gated on accumulating enough data.

## Chosen base model: Qwen2.5-7B-Instruct

Why this one:

- **Best Vietnamese quality in its weight class.** Highest Vietnamese
  benchmark scores among 7-8B open models on SEA-HELM: 54.2 VI score, beating
  even SEA-specialized models like Sailor2-8B at 49.6.
- **Supports system prompts natively.** The existing hot-swappable Supabase
  prompt (`system_prompts` table, 5-minute TTL cache) keeps working unchanged.
  Training data exported by `scripts/export_training_pairs.py` already embeds
  the same system message the model will see at inference time.
- **No Northern Vietnamese dialect bias.** It's a multilingual base, not a
  Hanoi-skewed Vietnamese-native model like PhoGPT or Vistral (see next
  section).
- **Apache 2.0 license.** No usage restrictions for a church deployment.
- **Well-trodden fine-tuning path.** LoRA via HuggingFace PEFT + TRL is the
  standard recipe for this model family; abundant working examples exist.
- **Cheap inference.** A 7B model with a LoRA adapter runs on a single GPU -
  a g4dn.xlarge AWS spot instance (one T4) is ~$0.16/hr, or use a managed
  pay-per-call endpoint with zero infra.

## The dialect rationale

Vietnamese-native open models (PhoGPT, Vistral) are trained on Vietnamese
internet text, which is dominated by the Hanoi/Northern register - the
"official" dialect of media and government. This congregation is Southern
Vietnamese diaspora; the system prompt explicitly demands the Nam Bộ / Saigon
register.

Fine-tuning a Northern-biased model toward Southern register means spending
training budget *fighting the base model's defaults*. Qwen2.5 is
dialect-neutral: it follows the system prompt's Southern-register
instructions without baked-in Northern habits pulling against them. Each
fine-tuning round on our approved Southern pairs then reinforces the register
further instead of unlearning someone else's.

## Phase 0: Data collection (NOW - ongoing)

**This is the current phase.** The `fine_tuning_examples` table is live.
Every admin approval or edit on `/admin/translations` automatically captures
a gold `(source_en, approved_vi)` pair, fire-and-forget, with deduplication
on `(record_id, source_field, record_table)`.

- **Target: 200+ pairs** before the first fine-tuning run.
- At ~5-15 new content pieces per month going through approval, expect
  **12-18 months** to hit that threshold. This is fine - the pipeline costs
  nothing to run and the data only gets better.
- Check progress any time:
  ```bash
  python scripts/export_training_pairs.py --dry-run
  ```
  It prints the current count with breakdowns by content type and field, and
  writes nothing.

## Phase 1: First fine-tuning experiment (~200 pairs)

**When to start:** the export shows 200+ unused pairs with a reasonable mix
of content types and fields (not, say, 190 calendar event titles and 10
bodies).

**Where to run:** Google Colab (free A100 tier when available) or a Kaggle
GPU notebook. Zero infrastructure cost for experimentation - do not stand up
servers for this phase.

### Training setup

- **Base:** `Qwen/Qwen2.5-7B-Instruct` from HuggingFace
- **Method:** LoRA via HuggingFace PEFT + TRL `SFTTrainer`
- **Input format:** the JSONL from `scripts/export_training_pairs.py` -
  already in `messages` format, loadable directly by `SFTTrainer`
- **LoRA config starting point:** `rank=16`, `alpha=32`,
  `target_modules=["q_proj","v_proj"]`, `dropout=0.05`
- **Training:** 3 epochs, batch size 4 with gradient accumulation 4,
  lr `2e-4` with cosine schedule
- **Output:** a LoRA adapter directory (~50-100MB), **not** a full model
  checkpoint. The adapter is what gets versioned and deployed.

### Evaluation before promotion

Before any adapter touches production, run it against a held-out eval set:

1. Set aside **20 pairs** from the approved translations. These are **never**
   included in any training run - same 20 pairs every cycle, so scores stay
   comparable across rounds.
2. Score the adapter's output with **chrF** (via the `sacrebleu` Python
   library) against the held-out gold Vietnamese.
3. Have the bilingual admin **spot-check 10 outputs** for register
   quality - chrF measures surface overlap, not whether it sounds like a
   trusted elder or a government memo.
4. **Promote only if** chrF >= baseline **and** the admin finds no register
   regressions. Baseline = the current Gemini output scored on the same eval
   set, so "better than what we already ship" is the bar, not an abstract
   number.

## Phase 2: Integration into the translation engine

**When to start:** after a Phase 1 adapter passes the eval gate.

No changes to the existing queue/worker/caching architecture - only
`translator.go` learns a new route, exactly like adding a second API.

### Routing (models.go / translator.go)

Add a `LOCAL_MODEL_ENABLED` env var (consistent with the engine's existing
opt-in-by-env-var rule). When set, `translator.go` attempts the local model
first for `ContentTypeGeneral`; on failure, empty response, or when unset, it
falls back to Gemini exactly as today.

(Alternative considered: a `ContentTypeLocal` constant. Rejected - content
type describes *what the text is*, not *which model serves it*. The env var
keeps routing an infrastructure concern.)

```
ContentTypeGeneral + LOCAL_MODEL_ENABLED:
  1. Try callLocal()
  2. On error or empty response -> fallback to callGemini()
```

### Local model server

- A small FastAPI inference server wrapping fine-tuned Qwen2.5 + LoRA adapter
- `POST /translate` `{ "text": "...", "system_prompt": "..." }` ->
  `{ "translation": "..." }` - the system prompt is passed per-request so the
  hot-swappable Supabase prompt keeps working
- `GET /health` for liveness
- Deploy on a g4dn.xlarge AWS spot instance (single T4 GPU, ~$0.16/hr), or
  use HuggingFace Inference Endpoints (pay-per-call, zero infra management)
- `translator.go` gets a `callLocal()` that mirrors `callGemini`:
  raw `net/http`, no SDK, same timeout and error-handling pattern

### Important: the cache still works the same

The sha256 content cache does not care which model produced a translation. A
local-model translation and a Gemini translation of the same source string
both land in `translations` keyed by `source_hash` - once cached, neither
model is called again. The human-in-the-loop flow is also unchanged: local
model output starts with `approved_by = NULL` and goes through the same
review panel, which means **the local model's output feeds the next training
round's capture pipeline too**.

## Phase 3: Periodic retraining loop

**When to start:** after Phase 2 is live. Run every **2-3 months** as new
approved pairs accumulate.

### Steps per retraining cycle

1. Run `scripts/export_training_pairs.py` -> new JSONL of unused pairs.
2. Merge with previous training data - or better, fine-tune from the
   **previous adapter checkpoint** rather than the base model, so learning
   compounds across rounds.
3. Run training on Colab/Kaggle (same setup as Phase 1).
4. Run the eval gate against the held-out set (same 20 pairs, same chrF +
   admin spot-check).
5. **If it passes:** deploy the new adapter to the inference server, mark the
   exported pairs `used_in_training = TRUE`, and set `training_run_id` to a
   timestamp slug (e.g. `2027-03-run-1`) so every pair is traceable to the
   run that consumed it.
6. **If it fails:** keep the current adapter, investigate which content type
   is regressing, and do **not** mark the pairs as used - they roll into the
   next cycle's training data automatically.

### What compounds over rounds

Each round the model has seen more Southern Vietnamese church-register examples.
Over time the system prompt can shrink as behavior gets baked into weights -
vocabulary rules that needed explicit prompt lines become defaults. Keep a
retraining log in the style of `prompts/CHANGELOG.md`: one entry per round
recording what changed, the eval scores, and why the adapter was or wasn't
promoted. The prompt CHANGELOG records why prompts changed; the retraining
log records why weights changed.

## What NOT to do

- **Do not fine-tune PhoGPT or Vistral.** Their Northern Vietnamese baseline
  means training budget goes to fighting dialect bias instead of building
  register quality.
- **Do not skip the eval gate.** A bad training batch can silently degrade
  the model. The gate is what separates "periodic fine-tuning" from "periodic
  quality roulette."
- **Do not retrain more often than every 2 months.** LoRA adapters need
  enough new examples to generalize. Retraining on 10 new pairs produces
  overfitting, not improvement.
- **Do not remove the Gemini fallback**, even after the local model is
  live and good. The async queue + API fallback is what makes the site robust
  to ML infra failures - a dead spot instance must degrade to "Gemini handles
  it," never to "translations stop."
