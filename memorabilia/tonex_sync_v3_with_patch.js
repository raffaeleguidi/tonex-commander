const { SerialPort } = require('serialport');
const easymidi = require('easymidi');

const SERIAL_PATH = '/dev/tty.usbmodem14301';
const MIDI_NAME = 'ToneX';

const port = new SerialPort({ path: SERIAL_PATH, baudRate: 115200 });
const midiInput = new easymidi.Input(MIDI_NAME);

// Stato per gestire il superamento del limite 127
let currentBankOffset = 0; 
let currentPatch = { bank: "00", letter: "A", name: "In attesa..." };

console.log("\x1b[1m" + "=".repeat(50));
console.log("   TONEX HYBRID MONITOR (FIX 49C)");
console.log("=".repeat(50) + "\x1b[0m");

// --- GESTIONE MIDI ---

// Monitoriamo il Bank Select (CC 0) per sapere se siamo sopra il preset 127
midiInput.on('cc', (msg) => {
    if (msg.controller === 0) {
        // Se il valore è 1, siamo nel blocco dei preset 128-149
        currentBankOffset = (msg.value > 0) ? 128 : 0;
    }
});

midiInput.on('program', (msg) => {
    // Indice lineare reale: (0 o 128) + (0-127)
    const linearIndex = currentBankOffset + msg.number;
    
    const bankNum = Math.floor(linearIndex / 3);
    const patchLetter = ['A', 'B', 'C'][linearIndex % 3];
    
    currentPatch.bank = bankNum.toString().padStart(2, '0');
    currentPatch.letter = patchLetter;

    console.log(`\n\x1b[42m\x1b[30m PATCH: ${currentPatch.bank}${currentPatch.letter} \x1b[0m (Linear ID: ${linearIndex})`);
});

// --- GESTIONE SERIALE ---
let buffer = Buffer.alloc(0);
let timer = null;

port.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    clearTimeout(timer);
    timer = setTimeout(() => {
        if (buffer.length >= 2219) handleFullPreset(buffer);
        buffer = Buffer.alloc(0);
    }, 60);
});

function handleFullPreset(buf) {
    const name = buf.toString('ascii', 21, 50).replace(/[^\x20-\x7E]/g, '').trim();
    const modOn = buf.readFloatLE(392) > 0.5;
    const dlyOn = buf.readFloatLE(547) > 0.5;

    console.log(`\x1b[1m${currentPatch.bank}${currentPatch.letter} - ${name}\x1b[0m`);
    console.log(`├─ MOD: ${modOn ? '🔴 ON' : '⚪ OFF'}`);
    console.log(`└─ DLY: ${dlyOn ? '🔵 ON' : '⚪ OFF'}`);
    
    // Lista offset ON per mapping
    const onOffsets = [];
    for (let i = 50; i < 2000; i++) {
        if (buf[i] === 0x00 && buf[i+1] === 0x00 && buf[i+2] === 0x80 && buf[i+3] === 0x3F) {
            onOffsets.push(i);
        }
    }
    console.log(`\x1b[2mOffsets ON: ${onOffsets.join(', ')}\x1b[0m`);
}

port.on('open', () => console.log(`✅ Seriale: ${SERIAL_PATH}`));