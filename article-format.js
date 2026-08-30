function escapeHtmlLocal(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function slugifyHeading(value = "") {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `section-${Date.now()}`;
}

function restoreInlineTokens(text, tokens) {
    return tokens.reduce((result, token, index) => {
        return result.replaceAll(`__ARTICLE_TOKEN_${index}__`, token);
    }, text);
}

function getLineStart(value = "", index = 0) {
    const boundary = value.lastIndexOf("\n", Math.max(0, index - 1));
    return boundary === -1 ? 0 : boundary + 1;
}

function getLineEnd(value = "", index = 0) {
    const boundary = value.indexOf("\n", index);
    return boundary === -1 ? value.length : boundary;
}

function getLineSelection(value = "", selectionStart = 0, selectionEnd = 0) {
    return {
        start: getLineStart(value, selectionStart),
        end: getLineEnd(value, selectionEnd)
    };
}

function ensureBlockSpacing(value = "", start = 0, end = 0) {
    const before = value.slice(0, start);
    const after = value.slice(end);
    const prefix = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const suffix = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";

    return {
        prefix,
        suffix
    };
}

function formatInlineMarkdown(value = "") {
    let text = escapeHtmlLocal(value);
    const tokens = [];

    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, url) => {
        const token = `<a href="${escapeHtmlLocal(url)}" target="_blank" rel="noopener noreferrer">${escapeHtmlLocal(label)}</a>`;
        const placeholder = `__ARTICLE_TOKEN_${tokens.length}__`;
        tokens.push(token);
        return placeholder;
    });

    text = text.replace(/`([^`]+)`/g, (match, code) => {
        const placeholder = `__ARTICLE_TOKEN_${tokens.length}__`;
        tokens.push(`<code>${code}</code>`);
        return placeholder;
    });

    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    return restoreInlineTokens(text, tokens);
}

export function renderArticleBodyHtml(markdown = "") {
    const normalized = String(markdown || "").replace(/\r\n/g, "\n").trim();
    if (!normalized) {
        return "<p>No full article has been written yet.</p>";
    }

    const lines = normalized.split("\n");
    const blocks = [];

    for (let index = 0; index < lines.length;) {
        const rawLine = lines[index];
        const line = rawLine.trim();

        if (!line) {
            index += 1;
            continue;
        }

        if (line.startsWith("```")) {
            const codeLines = [];
            index += 1;

            while (index < lines.length && !lines[index].trim().startsWith("```")) {
                codeLines.push(lines[index]);
                index += 1;
            }

            if (index < lines.length) {
                index += 1;
            }

            blocks.push(`<pre><code>${escapeHtmlLocal(codeLines.join("\n"))}</code></pre>`);
            continue;
        }

        const headingMatch = rawLine.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
            const level = Math.min(3, headingMatch[1].length);
            const headingText = headingMatch[2].trim();
            blocks.push(`<h${level} id="${slugifyHeading(headingText)}">${formatInlineMarkdown(headingText)}</h${level}>`);
            index += 1;
            continue;
        }

        if (/^(-|\*)\s+/.test(line)) {
            const items = [];

            while (index < lines.length && /^(-|\*)\s+/.test(lines[index].trim())) {
                items.push(lines[index].trim().replace(/^(-|\*)\s+/, ""));
                index += 1;
            }

            blocks.push(`<ul>${items.map((item) => `<li>${formatInlineMarkdown(item)}</li>`).join("")}</ul>`);
            continue;
        }

        if (/^\d+\.\s+/.test(line)) {
            const items = [];

            while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
                items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
                index += 1;
            }

            blocks.push(`<ol>${items.map((item) => `<li>${formatInlineMarkdown(item)}</li>`).join("")}</ol>`);
            continue;
        }

        if (line.startsWith(">")) {
            const quoteLines = [];

            while (index < lines.length && lines[index].trim().startsWith(">")) {
                quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
                index += 1;
            }

            blocks.push(`<blockquote><p>${formatInlineMarkdown(quoteLines.join(" "))}</p></blockquote>`);
            continue;
        }

        const paragraphLines = [];

        while (index < lines.length) {
            const nextLine = lines[index];
            const nextTrimmed = nextLine.trim();

            if (!nextTrimmed || nextTrimmed.startsWith("```") || /^#{1,3}\s+/.test(nextLine) || /^(-|\*)\s+/.test(nextTrimmed) || /^\d+\.\s+/.test(nextTrimmed) || nextTrimmed.startsWith(">")) {
                break;
            }

            paragraphLines.push(nextTrimmed);
            index += 1;
        }

        blocks.push(`<p>${formatInlineMarkdown(paragraphLines.join(" "))}</p>`);
    }

    return blocks.join("");
}

