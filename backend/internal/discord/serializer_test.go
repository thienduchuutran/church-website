package discord

import (
	"strings"
	"testing"
)

func TestHTMLToDiscordMarkdown_headings(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{`<h1>Title</h1>`, "## Title"},
		{`<h2>Section</h2>`, "### Section"},
		{`<h3>Sub</h3>`, "**Sub**"},
	}
	for _, tc := range cases {
		got := HTMLToDiscordMarkdown(tc.input)
		if !strings.Contains(got, tc.want) {
			t.Errorf("input %q: want %q in output, got %q", tc.input, tc.want, got)
		}
	}
}

func TestHTMLToDiscordMarkdown_inline(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{`<p><strong>bold</strong></p>`, "**bold**"},
		{`<p><em>italic</em></p>`, "*italic*"},
		{`<p><u>under</u></p>`, "__under__"},
		{`<p><s>strike</s></p>`, "~~strike~~"},
		{`<p><a href="https://example.com">link</a></p>`, "[link](https://example.com)"},
		{`<p><code>inline</code></p>`, "`inline`"},
		{`<mark>highlight</mark>`, "highlight"},
	}
	for _, tc := range cases {
		got := HTMLToDiscordMarkdown(tc.input)
		if !strings.Contains(got, tc.want) {
			t.Errorf("input %q: want %q in output, got %q", tc.input, tc.want, got)
		}
	}
}

func TestHTMLToDiscordMarkdown_links(t *testing.T) {
	// A genuinely labeled link keeps masked markdown: the label is the point,
	// and the suppressed preview card is intended.
	if got := HTMLToDiscordMarkdown(`<p><a href="https://example.com">Watch here</a></p>`); !strings.Contains(got, "[Watch here](https://example.com)") {
		t.Errorf("labeled link should stay masked, got %q", got)
	}

	// An auto-linked bare URL (visible text IS the href, e.g. the editor
	// linkified a pasted URL) must be emitted RAW, not as [url](url) - only a
	// bare URL reliably unfurls a Discord preview card.
	bare := HTMLToDiscordMarkdown(`<p><a href="https://vbs.lifeway.com/x"><span>https://vbs.lifeway.com/x</span></a></p>`)
	if strings.Contains(bare, "](") {
		t.Errorf("bare URL must not be masked markdown, got %q", bare)
	}
	if strings.TrimSpace(bare) != "https://vbs.lifeway.com/x" {
		t.Errorf("bare URL: want raw href, got %q", bare)
	}
}

func TestExtractImageURLs(t *testing.T) {
	body := `<p>intro</p><img src="https://r2/pub/a.png"><p>mid</p><img src="https://r2/pub/b.jpg"/><img>`
	got := ExtractImageURLs(body)
	want := []string{"https://r2/pub/a.png", "https://r2/pub/b.jpg"}
	if len(got) != len(want) {
		t.Fatalf("got %d urls %v, want %d %v", len(got), got, len(want), want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("url[%d] = %q, want %q (document order, src-less <img> skipped)", i, got[i], want[i])
		}
	}
	if ExtractImageURLs("") != nil {
		t.Error("empty input should return nil")
	}
}

func TestHTMLToDiscordMarkdown_imgContributesNoText(t *testing.T) {
	// Images go to Discord as attachments, so their URL must not leak into the
	// text body.
	got := HTMLToDiscordMarkdown(`<p>hi</p><img src="https://r2/pub/x.png">`)
	if strings.Contains(got, "x.png") || strings.Contains(got, "http") {
		t.Errorf("image url leaked into text body: %q", got)
	}
}

func TestHTMLToDiscordMarkdown_lists(t *testing.T) {
	bullet := `<ul><li>One</li><li>Two</li></ul>`
	got := HTMLToDiscordMarkdown(bullet)
	if !strings.Contains(got, "• One") || !strings.Contains(got, "• Two") {
		t.Errorf("bullet list: expected • items, got %q", got)
	}

	ordered := `<ol><li>First</li><li>Second</li></ol>`
	got = HTMLToDiscordMarkdown(ordered)
	if !strings.Contains(got, "1. First") || !strings.Contains(got, "2. Second") {
		t.Errorf("ordered list: expected numbered items, got %q", got)
	}
}

