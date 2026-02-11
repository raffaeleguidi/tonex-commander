const { SerialPort } = require('serialport');
const easymidi = require('easymidi');

const SERIAL_PATH = '/dev/tty.usbmodem14301';
const port = new SerialPort({ path: SERIAL_PATH, baudRate: 115200 });
const midiInput = new easymidi.Input('ToneX');

// MAPPA DEFINITIVA OFFSET VALIDATI
const OFFSETS = {
    GATE_SWITCH: 73,   
    COMP_SWITCH: 101,
    BASS_VAL: 126,     
    MID_VAL: 136,      
    TREBLE_VAL: 151,   
    GAIN_VAL: 171,     
    MODEL_VOL: 177,   
    REV_SWITCH: 261,   
    REV_TYPE: 261,     
    MOD_SWITCH: 392,
    MOD_TYPE: 397,
    DLY_SWITCH: 547,
    DLY_TYPE: 552
};

const MOD_TYPES = { 0: "CHORUS", 1: "TREMOLO", 2: "PHASER", 3: "FLANGER", 4: "ROTARY" };
const DLY_TYPES = { 0: "DIGITAL", 1: "TAPE" };
const REV_TYPES = { 0: "SPRING 1", 1: "SPRING 2", 2: "SPRING 3", 3: "SPRING 4", 4: "ROOM", 5: "PLATE" };

let currentBankOffset = 0;
let currentPatch = { bank: "00", letter: "A" };

function readTonexFloat(buf, offset) {
    try {
        let bytes = [];
        let i = offset;
        while (bytes.length < 4 && i < buf.length) {
            if (buf[i] !== 0x88) bytes.push(buf[i]);
            i++;
        }
        return bytes.length === 4 ? Buffer.from(bytes).readFloatLE(0) : 0;
    } catch (e) { return 0; }
}

function createBar(val, color = "\x1b[32m") {
    const level = Math.max(0, Math.min(10, Math.round(val)));
    const bar = "█".repeat(level) + "░".repeat(10 - level);
    return `[${bar}] ${color}${val.toFixed(1)}\x1b[0m`;
}

console.log("\x1b[1m" + "=".repeat(60));
console.log("   TONEX MASTER DASHBOARD v46 - FULL SIGNAL CHAIN");
console.log("=".repeat(60) + "\x1b[0m");

// --- MIDI SYNC ---
midiInput.on('cc', (msg) => { if (msg.controller === 0) currentBankOffset = (msg.value > 0) ? 128 : 0; });
midiInput.on('program', (msg) => {
    const idx = currentBankOffset + msg.number;
    currentPatch.bank = Math.floor(idx / 3).toString().padStart(2, '0');
    currentPatch.letter = ['A', 'B', 'C'][idx % 3];
});

// --- SERIAL DUMP ---
let buffer = Buffer.alloc(0);
port.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    clearTimeout(this.t);
    this.t = setTimeout(() => {
        if (buffer.length >= 2219) handleFullDump(buffer);
        buffer = Buffer.alloc(0);
    }, 60);
});

function handleFullDump(buf) {
    const name = buf.toString('ascii', 21, 50).replace(/[^\x20-\x7E]/g, '').trim();
    
    // Status Logic
    const gateOn = readTonexFloat(buf, OFFSETS.GATE_SWITCH) > 0.5;
    const compOn = readTonexFloat(buf, OFFSETS.COMP_SWITCH) > 0.5;
    const modOn  = readTonexFloat(buf, OFFSETS.MOD_SWITCH) > 0.5;
    const modTypeId = Math.round(readTonexFloat(buf, OFFSETS.MOD_TYPE));
    const dlyOn  = readTonexFloat(buf, OFFSETS.DLY_SWITCH) > 0.5;
    const dlyTypeId = Math.round(readTonexFloat(buf, OFFSETS.DLY_TYPE));
    const revVal = readTonexFloat(buf, OFFSETS.REV_SWITCH);
    const revOn  = revVal > -1 && buf[261] !== 0x00;
    const revTypeId = Math.round(revVal);

    // Tone Stack & Drive
    const gain = readTonexFloat(buf, OFFSETS.GAIN_VAL);
    const bass = readTonexFloat(buf, OFFSETS.BASS_VAL);
    const mid  = readTonexFloat(buf, OFFSETS.MID_VAL);
    const treb = readTonexFloat(buf, OFFSETS.TREBLE_VAL);
    const vol  = readTonexFloat(buf, OFFSETS.MODEL_VOL);

    // --- INTERFACCIA ---
    console.log(`\n\x1b[44m\x1b[37m ${currentPatch.bank}${currentPatch.letter} \x1b[0m \x1b[1m ${name} \x1b[0m`);
    
    const fxLine = [
        `GATE: ${gateOn?'🟢':'⚪'}`,
        `COMP: ${compOn?'🟢':'⚪'}`,
        `MOD: ${modOn?'🟢':'⚪'} [\x1b[33m${MOD_TYPES[modTypeId]||'MOD'}\x1b[0m]`,
        `DLY: ${dlyOn?'🟢':'⚪'} [\x1b[36m${DLY_TYPES[dlyTypeId]||'DLY'}\x1b[0m]`,
        `REV: ${revOn?'🔵':'⚪'} [\x1b[35m${REV_TYPES[revTypeId]||'REV'}\x1b[0m]`
    ].join(' | ');
    console.log(fxLine);
    
    console.log(`\n\x1b[1mGAIN:\x1b[0m ${createBar(gain, "\x1b[33m")}`);
    console.log(`\x1b[1mBASS:\x1b[0m ${createBar(bass)}`);
    console.log(`\x1b[1mMID: \x1b[0m ${createBar(mid)}`);
    console.log(`\x1b[1mTREB:\x1b[0m ${createBar(treb)}`);
    console.log(`\x1b[1mVOL: \x1b[0m ${createBar(vol, "\x1b[32m")}`);
    console.log("\x1b[90m" + "-".repeat(60) + "\x1b[0m");
}

port.on('open', () => console.log(`\x1b[32m✅ Master Dashboard v46 Attiva.\x1b[0m`));