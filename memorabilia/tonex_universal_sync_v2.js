const { SerialPort } = require('serialport');

const SERIAL_PATH = '/dev/tty.usbmodem14301';

const port = new SerialPort({ 
    path: SERIAL_PATH, 
    baudRate: 115200 
});

// Costanti di mappatura
const PRESET_MOD_OFFSET = 392;   
const PRESET_DLY_OFFSET = 547;   
const DELTA_PARAM_ID_OFFSET = 12; 
const DELTA_VALUE_OFFSET = 14;    
const MOD_PARAM_ID = 0x40;        

console.log("\x1b[1m" + "=".repeat(50));
console.log("   TONEX SYNC & AUTO-MAPPER v3");
console.log("=".repeat(50) + "\x1b[0m");

let buffer = Buffer.alloc(0);
let timer = null;

port.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    clearTimeout(timer);
    
    timer = setTimeout(() => {
        if (buffer.length === 21) {
            handleDeltaUpdate(buffer);
        } else if (buffer.length >= 2219) {
            handleFullPreset(buffer);
        }
        buffer = Buffer.alloc(0);
    }, 60); 
});

/**
 * Gestione aggiornamenti singoli parametri (Realtime)
 */
function handleDeltaUpdate(buf) {
    const paramId = buf[DELTA_PARAM_ID_OFFSET];
    const val = buf.readFloatLE(DELTA_VALUE_OFFSET);
    const isOn = val > 0.5;

    if (paramId === MOD_PARAM_ID) {
        console.log(`\x1b[95m[RT]\x1b[0m Modulo \x1b[1mMOD\x1b[0m -> ${isOn ? '🔴 ON' : '⚪ OFF'}`);
    } else {
        console.log(`\x1b[90m[RT]\x1b[0m ID 0x${paramId.toString(16).toUpperCase().padStart(2, '0')} -> Val: ${val.toFixed(2)}`);
    }
}

/**
 * Gestione dump preset (Cambio Preset)
 */
function handleFullPreset(buf) {
    const name = buf.toString('ascii', 21, 50).replace(/[^\x20-\x7E]/g, '').trim();
    const modVal = buf.readFloatLE(PRESET_MOD_OFFSET);
    const dlyVal = buf.readFloatLE(PRESET_DLY_OFFSET);
    const isModOn = modVal > 0.5;

    console.log(`\n\x1b[44m PRESET: ${name} \x1b[0m`);
    console.log(`\x1b[1mMOD Status:\x1b[0m ${isModOn ? '\x1b[32mON\x1b[0m' : '\x1b[31mOFF\x1b[0m'}`);
    console.log(`\x1b[1mDLY Status:\x1b[0m ${dlyVal ? '\x1b[32mON\x1b[0m' : '\x1b[31mOFF\x1b[0m'}`);

    // --- SCANSIONE AUTOMATICA OFFSET "ON" ---
    const onOffsets = [];
    // Partiamo dall'offset 50 per saltare l'header e il nome
    for (let i = 50; i < buf.length - 4; i++) {
        // Cerchiamo la sequenza hex per 1.0 Float32 LE
        if (buf[i] === 0x00 && buf[i+1] === 0x00 && buf[i+2] === 0x80 && buf[i+3] === 0x3F) {
            onOffsets.push(i);
        }
    }

    console.log(`\x1b[1mOFFSETS ATTIVI (Valore 1.0):\x1b[0m`);
    if (onOffsets.length > 0) {
        let output = "";
        onOffsets.forEach((off, idx) => {
            const hexOff = `0x${off.toString(16).toUpperCase()}`;
            output += `\x1b[32m${off}\x1b[0m (${hexOff})`.padEnd(16);
            if ((idx + 1) % 6 === 0) {
                console.log("  " + output);
                output = "";
            }
        });
        if (output) console.log("  " + output);
    } else {
        console.log("  Nessuno");
    }
    console.log("-".repeat(50));
}

port.on('open', () => console.log(`\x1b[32m✅ Connesso a ${SERIAL_PATH}\x1b[0m\n`));
port.on('error', (err) => console.error("\x1b[31m❌ Errore:\x1b[0m", err.message));