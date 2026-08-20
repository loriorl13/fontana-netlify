const https = require('https');
const http  = require('http');
const { URL } = require('url');

const FONTANA_URL = 'https://fontana.fontanabyloriorl.it';

// ── Layout DynamicEvent (28 byte packed) ─────────────────────
// Struct C++ identica alla struct su ESP32:
//   typedef struct __attribute__((packed)) {
//     uint32_t taskId; uint16_t duration; int command;
//     int value; int data; uint8_t r, g, b, brightness, speed;
//   } WebCommand; // 23 byte
//   typedef struct __attribute__((packed)) {
//     uint32_t timestampMs; uint8_t target; WebCommand cmd;
//   } DynamicEvent; // 28 byte totali
// ─────────────────────────────────────────────────────────────

function mkEvent(timeMs, target, command, value = 0, data = 0, duration = 0, r = 0, g = 0, b = 0, bright = 255, speed = 100) {
  const buf = Buffer.alloc(28);
  buf.writeUInt32LE(timeMs,    0);  // timestampMs
  buf.writeUInt8(target,       4);  // 0=Logic(pompe), 1=LED
  buf.writeUInt32LE(0,         5);  // taskId = 0
  buf.writeUInt16LE(duration,  9);  // duration ms
  buf.writeInt32LE(command,   11);  // numero pompa (1-11) o LED cmd
  buf.writeInt32LE(value,     15);  // velocità/intensità (0-100)
  buf.writeInt32LE(data,      19);  // dati extra
  buf.writeUInt8(r,           23);
  buf.writeUInt8(g,           24);
  buf.writeUInt8(b,           25);
  buf.writeUInt8(bright,      26);
  buf.writeUInt8(speed,       27);
  return buf;
}

// Palette colori LED curati
const PALETTE = [
  [255,   0, 120],  // Rosa acceso
  [  0, 200, 255],  // Azzurro
  [160,   0, 255],  // Viola
  [255, 210,   0],  // Oro
  [  0, 255, 130],  // Verde acqua
  [255,  80,   0],  // Arancio
  [255, 255, 255],  // Bianco flash
  [  0, 100, 255],  // Blu elettrico
  [255,   0, 200],  // Magenta
  [120, 255,   0],  // Verde lime
];

// Pattern pompe a 8 varianti per creare dinamicità
const PUMP_PATTERNS = [
  [1, 5, 11],      // centro + estreme (forte)
  [3, 7, 9],       // simmetrico interno
  [1, 3, 9, 11],   // angoli
  [5, 6],          // centro esatto
  [2, 6, 10],      // asse centrale
  [1, 4, 8, 11],   // diagonale
  [2, 5, 9],       // misti
  [3, 5, 7, 10],   // apertura
];

function generateChoreography(beats, duration) {
  const events = [];
  const usedPumps = new Set();
  let pumpCount = 0;
  let ledCount  = 0;

  beats.forEach((timeSec, idx) => {
    const tMs = Math.floor(timeSec * 1000);

    // Calcola durata ON adattiva (55% dell'intervallo beat, max 450ms)
    const nextBeat = beats[idx + 1] ? Math.floor(beats[idx + 1] * 1000) : tMs + 600;
    const onMs = Math.min(Math.floor((nextBeat - tMs) * 0.55), 450);

    // ── Scegli pattern pompe ────────────────────────────────
    const patternIdx = idx % PUMP_PATTERNS.length;
    const pumps = PUMP_PATTERNS[patternIdx];

    pumps.forEach(p => {
      usedPumps.add(p);
      events.push({ t: tMs,       buf: mkEvent(tMs,       0, p, 100) });  // ON
      events.push({ t: tMs + onMs, buf: mkEvent(tMs + onMs, 0, p, 0)  });  // OFF
      pumpCount++;
    });

    // ── LED: cambio colore ogni beat ────────────────────────
    const [r, g, b] = PALETTE[idx % PALETTE.length];

    // Ogni 4 beats: flash bianco d'impatto
    if (idx % 4 === 0) {
      events.push({ t: tMs,     buf: mkEvent(tMs,     1, 1, 0, 0, 0, 255, 255, 255, 255, 255) });
      events.push({ t: tMs + 80, buf: mkEvent(tMs + 80, 1, 1, 0, 0, 0, r, g, b, 220, 100) });
    } else {
      events.push({ t: tMs, buf: mkEvent(tMs, 1, 1, 0, 0, 0, r, g, b, 200, 100) });
    }
    ledCount++;
  });

  // Evento finale: spegni tutto
  const endMs = Math.floor(duration * 1000) + 500;
  for (let p = 1; p <= 11; p++) {
    events.push({ t: endMs, buf: mkEvent(endMs, 0, p, 0) });
  }
  events.push({ t: endMs, buf: mkEvent(endMs, 1, -1, 0, 0, 0, 0, 0, 0, 0) }); // LED OFF

  // Ordina per timestamp
  events.sort((a, b) => a.t - b.t);
  const binary = Buffer.concat(events.map(e => e.buf));

  return { binary, pumpCount, ledCount, usedPumps: [...usedPumps], totalEvents: events.length };
}

function uploadToEsp32(binaryBuffer) {
  return new Promise((resolve, reject) => {
    const boundary = `----FontanaShow${Date.now().toString(16)}`;
    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="dyn_show.bin"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body   = Buffer.concat([header, binaryBuffer, footer]);

    const parsed = new URL(`${FONTANA_URL}/upload-show`);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data }));
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout upload ESP32')); });
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  try {
    const { beats, duration } = JSON.parse(event.body);

    if (!Array.isArray(beats) || beats.length === 0) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Beats mancanti' }) };
    }

    console.log(`[Fontana] ${beats.length} beats, durata ${duration?.toFixed(1)}s — genero coreografia...`);

    // 1. Genera il file binario con entrambe le coreografie (pompe + LED)
    const { binary, pumpCount, ledCount, usedPumps, totalEvents } = generateChoreography(beats, duration || beats[beats.length - 1] + 2);

    console.log(`[Fontana] ${totalEvents} eventi totali, ${binary.length} byte — upload su ESP32...`);

    // 2. Carica sull'ESP32 server-to-server (bypassa completamente Cloudflare!)
    let uploadOk = false;
    let uploadError = null;
    try {
      const upRes = await uploadToEsp32(binary);
      uploadOk = upRes.ok;
      if (!upRes.ok) uploadError = `HTTP ${upRes.status}`;
    } catch (e) {
      uploadError = e.message;
    }

    console.log(`[Fontana] Upload: ${uploadOk ? 'OK' : 'ERRORE - ' + uploadError}`);

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        ok: true,
        uploadOk,
        uploadError,
        totalEvents,
        pumpEvents: pumpCount,
        ledEvents:  ledCount,
        usedPumps,
        sizeBytes:  binary.length,
        beats:      beats.length,
      })
    };

  } catch (err) {
    console.error('[Fontana] Errore:', err);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
