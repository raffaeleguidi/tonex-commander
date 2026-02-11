const { SerialPort } = require('serialport');
const easymidi = require('easymidi');

const SERIAL_PATH = '/dev/tty.usbmodem14301';
const port = new SerialPort({ path: SERIAL_PATH, baudRate: 115200 });
const midiInput = new easymidi.Input('ToneX');

// Offset base (identificati come punti di inizio dei blocchi dati)
const OFFSETS = {
    MODEL_VOL: 177,   
    MOD_SWITCH: 392,
    MOD_TYPE: 397,
    DLY_SWITCH: 547,
    DLY_TYPE: 552 
};

const MOD_TYPES = { 0: "CHORUS", 1: "TREMOLO", 2: "PHASER", 3: "FLANGER", 4: "ROTARY" };
const DLY_TYPES = { 0: "DIGITAL", 1: "TAPE" };

let currentBankOffset = 0;
let currentPatch = { bank: "00", letter: "A" };

// Funzione per leggere i Float saltando i byte di controllo 0x88
function readTonexFloat(buf, offset) {
    try {
        let bytes = [];
        let i = offset;
        while (bytes.length < 4 && i < buf.length) {
            if (buf[i] !== 0x88) bytes.push(buf[i]);
            i++;
        }
        if (bytes.length < 4) return 0;
        return Buffer.from(bytes).readFloatLE(0);
    } catch (e) { return 0; }
}

console.log("\x1b[1m" + "=".repeat(60));
console.log("   TONEX DASHBOARD v14 - FULL SYNC + ON LIST");
console.log("=".repeat(60) + "\x1b[0m");

midiInput.on('cc', (msg) => { if (msg.controller === 0) currentBankOffset = (msg.value > 0) ? 128 : 0; });
midiInput.on('program', (msg) => {
    const idx = currentBankOffset + msg.number;
    currentPatch.bank = Math.floor(idx / 3).toString().padStart(2, '0');
    currentPatch.letter = ['A', 'B', 'C'][idx % 3];
});

let buffer = Buffer.alloc(0);
let timer = null;

port.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    clearTimeout(timer);
    timer = setTimeout(() => {
        if (buffer.length >= 2219) handleFullDump(buffer);
        buffer = Buffer.alloc(0);
    }, 60);
});

function handleFullDump(buf) {
    const name = buf.toString('ascii', 21, 50).replace(/[^\x20-\x7E]/g, '').trim();
    
    // Lettura parametri principali
    const volRaw = readTonexFloat(buf, OFFSETS.MODEL_VOL);
    const modOn = readTonexFloat(buf, OFFSETS.MOD_SWITCH) > 0.5;
    const modTypeId = Math.round(readTonexFloat(buf, OFFSETS.MOD_TYPE));
    const dlyOn = readTonexFloat(buf, OFFSETS.DLY_SWITCH) > 0.5;
    const dlyTypeId = Math.round(readTonexFloat(buf, OFFSETS.DLY_TYPE));

    // UI Volume
    const volLevel = Math.max(0, Math.min(10, Math.round(volRaw)));
    const volBar = "█".repeat(volLevel) + "░".repeat(10 - volLevel);

    console.log(`\n\x1b[44m\x1b[37m ${currentPatch.bank}${currentPatch.letter} \x1b[0m \x1b[1m ${name} \x1b[0m`);
    console.log(`\x1b[1mVOL:\x1b[0m   [${volBar}] \x1b[32m${volRaw.toFixed(1)}\x1b[0m`);
    console.log(`├─ MOD:    ${modOn ? '\x1b[32mON \x1b[0m' : '\x1b[31mOFF\x1b[0m'} [\x1b[33m${MOD_TYPES[modTypeId] || 'MOD'}\x1b[0m]`);
    console.log(`└─ DELAY:  ${dlyOn ? '\x1b[32mON \x1b[0m' : '\x1b[31mOFF\x1b[0m'} [\x1b[36m${DLY_TYPES[dlyTypeId] || 'DLY'}\x1b[0m]`);

    // --- SCANSIONE OFFSET ATTIVI (1.0) ---
    const activeOffsets = [];
    // Scansione per cercare il pattern Float 1.0 (00 00 80 3F)
    // Consideriamo che i byte potrebbero essere separati da un 0x88
    for (let i = 50; i < buf.length - 6; i++) {
        if (readTonexFloat(buf, i) === 1.0) {
            // Escludiamo MOD e DELAY switch che già mostriamo sopra
            if (![OFFSETS.MOD_SWITCH, OFFSETS.DLY_SWITCH].includes(i)) {
                // Evitiamo duplicati se l'offset viene rilevato più volte a causa dello shift
                if (!activeOffsets.some(off => Math.abs(off - i) < 2)) {
                    activeOffsets.push(i);
                }
            }
        }
    }

    if (activeOffsets.length > 0) {
        console.log(`\x1b[90mAltri parametri ON (1.0): ${activeOffsets.sort((a, b) => a - b).join(', ')}\x1b[0m`);
    }

    console.log("\x1b[90m" + "-".repeat(60) + "\x1b[0m");
}

port.on('open', () => console.log(`\x1b[32m✅ Sistema pronto.\x1b[0m`));