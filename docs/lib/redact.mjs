/**
 * redact.mjs: make a report safe to publish without changing what it proves.
 *
 * A Tells report describes a text, and the only things in it that identify a
 * person or a project are the file path and the command line that names it.
 * Redaction removes those two and nothing else. Findings, locations, counts,
 * the document hash and the limits block are untouched, so a redacted report
 * still passes `tells audit` against the same document.
 *
 * What redaction does NOT do: it does not remove the matched text or the
 * excerpts. Those are the document's own words, the audit needs them to
 * verify locations, and a report with them stripped would prove nothing. If
 * the text itself is private, do not publish a report about it.
 *
 * Deterministic: the same report and the same `when` give the same output.
 */

export function redact(report, { when = null, reason = 'file path and command line can identify a person or project' } = {}) {
  const out = JSON.parse(JSON.stringify(report));
  const fields = [];
  const path = out.document?.path;
  if (out.document && 'path' in out.document) {
    delete out.document.path;
    fields.push('document.path');
  }
  if (out.command && out.command !== 'tells (api)') {
    // Only the path comes out. The flags stay, because the audit checks that
    // the recorded command selects the rules the report says it ran, and a
    // command stripped of "--only em-dash" would no longer do that.
    const withheld = path
      ? out.command.split(`"${path}"`).join('<path withheld>').split(path).join('<path withheld>')
      : 'tells <path withheld>';
    out.command = withheld === out.command ? 'tells <path withheld>' : withheld;
    fields.push('command');
  }
  out.redaction = {
    fields,
    reason,
    when: when ?? report.observedAt ?? null,
    kept: 'findings, locations, counts, document sha256 and the limits block are unchanged, so this report still audits against the same document',
  };
  return out;
}
