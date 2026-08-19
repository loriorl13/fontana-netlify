// ============================================================
// Fontana Danzante - Netlify Serverless Function
// Genera coreografia da beats audio e la carica sull'ESP32
// ============================================================

const FONTANA_URL = 'https://fontana.fontanabyloriorl.it';

// ── Layout DynamicEvent (28 byte packed) ──────────────────────
// Struct C++ su ESP32:
//   typedef struct __attribute__((packed)) {
//     uint32_t taskId; uint16_t duration; int command; int value;
//     int data; uint8_t r, g, b, brightness, speed;
//   } WebCommand; // 23 byte
//
//   typedef struct __attribute__((packed)) {
//     uint32_t timestampMs; uint8_t target; WebCommand cmd;
//   } DynamicEvent; // 28 byte totali
// ─────────────────────────────────────────────────────────────

function createDynamicEvent(timeMs, target, command, value = 0, data = 0, duration = 0, r = 0, g = 0, b = 0, bright = 255, speed = 100) {
  const buf = Buffer.alloc(28);
  buf.writeUInt32LE(timeMs, 0);     // timestampMs
  buf.writeUInt8(target, 4);        // target: 0=Logic(pompe), 1=LED
  buf.writeUInt32LE(0, 5);          // taskId = 0
  buf.writeUInt16LE(duration, 9);   // duration
  buf.writeInt32LE(command, 11);    // command (numero pompa 1-11, o speciale)
  buf.writeInt32LE(value, 15);      // value (0-100)
  buf.writeInt32LE(data, 19);       // data
  buf.writeUInt8(r, 23);
  buf.writeUInt8(g, 24);
  buf.writeUInt8(b, 25);
  buf.writeUInt8(bright, 26);
  buf.writeUInt8(speed, 27);
  return buf;
}

// Palette di colori vivaci per i LED
const LED_COLORS = [
  [255, 0, 100],    // Rosa
  [0, 200, 255],    // Azzurro
  [150, 0, 255],    // Viola
  [255, 200, 0],    // Giallo oro
  [0, 255, 120],    // Verde acqua
  [255, 80, 0],     // Arancio
  [255, 255, 255],  // Bianco
  [0, 100, 255],    // Blu elettrico
];

function generateChoreography(beats) {
  const events = [];

  beats.forEach((timeSec, index) => {
    const tMs = Math.floor(timeSec * 1000);

    // ── Pattern pompe a rotazione ──────────────────────────────
    let pumps;
    const pattern = index % 8;
    if      (pattern === 0) pumps = [1, 5, 11];   // Forte: centro + estreme
    else if (pattern === 1) pumps = [2, 6, 10];   // 
    else if (pattern === 2) pumps = [3, 5, 9];    // Intermedi
    else if (pattern === 3) pumps = [4, 8];        //
    else if (pattern === 4) pumps = [1, 3, 7, 11]; // Allargato
    else if (pattern === 5) pumps = [5, 6];        // Centro
    else if (pattern === 6) pumps = [2, 4, 8, 10]; // Simmetrico
    else                    pumps = [1, 11];        // Estreme

    // Calcola durata ON come funzione del tempo tra beats
    const nextBeatMs = index + 1 < beats.length ? Math.floor(beats[index + 1] * 1000) : tMs + 600;
    const onDuration = Math.min(Math.floor((nextBeatMs - tMs) * 0.55), 500); // max 500ms

    pumps.forEach(p => {
      events.push({ t: tMs, buf: createDynamicEvent(tMs, 0, p, 100) });
      events.push({ t: tMs + onDuration, buf: createDynamicEvent(tMs + onDuration, 0, p, 0) });
    });

    // ── Cambio colore LED ogni 2 battiti ──────────────────────
    if (index % 2 === 0) {
      const [r, g, b] = LED_COLORS[(index / 2) % LED_COLORS.length];
      events.push({ t: tMs, buf: createDynamicEvent(tMs, 1, 1, 0, 0, 0, r, g, b, 255, 100) });
    }
  });

  // Ordina per timestamp
  events.sort((a, b) => a.t - b.t);

  return Buffer.concat(events.map(e => e.buf));
}

async function uploadToEsp32(binaryBuffer) {
  // Costruisce il body multipart form-data manualmente
  const boundary = '----FontanaFormBoundary' + Date.now().toString(16);
  const crlf = '\r\n';

  const header = Buffer.from(
    `--${boundary}${crlf}` +
    `Content-Disposition: form-data; name="file"; filename="dyn_show.bin"${crlf}` +
    `Content-Type: application/octet-stream${crlf}${crlf}`
  );
  const footer = Buffer.from(`${crlf}--${boundary}--${crlf}`);
  const body = Buffer.concat([header, binaryBuffer, footer]);

  const response = await fetch(`${FONTANA_URL}/upload-show`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length.toString(),
    },
    body: body,
  });

  return response;
}

exports.handler = async (event) => {
  // Gestione CORS preflight
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
  }

  try {
    const { beats } = JSON.parse(event.body);

    if (!beats || !Array.isArray(beats) || beats.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: 'Array beats mancante o vuoto' })
      };
    }

    console.log(`Ricevuti ${beats.length} beats, genero coreografia...`);

    // 1. Genera il binario della coreografia
    const binaryBuffer = generateChoreography(beats);
    console.log(`Coreografia generata: ${binaryBuffer.length} byte (${binaryBuffer.length / 28} eventi)`);

    // 2. Carica direttamente sull'ESP32 via Cloudflare (server-to-server, nessun blocco!)
    const uploadResponse = await uploadToEsp32(binaryBuffer);

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`Upload ESP32 fallito: HTTP ${uploadResponse.status} - ${errText}`);
    }

    console.log('Upload completato con successo!');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        events: binaryBuffer.length / 28,
        beats: beats.length,
        sizeBytes: binaryBuffer.length,
      })
    };

  } catch (err) {
    console.error('Errore:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
