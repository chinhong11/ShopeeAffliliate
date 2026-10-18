/* draft form (what the review app edits) */
import { pickTemplate, headline, refreshCaptions } from './pick.js';
import { langOf } from './mapping.js';

/* new draft form from a product; `st` = rotation state {prev, rot} (persisted in kv by the caller).
   Captions are filled by withCaptions() once the short link exists. */
export function newForm({ p }, cfg, st) {
  const tpl = pickTemplate(p, st.prev, false);
  st.prev = tpl;
  const lang = langOf(cfg); // the default from config.json; each draft can be switched on the edit page
  const [l1, l2] = headline(p, cfg, st.rot, lang);
  return {
    tpl, autoTpl: tpl, lang, l1, l2, photos: ['img:' + p.img], used: false,
    review: { quote: '', author: '' }, flash: { end: '', pct: '' }, chat: { m1: '', m2: '', m3: '' },
    cap1: '', cap2: '', cap1Manual: false, cap2Manual: false
  };
}

export const withCaptions = (d, cfg) => { refreshCaptions(d, cfg); return d; };
