(() => {
  "use strict";
  const screen = document.querySelector("#screen");
  if (!screen) return;
  let queued = false;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function home() {
    const hero = screen.querySelector(".hc-home");
    if (!hero || hero.dataset.hcMax === "1") return;
    hero.dataset.hcMax = "1";
    const h1 = hero.querySelector("h1"), lede = hero.querySelector(".lede"), proof = hero.querySelector(".hc-home-proofline"), buttons = hero.querySelector(".button-row"), cases = hero.querySelector(".hc-use-cases"), story = hero.querySelector(".hc-home-story");
    if (!h1 || !lede || !story) return;
    const stage = el("div", "hc-max-home-stage");
    const copy = el("div", "hc-max-home-copy");
    const storyWrap = el("div", "hc-max-home-story");
    const wordmark = el("div", "hc-max-wordmark");
    const mark = document.createElement("img"); mark.src = "/nimcarry-mark.svg"; mark.alt = ""; mark.setAttribute("aria-hidden","true");
    const wmText = el("span"); wmText.append(el("strong","","NimCarry"), el("small","","Real people · one destination")); wordmark.append(mark,wmText);
    const values = el("div", "hc-max-value-strip");
    [["Real people","Relationships move the introduction."],["One destination","Every route exists for one intended person."],["FINAL only","The route changes only when custody is independently verified."]].forEach(([a,b])=>{const v=el("div","hc-max-value");v.append(el("strong","",a),el("span","",b));values.append(v);});
    copy.append(wordmark,h1,lede);
    if (proof) copy.append(proof); if (buttons) copy.append(buttons); if (cases) copy.append(cases); copy.append(values);
    storyWrap.append(story);
    stage.append(copy,storyWrap);
    hero.append(stage);
  }

  function createMission() {
    const card = screen.querySelector('.hc-create-layout .form-card');
    if (!card || card.querySelector('.hc-max-dossier-label')) return;
    const label = el('div','hc-max-dossier-label');
    label.append(el('b','', 'Mission dossier'), el('span','', 'private · destination-bound'));
    const grid = card.querySelector('.form-grid');
    (grid || card.firstElementChild || card).before(label);
  }

  function invitation() {
    const hero = screen.querySelector('.hc-invitation');
    if (!hero || hero.querySelector('.hc-max-envelope-kicker')) return;
    const kicker = el('div','hc-max-envelope-kicker','private human handoff');
    const first = hero.querySelector('.kicker');
    if (first) first.before(kicker); else hero.prepend(kicker);
  }

  function pass() {
    const hero = screen.querySelector('.hc-pass');
    if (!hero || hero.querySelector('.hc-max-ritual-note')) return;
    const note = el('p','hc-max-ritual-note','The human outcome is the reason for the route. The 1 NIM transfer is only the verifiable baton that records who carries it next.');
    const ritual = hero.querySelector('.hc-pass-ritual');
    (ritual || hero).after(note);
  }

  function route() {
    const card = screen.querySelector('.route-card');
    if (!card || card.querySelector('.hc-max-route-motto')) return;
    const status = card.querySelector('.status-pill')?.textContent || '';
    const motto = el('p','hc-max-route-motto', /ARRIVED/i.test(status) ? 'Human to human. The introduction made it.' : 'Different people. One destination. One verified path.');
    const heading = card.querySelector('.hc-route-heading');
    (heading || card.querySelector('.split') || card).after(motto);
  }

  function stripResidualExperimentChrome() {
    screen.querySelectorAll('.tw-orbit,.tw-thesis-line,.tw-route-instrument,.mp-audience,.mp-use-cases').forEach(n=>n.remove());
  }

  function apply(){ queued=false; stripResidualExperimentChrome(); home(); createMission(); invitation(); pass(); route(); }
  function schedule(){ if(queued) return; queued=true; requestAnimationFrame(apply); }
  new MutationObserver(schedule).observe(screen,{childList:true,subtree:true});
  addEventListener('popstate',schedule); schedule();
})();
