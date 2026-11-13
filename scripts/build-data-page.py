# usage: python scripts/build-data-page.py docs/data-used.md public/data.html
# Build public/data.html (copy-paste page for the Space Apps "Data used" form) from the md list.
import re, sys, html
md = open(sys.argv[1], encoding='utf-8').read()
sections = []  # (h2, [(h3, rows)])
for line in md.splitlines():
    if line.startswith('## '): sections.append((line[3:].strip(), []))
    elif line.startswith('### ') and sections: sections[-1][1].append((line[4:].strip(), []))
    elif line.startswith('| ') and not line.startswith('| Dataset name') and sections:
        cells = [c.strip() for c in line.strip().strip('|').split(' | ')]
        assert len(cells) == 3, line
        if not sections[-1][1]: sections[-1][1].append(('', []))
        sections[-1][1][-1][1].append(cells)
sections = [s for s in sections if any(r for _, r in s[1])]
assert [s[0] for s in sections] == ['NASA data', 'Other space agency data', 'Other datasets'], [s[0] for s in sections]
e = lambda s: html.escape(s, quote=True)
def btn(v): return f'<button type="button" class="cp" data-copy="{e(v)}" aria-label="Copy">Copy</button>'
out, total = [], 0
for h2, groups in sections:
    n = sum(len(r) for _, r in groups); total += n
    tsv = '\n'.join('\t'.join(c) for _, rows in groups for c in rows)
    out.append(f'<section><div class="sh"><h2>{e(h2)} <span>{n}</span></h2>{btn(tsv).replace(">Copy<", ">Copy section (TSV)<")}</div>')
    for h3, rows in groups:
        if h3: out.append(f'<h3>{e(h3)}</h3>')
        out.append('<table><thead><tr><th>#</th><th>Dataset name</th><th>Link</th><th>How you used it</th></tr></thead><tbody>')
        for i, (name, link, how) in enumerate(rows, 1):
            out.append(f'<tr><td class="n">{i}</td><td data-l="Dataset name"><span>{e(name)}</span>{btn(name)}</td>'
                       f'<td data-l="Link"><a href="{e(link)}" target="_blank" rel="noopener">{e(link)}</a>{btn(link)}</td>'
                       f'<td data-l="How you used it"><span>{e(how)}</span>{btn(how)}</td></tr>')
        out.append('</tbody></table>')
    out.append('</section>')
page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>SeedWise · Data used</title>
<style>
body{{margin:0;background:#eef1ea;color:#1d2f22;font:15px/1.45 "IBM Plex Sans",system-ui,sans-serif}}
main{{max-width:1180px;margin:0 auto;padding:28px 18px 60px}}
h1{{font:600 30px/1.2 Fraunces,Georgia,serif;margin:0 0 4px}} p.sub{{color:#46543f;margin:0 0 22px}}
section{{background:#fff;border:1px solid #d8dfd0;border-radius:14px;padding:16px 18px;margin:0 0 18px}}
.sh{{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}}
h2{{margin:0;font:600 21px Fraunces,Georgia,serif;color:#233d2b}} h2 span{{font:500 13px "IBM Plex Mono",monospace;background:#dce9b6;border-radius:99px;padding:2px 9px;vertical-align:middle}}
h3{{margin:18px 0 6px;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:#5d6d58}}
table{{width:100%;border-collapse:collapse;margin-top:8px;table-layout:fixed}}
th{{text-align:left;font-size:12px;color:#5d6d58;border-bottom:1px solid #d8dfd0;padding:6px}}
th:nth-child(1){{width:28px}} th:nth-child(2){{width:26%}} th:nth-child(3){{width:27%}}
td{{vertical-align:top;border-bottom:1px solid #edf0e8;padding:8px 6px;overflow-wrap:anywhere}}
td.n{{color:#5d6d58;font:500 12px "IBM Plex Mono",monospace}} td a{{color:#2f6946}}
td>span,td>a{{display:block;margin-bottom:5px}}
.cp{{font:500 12px "IBM Plex Mono",monospace;border:1px solid #2f6946;color:#2f6946;background:#fff;border-radius:8px;padding:3px 9px;cursor:pointer}}
@media (max-width:700px){{table,tbody,tr,td{{display:block}} thead{{display:none}} tr{{border-bottom:1px solid #d8dfd0;padding:8px 0}} td{{border:0;padding:4px 0}} td[data-l]::before{{content:attr(data-l);display:block;font:500 11px "IBM Plex Mono",monospace;color:#5d6d58;text-transform:uppercase}}}}
.cp:hover{{background:#eef5e2}} .cp.ok{{background:#2f6946;color:#fff}}
</style></head><body><main>
<h1>Data used</h1><p class="sub">{total} sources for the NASA Space Apps form. Each field has its own Copy button; "Copy section" gives tab-separated rows that paste into a spreadsheet.</p>
{''.join(out)}
</main><script>
document.addEventListener('click',async ev=>{{const b=ev.target.closest('.cp');if(!b)return;const t=b.dataset.copy,l=b.textContent;
try{{await navigator.clipboard.writeText(t)}}catch{{const a=document.createElement('textarea');a.value=t;document.body.append(a);a.select();document.execCommand('copy');a.remove()}}
b.classList.add('ok');b.textContent='Copied';setTimeout(()=>{{b.classList.remove('ok');b.textContent=l}},1200)}});
</script></body></html>'''
open(sys.argv[2], 'w', encoding='utf-8').write(page)
print(total, [ (s[0], sum(len(r) for _, r in s[1])) for s in sections])
