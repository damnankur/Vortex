'use strict';

/*
 * Vortex demo simulator.
 *
 * A fleet of fake users lives entirely on the server (this container runs
 * alongside the backing store on EC2) and keeps the chat feeling alive:
 * - backfills recent-looking history across every channel at boot, then
 * - drips realistic messages in, with typing bursts and follow-up replies.
 *
 * Messages go through the same path a real browser user uses:
 *   socket.io (JWT) -> server -> Kafka -> consumer -> Postgres -> broadcast.
 *
 * Env:
 *   BACKEND_URL      polled for persona signup + sockets (default http://localhost:5000)
 *   PERSONA_COUNT    how many personas to run (default: all)
 *   MIN_DELAY_MS     min gap between a persona's messages
 *   MAX_DELAY_MS     max gap between a persona's messages
 *   BURST_PROB       chance of a quick follow-up reply after a message (0..1)
 *   BURST_MAX        max follow-ups in a single burst
 *   CHANNEL_BACKFILL messages to seed per channel at boot (0 to disable)
 */

const { randomUUID } = require('crypto');
const { io } = require('socket.io-client');
const PERSONAS = require('./personas');

const env = process.env;
const BACKEND_URL = (env.BACKEND_URL || 'http://localhost:5000').replace(/\/+$/, '');
const PERSONA_COUNT = Math.max(1, Number(env.PERSONA_COUNT) || PERSONAS.length);
const MIN_DELAY_MS = Math.max(2000, Number(env.MIN_DELAY_MS) || 15000);
const MAX_DELAY_MS = Math.max(MIN_DELAY_MS, Number(env.MAX_DELAY_MS) || 90000);
const BURST_PROB = Number(env.BURST_PROB) || 0.35;
const BURST_MAX = Math.max(1, Number(env.BURST_MAX) || 3);
const CHANNEL_BACKFILL = Number(env.CHANNEL_BACKFILL) || 5;

const CHANNELS = ['general', 'gaming', 'music', 'tech', 'watercooler'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const sessions = [];

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function joinPersona(persona) {
  const data = await fetchJson(`${BACKEND_URL}/auth/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: persona.username }),
  });
  return { token: data.token, user: data.user };
}

function connectSession(persona, token) {
  const socket = io(BACKEND_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 5000,
    timeout: 15000,
  });

  socket.on('connect', () => {
    log(`[${persona.username}] connected`);
    socket.emit('channel:join', { slug: persona.room });
  });
  socket.on('connect_error', (err) => {
    log(`[${persona.username}] connect_error: ${err.message}`);
  });

  const session = { persona, socket, room: persona.room };
  sessions.push(session);
  return session;
}

function ensureRoom(session, slug) {
  if (session.room === slug) return;
  session.socket.emit('channel:join', { slug });
  session.room = slug;
}

function sendMessage(session) {
  const text = pick(session.persona.messages);
  session.socket.emit('event: message', { messageId: randomUUID(), text });
  log(`[${session.persona.username}] #${session.room}: ${text}`);
}

async function typeAndSend(session) {
  const started = session.socket.emit('typing:start');
  if (!started) return;
  await sleep(rand(1200, 3500));
  sendMessage(session);
  session.socket.emit('typing:stop');
}

async function backfill() {
  if (CHANNEL_BACKFILL <= 0) return;
  log('backfilling history across channels...');
  for (const slug of CHANNELS) {
    const nearby = sessions.filter((s) => s.persona.room === slug);
    const pool = nearby.length > 0 ? nearby : sessions;
    for (let i = 0; i < CHANNEL_BACKFILL; i++) {
      const session = pick(pool);
      ensureRoom(session, slug);
      await sleep(rand(300, 900));
      const text = pick(session.persona.messages);
      session.socket.emit('event: message', { messageId: randomUUID(), text });
      log(`[backfill] ${session.persona.username} #${slug}: ${text}`);
    }
  }
  for (const session of sessions) ensureRoom(session, session.persona.room);
  log('backfill complete');
}

async function liveTick(session) {
  await typeAndSend(session);

  if (Math.random() < BURST_PROB) {
    const followers = sessions.filter((s) => s.persona.room === session.persona.room);
    const count = rand(1, BURST_MAX);
    for (let i = 0; i < count; i++) {
      await sleep(rand(1500, 4000));
      const speaker = Math.random() < 0.5 ? session : pick(followers);
      ensureRoom(speaker, session.persona.room);
      sendMessage(speaker);
    }
  }
}

async function liveLoop(session) {
  for (;;) {
    await sleep(rand(MIN_DELAY_MS, MAX_DELAY_MS));
    if (!session.socket.connected) continue;
    try {
      await liveTick(session);
    } catch (err) {
      log(`[${session.persona.username}] tick error: ${err.message}`);
    }
  }
}

async function main() {
  log(`Vortex simulator -> ${BACKEND_URL}, ${Math.min(PERSONA_COUNT, PERSONAS.length)} personas`);

  const selected = PERSONAS.slice(0, PERSONA_COUNT);

  // Sign up every persona; retry forever until the backend answers.
  const joined = [];
  while (joined.length < selected.length) {
    for (const persona of selected) {
      if (joined.some((s) => s.persona.username === persona.username)) continue;
      try {
        const auth = await joinPersona(persona);
        joined.push({ persona, token: auth.token, user: auth.user });
        log(`[${persona.username}] signed up (id ${auth.user.id})`);
      } catch (err) {
        log(`[${persona.username}] signup failed (${err.message}), retrying in 15s`);
        await sleep(15000);
      }
    }
  }

  for (const { persona, token } of joined) {
    connectSession(persona, token);
  }

  await sleep(5000); // let sockets establish + join their home channel

  await backfill();
  sessions.forEach((s) => liveLoop(s).catch(() => {}));

  log('all personas active, live loop running');
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal}, disconnecting ${sessions.length} sockets`);
  sessions.forEach((s) => s.socket.disconnect());
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  log('fatal:', err.message);
  process.exit(1);
});