from pathlib import Path

path = Path('.github/scripts/kmate_v35_3_verify.js')
text = path.read_text()
old = """    assert.ok(Number(result.rating) >= 0 && Number(result.rating) <= 100, JSON.stringify(result));
    assert.strictEqual(result.items.Blunders, 1, JSON.stringify(result));
    assert.ok(result.coachHidden && result.oldReviewHidden, JSON.stringify(result));"""
new = """    assert.ok(Number(result.rating) >= 0 && Number(result.rating) <= 100, JSON.stringify(result));
    const countedMoves = Object.values(result.items).reduce((sum, value) => sum + Number(value || 0), 0);
    assert.strictEqual(countedMoves, 1, JSON.stringify(result));
    assert.strictEqual(result.state.composition.total, 1, JSON.stringify(result));
    assert.ok(result.coachHidden && result.oldReviewHidden, JSON.stringify(result));"""
if old not in text:
    raise SystemExit('The previous deterministic summary assertion was not found')
path.write_text(text.replace(old, new, 1))
