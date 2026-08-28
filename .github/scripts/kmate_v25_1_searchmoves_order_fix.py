from pathlib import Path
import runpy

runpy.run_path('.github/scripts/kmate_v25_1_review_polish.py', run_name='__main__')

path = Path('kmate-trainer/app-v7-part1.txt')
source = path.read_text()
old = """      const rootClause = roots.length ? `searchmoves ${roots.join(' ')} ` : '';
      this.send(`go ${rootClause}movetime ${thinkTime}`);"""
new = """      const rootClause = roots.length ? ` searchmoves ${roots.join(' ')}` : '';
      this.send(`go movetime ${thinkTime}${rootClause}`);"""
if old not in source:
    raise SystemExit('Unable to locate v25 searchmoves command')
path.write_text(source.replace(old, new, 1))
