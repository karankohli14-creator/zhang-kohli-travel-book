from pathlib import Path

review_path = Path('kmate-trainer/review-v35-3.js')
review = review_path.read_text()

old_filter = """    const candidates = $$('p,small,span', item)
      .filter((node) => !titleElement?.contains(node) && !node.classList.contains('principle-number'))
      .map((node) => node.textContent?.trim() || '').filter(Boolean);"""
new_filter = """    const candidates = $$('p,small,span', item)
      .filter((node) => node !== titleElement && !node.contains(titleElement) && !node.classList.contains('principle-number'))
      .map((node) => node.textContent?.trim() || '').filter(Boolean);"""
if old_filter not in review:
    raise SystemExit('Principle-description extraction marker was not found')
review = review.replace(old_filter, new_filter, 1)

old_rebuild = """    if (title) title.textContent = `${visibleItems.length || 5} principles for this position`;

    visibleItems.forEach((item, index) => {"""
new_rebuild = """    if (title) title.textContent = `${visibleItems.length || 5} principles for this position`;

    // The list observer fires again after the cards are rebuilt. Do not parse
    // and rebuild already-enhanced cards a second time.
    if (visibleItems.length && visibleItems.every((item) => item.classList.contains('principle-focus-card'))) return;

    visibleItems.forEach((item, index) => {"""
if old_rebuild not in review:
    raise SystemExit('Idempotent principle-card marker was not found')
review_path.write_text(review.replace(old_rebuild, new_rebuild, 1))

styles_path = Path('kmate-trainer/styles-v7.css')
styles = styles_path.read_text()
old_description = """#principlesDialog.kmate-principles-v353 .principle-mini-description{
  display:block!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important;
  color:#bac5bb!important;font-size:clamp(10px,1.4vw,13px)!important;line-height:1.15!important;
}"""
new_description = """#principlesDialog.kmate-principles-v353 .principle-mini-description{
  display:none!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important;
  color:#bac5bb!important;font-size:clamp(10px,1.4vw,13px)!important;line-height:1.15!important;
}"""
if old_description not in styles:
    raise SystemExit('Principle-description CSS marker was not found')
styles = styles.replace(old_description, new_description, 1)

old_transition = """  box-shadow:inset 0 2px #ffffff20,inset 0 -5px #0b100c,0 12px 22px #0006!important;
  transform:translateY(0)!important;transition:transform .1s ease,filter .1s ease,box-shadow .1s ease!important;
}"""
new_transition = """  border-bottom:5px solid #0b100c!important;
  box-shadow:inset 0 2px #ffffff32,inset 0 -5px #0b100c,0 12px 22px #0008!important;
  filter:drop-shadow(0 6px 7px rgba(0,0,0,.38))!important;
  transform:translateY(0)!important;transition:transform .1s ease,filter .1s ease!important;
}"""
if old_transition not in styles:
    raise SystemExit('Principle-button depth marker was not found')
styles = styles.replace(old_transition, new_transition, 1)

old_primary = """  box-shadow:inset 0 2px #ffffff85,inset 0 -5px #5d8733,0 14px 26px #91c35b34!important;
}"""
new_primary = """  border-bottom-color:#5d8733!important;
  box-shadow:inset 0 2px #ffffff85,inset 0 -5px #5d8733,0 14px 26px #91c35b44!important;
  filter:drop-shadow(0 7px 8px rgba(94,135,51,.36))!important;
}"""
if old_primary not in styles:
    raise SystemExit('Primary principle-button depth marker was not found')
styles_path.write_text(styles.replace(old_primary, new_primary, 1))
