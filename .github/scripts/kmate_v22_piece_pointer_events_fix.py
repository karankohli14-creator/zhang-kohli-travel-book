from pathlib import Path

path = Path('kmate-trainer/styles-v7.css')
css = path.read_text()
rule = '#board .piece[data-drag-enabled="true"]{pointer-events:auto!important}'
if rule not in css:
    css += '\n' + rule + '\n'
path.write_text(css)
