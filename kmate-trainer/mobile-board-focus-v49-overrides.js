(() => {
  const id = 'kmateBoardFocusV49SpecificityFix';
  if (document.querySelector(`#${id}`)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    html.kmate-game-ux-v48 body.km49-compact-game.game-mode #gameCoachAudioButton{
      display:grid!important;
    }
    html.kmate-game-ux-v48 body.km49-compact-game.game-mode #positionTitle,
    html.kmate-game-ux-v48 body.km49-compact-game.game-mode #gameMeta,
    html.kmate-game-ux-v48 body.km49-compact-game.game-mode .playtop .left>div,
    html.kmate-game-ux-v48 body.km49-compact-game.game-mode #hintCard{
      display:none!important;
    }
    html.kmate-game-ux-v48 body.km49-compact-game.game-mode.km49-hint-open #hintCard{
      display:block!important;
    }
  `;
  document.head.append(style);
  window.__KMATE_BOARD_FOCUS_V49_OVERRIDES__ = { ready: true, version: '49.0.1' };
})();
