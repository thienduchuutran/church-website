# Prompt Changelog

History of changes to AI translation system prompts. Each entry should answer
**why** the prompt changed - not just what changed (git diff already shows that).
The "why" is what survives once the prompt has been edited a dozen times.

## Versioning

Patch (1.0.x) - typo fixes, wording tweaks, no semantic change
Minor (1.x.0) - vocabulary additions, new rules, register shifts
Major (x.0.0) - dialect change, audience change, fundamental rewrite

Bump the `version:` field in the markdown front-matter, add a CHANGELOG entry,
then run `scripts/sync-prompt.sh` to push to the `system_prompts` table. The
running backend's `PromptCache` (5-minute TTL) will pick up the new prompt
without a redeploy. To re-translate existing unapproved content with the new
prompt, hit `POST /admin/translations/retranslate-all` (or the button on
`/admin/translations`).

Human-approved translations (`approved_by IS NOT NULL`) are never auto-clobbered
by prompt changes - the reviewer's edits are treated as sacred. If you want
those re-translated too, use the per-row "Re-translate" button on each card.

---

## [1.0.0] - 2026-05-27

Initial prompt seeded with VGOMNE identity, Southern Vietnamese register, and
Christian and Missionary Alliance theological vocabulary.

- Established "Chúa" / "Hội thánh" / "buổi thờ phượng" lexicon to keep the
  congregation's vernacular consistent across translated posts, page content,
  and calendar events.
- Locked register to warm-but-reverent ("trusted elder speaking to family") to
  match how the Saugus elders actually speak in service.
- Preserved HTML tag rule because Tiptap-edited post bodies arrive with `<p>`,
  `<strong>`, etc., and untreated text translation would mangle them.

Known typos preserved for parity with the embedded migration seed: "intepretor"
(interpreter), "Outrach" (Outreach). A v1.0.1 patch is recommended after first
review to fix these, but content authority decisions live with the church
admins, not the build script.
