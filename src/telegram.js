/* optional Telegram (README Step 7): posters after collect with ✅ 批准 / ❌ 跳过 / ✏️ 编辑,
   callbacks via webhook /telegram/{TELEGRAM_WEBHOOK_SECRET}, post / token reports */
import fs from 'node:fs';
import express from 'express';
import { env, loadConfig } from './config.js';
import { drafts } from './db.js';
import { rm, STRATS, shortName } from './mapping.js';
import { thumbFile, posterFile } from './render.js';
import * as svc from './service.js';

const API = () => `${process.env.TELEGRAM_API_BASE || 'https://api.telegram.org'}/bot${env.TELEGRAM_BOT_TOKEN}`;
export const enabled = () => !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
const secretOk = () => /^[A-Za-z0-9_-]{16,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET || '');

async function call(method, params, file) {
  let body;
  if (file) {
    body = new FormData();
    for (const [k, v] of Object.entries(params)) body.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    body.append(file.field, new Blob([file.buf], { type: file.type }), file.name);
  }
  const res = await fetch(`${API()}/${method}`, file ? { method: 'POST', body } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || res.status}`);
  return j.result;
}
export const send = text => enabled() ? call('sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }).catch(e => console.error(e.message)) : null;

const keyboard = id => ({
  inline_keyboard: [[
    { text: '✅ 批准', callback_data: 'ap:' + id },
    { text: '❌ 跳过', callback_data: 'sk:' + id },
    ...(env.PUBLIC_URL.startsWith('https://') ? [{ text: '✏️ 编辑', url: `${env.PUBLIC_URL}/d/${id}` }] : [])
  ]]
});
const captionOf = d => `${shortName(d.p.name)} · ${rm(d.p.price)} · ${STRATS[d.strat].zh}`;

/* after collect: each poster with buttons */
export async function sendDrafts(list) {
  if (!enabled()) return;
  for (const d0 of list) {
    const d = drafts.get(d0.id);
    if (!d || d.status !== 'draft') continue;
    const f = fs.existsSync(thumbFile(d.id)) ? thumbFile(d.id) : posterFile(d.id);
    try {
      if (!fs.existsSync(f)) { await call('sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text: captionOf(d) + '\n（海报没生成出来）', reply_markup: keyboard(d.id) }); continue; }
      await call('sendPhoto', { chat_id: env.TELEGRAM_CHAT_ID, caption: captionOf(d), reply_markup: keyboard(d.id) },
        { field: 'photo', buf: fs.readFileSync(f), name: d.id + '.jpg', type: f.endsWith('.png') ? 'image/png' : 'image/jpeg' });
    } catch (e) { console.error('telegram sendPhoto', d.id, e.message); }
  }
}

/* webhook: only from Telegram (secret path + header) and only our chat */
export const router = express.Router();
router.post('/telegram/:secret', express.json({ limit: '1mb' }), async (req, res) => {
  if (!enabled() || !secretOk() || req.params.secret !== env.TELEGRAM_WEBHOOK_SECRET
    || req.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) return res.status(404).end();
  res.json({ ok: true }); // ack fast; Telegram retries otherwise
  const q = req.body && req.body.callback_query;
  if (!q || !q.message || String(q.message.chat.id) !== String(env.TELEGRAM_CHAT_ID)) return;
  const [act, id] = String(q.data || '').split(':');
  let text;
  try {
    if (act === 'ap') { const r = await svc.approve(id); text = r.again ? '已经批准过了' : '✅ 已批准 · ' + (r.slot ? r.slot.text + ' 发布' : '等空位'); }
    else if (act === 'sk') { const d = drafts.get(id); if (!d || d.status !== 'draft') throw new Error('这张草稿已经处理过了'); svc.skip(id); text = '❌ 已跳过'; }
    else return;
  } catch (e) { text = '⚠️ ' + e.message; }
  await call('answerCallbackQuery', { callback_query_id: q.id, text }).catch(() => {});
  if (!text.startsWith('⚠️')) {
    const d = drafts.get(id);
    const p = { chat_id: q.message.chat.id, message_id: q.message.message_id };
    const cap = (d ? captionOf(d) : '') + '\n' + text;
    await (q.message.photo ? call('editMessageCaption', { ...p, caption: cap }) : call('editMessageText', { ...p, text: cap })).catch(() => {});
  }
});

export async function setWebhook() {
  if (!enabled()) return;
  if (!env.PUBLIC_URL.startsWith('https://') || !secretOk()) {
    console.warn('telegram: buttons need PUBLIC_URL (https) and TELEGRAM_WEBHOOK_SECRET (16+ letters/digits/_-); sending without callbacks');
    return;
  }
  await call('setWebhook', { url: `${env.PUBLIC_URL}/telegram/${env.TELEGRAM_WEBHOOK_SECRET}`, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['callback_query'] })
    .then(() => console.log('telegram webhook set'), e => console.error(e.message));
}

/* reports: collect → posters, post success / failure / returned, token problems */
export function init({ onCollected, onPublishEvent, onPause }) {
  if (!enabled()) return false;
  onCollected(r => sendDrafts(r.drafts).then(() => r.created ? null : send('今天没有抓到新品（都发过了或不达标）')));
  onPublishEvent((type, { d, permalink, message, note }) => {
    const n = shortName(d.p.name);
    if (type === 'posted') send(`✅ 已发布：${n}\n${permalink || ''}${note ? '\n⚠️ ' + note : ''}`);
    if (type === 'failed') send(`❌ 发帖失败：${n}\n${message}\n${env.PUBLIC_URL ? env.PUBLIC_URL + '/log' : ''}`);
    if (type === 'returned') send(`↩️ 没有发：${n}\n${message}`);
  });
  onPause(p => send(`🛑 发布已暂停\n${p.message}${env.PUBLIC_URL ? '\n' + env.PUBLIC_URL : ''}`));
  setWebhook();
  return true;
}