func TestHTMLToDiscordMarkdown_blockquote(t *testing.T) {
	input := `<blockquote><p>Quoted text</p></blockquote>`
	got := HTMLToDiscordMarkdown(input)
	if !strings.Contains(got, "> ") {
		t.Errorf("blockquote: expected '> ' prefix, got %q", got)
	}
}

func TestHTMLToDiscordMarkdown_codeBlock(t *testing.T) {
	input := "<pre><code>func main() {}</code></pre>"
	got := HTMLToDiscordMarkdown(input)
	if !strings.Contains(got, "```") {
		t.Errorf("code block: expected ``` fences, got %q", got)
	}
	if !strings.Contains(got, "func main()") {
		t.Errorf("code block: expected code content, got %q", got)
	}
}

func TestHTMLToDiscordMarkdown_horizontalRule(t *testing.T) {
	input := `<p>before</p><hr><p>after</p>`
	got := HTMLToDiscordMarkdown(input)
	if !strings.Contains(got, "───────────────") {
		t.Errorf("hr: expected rule line, got %q", got)
	}
}

func TestHTMLToDiscordMarkdown_calloutAnnouncement(t *testing.T) {
	input := `<div data-callout="" data-callout-variant="announcement"><p>Come join us!</p></div>`
	got := HTMLToDiscordMarkdown(input)
	if !strings.Contains(got, "📣") {
		t.Errorf("announcement callout: expected 📣 emoji, got %q", got)
	}
	if !strings.Contains(got, "ANNOUNCEMENT") {
		t.Errorf("announcement callout: expected ANNOUNCEMENT label, got %q", got)
	}
	if !strings.Contains(got, "Come join us!") {
		t.Errorf("announcement callout: expected body text, got %q", got)
	}
}

func TestHTMLToDiscordMarkdown_calloutPrayer(t *testing.T) {
	input := `<div data-callout="" data-callout-variant="prayer"><p>Pray for healing</p></div>`
	got := HTMLToDiscordMarkdown(input)
	if !strings.Contains(got, "🙏") {
		t.Errorf("prayer callout: expected 🙏 emoji, got %q", got)
	}
	if !strings.Contains(got, "PRAYER REQUEST") {
		t.Errorf("prayer callout: expected PRAYER REQUEST label, got %q", got)
	}
}

func TestHTMLToDiscordMarkdown_calloutScripture(t *testing.T) {
	input := `<div data-callout="" data-callout-variant="scripture"><p>John 3:16</p></div>`
	got := HTMLToDiscordMarkdown(input)
	if !strings.Contains(got, "📖") {
		t.Errorf("scripture callout: expected 📖 emoji, got %q", got)
	}
	if !strings.Contains(got, "SCRIPTURE") {
		t.Errorf("scripture callout: expected SCRIPTURE label, got %q", got)
	}
	// Scripture variant should be block-quoted
	if !strings.Contains(got, ">") {
		t.Errorf("scripture callout: expected > prefix, got %q", got)
	}
}

func TestHTMLToDiscordMarkdown_calloutGeneral(t *testing.T) {
	input := `<div data-callout="" data-callout-variant="callout"><p>Note this</p></div>`
	got := HTMLToDiscordMarkdown(input)
	if !strings.Contains(got, "✨") {
		t.Errorf("general callout: expected ✨ emoji, got %q", got)
	}
}

func TestHTMLToDiscordMarkdown_empty(t *testing.T) {
	if got := HTMLToDiscordMarkdown(""); got != "" {
		t.Errorf("empty input: expected empty output, got %q", got)
	}
}

func TestHTMLToDiscordMarkdown_collapseNewlines(t *testing.T) {
	input := `<p>First</p><p>Second</p><p>Third</p>`
	got := HTMLToDiscordMarkdown(input)
	// Should not have 3+ consecutive newlines
	if strings.Contains(got, "\n\n\n") {
		t.Errorf("collapse newlines: found 3+ consecutive newlines in %q", got)
	}
}
