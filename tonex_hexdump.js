const { SerialPort } = require('serialport');
const easymidi = require('easymidi');

const SERIAL_PATH = '/dev/tty.usbmodem14301';
const MIDI_NAME = 'ToneX';

const port = new SerialPort({ path: SERIAL_PATH, baudRate: 115200 });

// Tavolozza colori ANSI per i dati
const COLORS = [
    '\x1b[32m', '\x1b[33m', '\x1b[34m', '\x1b[35m', '\x1b[36m', 
    '\x1b[91m', '\x1b[92m', '\x1b[93m', '\x1b[94m', '\x1b[95m', '\x1b[96m'
];
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const DARK_GRAY = '\x1b[90m'; // Grigio scuro per i separatori 88

// Setup MIDI
const inputs = easymidi.getInputs();
const tonexMidi = inputs.find(n => n.toLowerCase().includes(MIDI_NAME.toLowerCase()));
let midiIn = tonexMidi ? new easymidi.Input(tonexMidi) : null;

if (midiIn) {
    midiIn.on('message', (msg) => {
        console.log(`\n\x1b[45m MIDI EVENT \x1b[0m ${JSON.stringify(msg)}`);
    });
}

let serialBuffer = Buffer.alloc(0);
let serialTimer = null;

port.on('data', (chunk) => {
    serialBuffer = Buffer.concat([serialBuffer, chunk]);
    clearTimeout(serialTimer);
    serialTimer = setTimeout(() => {
        if (serialBuffer.length > 0) renderFullColorfulDump(serialBuffer);
        serialBuffer = Buffer.alloc(0);
    }, 300);
});

function renderFullColorfulDump(buf) {
    console.log(`\n\x1b[44m SERIAL DUMP \x1b[0m Size: ${buf.length} bytes`);
    
    // Header indici decimali
    let header = "OFF   | ";
    for(let n=0; n<40; n++) header += n.toString(10).padStart(2, '0') + " ";
    console.log(`${DIM}${header}| ASCII${RESET}`);
    console.log("-".repeat(170));

    let blockCounter = 0;

    for (let i = 0; i < buf.length; i += 40) {
        let offset = i.toString().padStart(5, '0');
        let hexPart = "";
        let asciiPart = "";

        for (let j = 0; j < 40; j++) {
            const idx = i + j;
            if (idx < buf.length) {
                const b = buf[idx];
                const hex = b.toString(16).toUpperCase().padStart(2, '0');
                const char = (b >= 32 && b <= 126) ? String.fromCharCode(b) : ".";
                
                if (b === 0x88) {
                    // Separatore 88 in grigio scuro
                    hexPart += `${DARK_GRAY}${hex}${RESET} `;
                    asciiPart += `${DARK_GRAY}${char}${RESET}`;
                    blockCounter++; 
                } else {
                    // Dati con colori vivaci
                    const color = COLORS[blockCounter % COLORS.length];
                    hexPart += `${color}${hex}${RESET} `;
                    asciiPart += `${color}${char}${RESET}`;
                }
            }
        }
        console.log(`${DIM}${offset}${RESET} | ${hexPart}| ${asciiPart}`);
    }
    // Resettiamo il counter per il prossimo dump
    blockCounter = 0;
}