export function extractArticleOutline(markdown = "") {
    const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
    return lines
        .map((line) => line.match(/^(#{1,3})\s+(.+)$/))
        .filter(Boolean)
        .map((match) => ({
            id: slugifyHeading(match[2].trim()),
            title: match[2].trim(),
            level: Math.min(3, match[1].length)
        }));
}

export function applyMarkdownFormat(textarea, format = "bold") {
    if (!textarea) {
        return;
    }

    const value = textarea.value || "";
    const selectionStart = textarea.selectionStart ?? value.length;
    const selectionEnd = textarea.selectionEnd ?? value.length;
    const selectedText = value.slice(selectionStart, selectionEnd);

    const inlineMap = {
        bold: { before: "**", after: "**", placeholder: "bold text" },
        italic: { before: "*", after: "*", placeholder: "italic text" },
        code: { before: "`", after: "`", placeholder: "code" }
    };

    const blockMap = {
        heading: { prefix: "## ", placeholder: "Section heading" },
        quote: { prefix: "> ", placeholder: "Quoted insight" },
        bullet: { prefix: "- ", placeholder: "List item" },
        codeblock: { before: "```\n", after: "\n```", placeholder: "const result = doWork();" }
    };

    let nextValue = value;
    let nextSelectionStart = selectionStart;
    let nextSelectionEnd = selectionEnd;

    if (inlineMap[format]) {
        const config = inlineMap[format];
        const textToWrap = selectedText || config.placeholder;
        const needsLeadingSpace = !selectedText && selectionStart > 0 && /\S/.test(value.charAt(selectionStart - 1));
        const needsTrailingSpace = !selectedText && selectionEnd < value.length && /\S/.test(value.charAt(selectionEnd));
        const replacement = `${needsLeadingSpace ? " " : ""}${config.before}${textToWrap}${config.after}${needsTrailingSpace ? " " : ""}`;
        nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
        nextSelectionStart = selectionStart + (needsLeadingSpace ? 1 : 0) + config.before.length;
        nextSelectionEnd = nextSelectionStart + textToWrap.length;
    } else if (format === "codeblock") {
        const config = blockMap.codeblock;
        const range = { start: selectionStart, end: selectionEnd };
        const textToWrap = (selectedText || config.placeholder).replace(/^\n+|\n+$/g, "");
        const spacing = ensureBlockSpacing(value, range.start, range.end);
        const replacement = `${spacing.prefix}${config.before}${textToWrap}${config.after}${spacing.suffix}`;
        nextValue = `${value.slice(0, range.start)}${replacement}${value.slice(range.end)}`;
        nextSelectionStart = range.start + spacing.prefix.length + config.before.length;
        nextSelectionEnd = nextSelectionStart + textToWrap.length;
    } else if (blockMap[format]) {
        const config = blockMap[format];
        const range = selectedText ? { start: selectionStart, end: selectionEnd } : getLineSelection(value, selectionStart, selectionEnd);
        const rawBlock = selectedText || value.slice(range.start, range.end) || config.placeholder;
        const cleanedBlock = rawBlock.replace(/^\n+|\n+$/g, "") || config.placeholder;
        const replacement = cleanedBlock
            .split("\n")
            .map((line) => {
                const strippedLine = line.replace(/^(\s*)(#{1,3}\s+|>\s+|-+\s+|\*\s+|\d+\.\s+)/, "$1");
                return `${config.prefix}${strippedLine.trim() || config.placeholder}`;
            })
            .join("\n");
        nextValue = `${value.slice(0, range.start)}${replacement}${value.slice(range.end)}`;
        nextSelectionStart = range.start + config.prefix.length;
        nextSelectionEnd = range.start + replacement.length;
    }

    textarea.value = nextValue;
    textarea.focus();
    textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
