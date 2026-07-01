package discord

import (
	"regexp"
	"strings"

	"golang.org/x/net/html"
)

// HTMLToDiscordMarkdown converts Tiptap-generated HTML to Discord-compatible
// markdown. Callout block div elements are converted to prefixed plain-text
// equivalents because Discord does not render HTML.
func HTMLToDiscordMarkdown(rawHTML string) string {
	if rawHTML == "" {
		return ""
	}
	doc, err := html.Parse(strings.NewReader(rawHTML))
	if err != nil {
		// Fall back to stripping all tags if parsing fails.
		return stripTags(rawHTML)
	}
	var b strings.Builder
	walkNode(&b, doc, &listState{})
	result := collapseNewlines(strings.TrimSpace(b.String()))
	return result
}

// listState tracks ordered-list counter across recursive calls.
type listState struct {
	olCounter int
}

// ExtractImageURLs returns the src of every <img> in the body HTML, in document
// order. A post's inline images are sent to Discord as attachments after the
// text (Discord can't interleave them like the website), so the delivery path
// pulls the image URLs out here. Returns nil for empty/unparseable input.
func ExtractImageURLs(rawHTML string) []string {
	if rawHTML == "" {
		return nil
	}
	doc, err := html.Parse(strings.NewReader(rawHTML))
	if err != nil {
		return nil
	}
	var urls []string
	var walk func(n *html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && strings.ToLower(n.Data) == "img" {
			if src := attrVal(n, "src"); src != "" {
				urls = append(urls, src)
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return urls
}

func walkNode(b *strings.Builder, n *html.Node, ls *listState) {
	if n.Type == html.TextNode {
		b.WriteString(n.Data)
		return
	}
	if n.Type != html.ElementNode {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walkNode(b, c, ls)
		}
		return
	}

	tag := strings.ToLower(n.Data)

	switch tag {
	case "h1":
		b.WriteString("## ")
		walkChildren(b, n, ls)
		b.WriteString("\n")

	case "h2":
		b.WriteString("### ")
		walkChildren(b, n, ls)
		b.WriteString("\n")

	case "h3":
		b.WriteString("**")
		walkChildren(b, n, ls)
		b.WriteString("**\n")

	case "p":
		walkChildren(b, n, ls)
		b.WriteString("\n\n")

	case "strong", "b":
		b.WriteString("**")
		walkChildren(b, n, ls)
		b.WriteString("**")

	case "em", "i":
		b.WriteString("*")
		walkChildren(b, n, ls)
		b.WriteString("*")

	case "u":
		b.WriteString("__")
		walkChildren(b, n, ls)
		b.WriteString("__")

	case "s", "del", "strike":
		b.WriteString("~~")
		walkChildren(b, n, ls)
		b.WriteString("~~")

	case "a":
		// An auto-linked bare URL (the visible text IS the href, e.g. a URL the
		// editor linkified on paste) is emitted raw, not as masked [url](url)
		// markdown - Discord only reliably unfurls a preview card for a bare
		// URL. A genuinely labeled link (text differs from href) stays masked,
		// which keeps the nice label and intentionally suppresses the card.
		href := attrVal(n, "href")
		var inner strings.Builder
		walkChildren(&inner, n, ls)
		text := inner.String()
		if strings.TrimSpace(text) == "" || strings.TrimSpace(text) == href {
			b.WriteString(href)
		} else {
			b.WriteString("[")
			b.WriteString(text)
			b.WriteString("](")
			b.WriteString(href)
			b.WriteString(")")
		}

	case "ul":
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type == html.ElementNode && strings.ToLower(c.Data) == "li" {
				b.WriteString("• ")
				walkChildren(b, c, ls)
				b.WriteString("\n")
			}
		}
		b.WriteString("\n")

	case "ol":
		savedCounter := ls.olCounter
		ls.olCounter = 0
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type == html.ElementNode && strings.ToLower(c.Data) == "li" {
				ls.olCounter++
				b.WriteString(itoa(ls.olCounter))
				b.WriteString(". ")
				walkChildren(b, c, ls)
				b.WriteString("\n")
			}
		}
		ls.olCounter = savedCounter
		b.WriteString("\n")

	case "blockquote":
		var inner strings.Builder
		walkChildren(&inner, n, ls)
		for _, line := range strings.Split(strings.TrimRight(inner.String(), "\n"), "\n") {
			b.WriteString("> ")
			b.WriteString(line)
			b.WriteString("\n")
		}
		b.WriteString("\n")

	case "pre":
		b.WriteString("```\n")
		// Extract raw text from <pre><code>...</code></pre>
		var code strings.Builder
		extractText(&code, n)
		b.WriteString(strings.TrimRight(code.String(), "\n"))
		b.WriteString("\n```\n\n")

	case "code":
		// Inline code only — pre>code is handled by "pre" case above.
		b.WriteString("`")
		var inner strings.Builder
		extractText(&inner, n)
		b.WriteString(inner.String())
		b.WriteString("`")

	case "hr":
		b.WriteString("───────────────\n\n")

	case "mark":
		// Discord has no highlight — emit plain text.
		walkChildren(b, n, ls)

	case "img":
		// Inline images are delivered to Discord as file attachments (they
		// render after the text - Discord can't interleave them), so they
		// contribute nothing to the text body. See ExtractImageURLs.

	case "div":
		// Callout blocks: <div data-callout data-callout-variant="...">
		if attrVal(n, "data-callout") != "" || hasAttr(n, "data-callout") {
			variant := attrVal(n, "data-callout-variant")
			var inner strings.Builder
			walkChildren(&inner, n, ls)
			innerText := strings.TrimSpace(inner.String())
			// Strip the label element text that the NodeView renders (not in
			// serialized HTML, but guard anyway).
			switch variant {
			case "announcement":
				b.WriteString("\U0001f4e3 **ANNOUNCEMENT**\n")
				b.WriteString(innerText)
				b.WriteString("\n\n")
			case "prayer":
				b.WriteString("\U0001f64f **PRAYER REQUEST**\n")
				b.WriteString(innerText)
				b.WriteString("\n\n")
			case "scripture":
				b.WriteString("\U0001f4d6 **SCRIPTURE**\n")
				for _, line := range strings.Split(innerText, "\n") {
					if strings.TrimSpace(line) != "" {
						b.WriteString("> ")
						b.WriteString(line)
						b.WriteString("\n")
					}
				}
				b.WriteString("\n")
			default: // "callout" and unknown variants
				b.WriteString("✨ ")
				b.WriteString(innerText)
				b.WriteString("\n\n")
			}
		} else {
			walkChildren(b, n, ls)
		}

	case "span":
		walkChildren(b, n, ls)

	case "br":
		b.WriteString("\n")

	// Structural wrapper elements — walk into html/body but skip head content.
	case "html", "body":
		walkChildren(b, n, ls)
	case "head", "meta", "title", "style", "script":
		// do nothing — suppress head content

	default:
		// Unknown tags: walk children, emit plain text.
		walkChildren(b, n, ls)
	}
}

func walkChildren(b *strings.Builder, n *html.Node, ls *listState) {
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		walkNode(b, c, ls)
	}
}

func extractText(b *strings.Builder, n *html.Node) {
	if n.Type == html.TextNode {
		b.WriteString(n.Data)
		return
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		extractText(b, c)
	}
}

func attrVal(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

func hasAttr(n *html.Node, key string) bool {
	for _, a := range n.Attr {
		if a.Key == key {
			return true
		}
	}
	return false
}

var multiNewline = regexp.MustCompile(`\n{3,}`)

func collapseNewlines(s string) string {
	return strings.TrimSpace(multiNewline.ReplaceAllString(s, "\n\n"))
}

var tagRe = regexp.MustCompile(`<[^>]+>`)

func stripTags(s string) string {
	return tagRe.ReplaceAllString(s, "")
}

func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	// Simple recursive for numbers >= 10 (list items rarely exceed this)
	return itoa(n/10) + string(rune('0'+n%10))
}
