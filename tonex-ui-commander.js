const blessed = require('blessed');
const easymidi = require('easymidi');
const { SerialPort } = require('serialport');

// --- CONFIGURAZIONE ---
const SERIAL_PATH = '/dev/tty.usbmodem14301';
const DEVICE_NAME = 'ToneX';

// --- CONNESSIONI ---
const inputs = easymidi.getInputs();
const outputs = easymidi.getOutputs();
const tonexInName = inputs.find(n => n.toLowerCase().includes(DEVICE_NAME.toLowerCase()));
const tonexOutName = outputs.find(n => n.toLowerCase().includes(DEVICE_NAME.toLowerCase()));

const midiInput = tonexInName ? new easymidi.Input(tonexInName) : null;
const midiOutput = tonexOutName ? new easymidi.Output(tonexOutName) : null;

// --- MAPPA MIDI (Custom) ---
const CC_MAP = {
    // AMP KNOBS
    102: 'gain', 23: 'bass', 25: 'mid', 28: 'treb', 103: 'vol',
    // SWITCHES
    15: 'gate', 17: 'comp', 32: 'mod', 41: 'dly', 50: 'rev',
    // TYPES
    33: 'modType', 42: 'dlyType', 51: 'revType'
};

const OFFSETS = { GATE: 73, COMP: 101, BASS: 126, MID: 136, TREB: 151, GAIN: 171, VOL: 177, REV: 261, MOD_SW: 392, MOD_TY: 397, DLY_SW: 547, DLY_TY: 552 };
const MOD_TYPES = { 0: "CHORUS", 1: "TREMOLO", 2: "PHASER", 3: "FLANGER", 4: "ROTARY" };
const DLY_TYPES = { 0: "DIGITAL", 1: "TAPE" };
const REV_TYPES = { 0: "SPRING 1", 1: "SPRING 2", 2: "SPRING 3", 3: "SPRING 4", 4: "ROOM", 5: "PLATE" };

// --- STATO ---
let state = {
    bank: 0, pc: 0, name: "WAITING SYNC...",
    gain: 0, bass: 0, mid: 0, treb: 0, vol: 0,
    gate: false, comp: false, mod: false, dly: false, rev: false,
    modType: 0, dlyType: 0, revType: 0
};

// --- TUI SETUP ---
const screen = blessed.screen({ smartCSR: false, fullUnicode: true, title: 'ToneX Commander v59' });
screen.program.disableMouse();

// 1. MONITOR (Sinistra 50%)
const monitorBox = blessed.box({
    top: 0, left: 0, width: '50%', height: '60%',
    label: ' {bold}TONEX COMMANDER{/bold} ',
    border: { type: 'line' }, style: { border: { fg: 'green' } }, tags: true
});

// 2. REFERENCE LIST (Destra 50% - Con TIPI EFFETTO)
const referenceBox = blessed.box({
    top: 0, left: '50%', width: '50%', height: '60%',
    label: ' {bold}CHEAT SHEET{/bold} ',
    border: { type: 'line' }, style: { border: { fg: 'white' } }, tags: true,
    content: `
 {bold}AMP (Knobs){/bold}        {bold}MOD TYPES (CC 33){/bold}
 CC 102: Gain       0: Chorus
 CC 23 : Bass       1: Tremolo
 CC 25 : Mid        2: Phaser
 CC 28 : Treb       3: Flanger
 CC 103: Vol        4: Rotary

 {bold}SWITCH (On/Off){/bold}  {bold}DLY TYPES (CC 42){/bold}
 CC 15 : Gate       0: Digital
 CC 17 : Comp       1: Tape
 CC 32 : Mod
 CC 41 : Dly        {bold}REV TYPES (CC 51){/bold}
 CC 50 : Rev        0-3: Spring
                    4  : Room
 {bold}UTILITY{/bold}            5  : Plate
 CC 87 : Patch UP
 CC 86 : Patch DWN
`
});

// 3. LOG (Sotto)
const replLog = blessed.log({
    top: '60%', left: 0, width: '100%', height: '35%',
    label: ' MIDI LOG ',
    border: { type: 'line' }, style: { border: { fg: 'cyan' } }, tags: true, scrollable: true
});

// 4. INPUT (Fondo)
const inputField = blessed.textbox({
    bottom: 0, left: 0, width: '100%', height: 3,
    label: ' COMMANDER (q per uscire) ',
    border: { type: 'line' }, style: { border: { fg: 'yellow' }, focus: { border: { fg: 'white' } } },
    inputOnFocus: true
});

screen.append(monitorBox);
screen.append(referenceBox);
screen.append(replLog);
screen.append(inputField);

// --- RENDER LOGIC ---
function getPatchString() {
    const absPC = (state.bank * 128) + state.pc;
    const bankNum = Math.floor(absPC / 3).toString().padStart(2, '0');
    const letter = ['A', 'B', 'C'][absPC % 3];
    return `${bankNum}${letter} ${state.name}`;
}

function drawBar(val, label) {
    const barWidth = 16; 
    const safeVal = Math.max(0, Math.min(10, val));
    const filled = Math.round((safeVal / 10) * barWidth);
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
    return ` ${label.padEnd(6)} {green-fg}${bar}{/} {bold}${safeVal.toFixed(1)}{/}`;
}

function renderUI() {
    const gateStr = state.gate ? "{green-fg}ON {/}" : "{red-fg}OFF{/}";
    const compStr = state.comp ? "{green-fg}ON {/}" : "{red-fg}OFF{/}";
    const modStr  = state.mod  ? "{green-fg}ON {/}" : "{red-fg}OFF{/}";
    const dlyStr  = state.dly  ? "{green-fg}ON {/}" : "{red-fg}OFF{/}";
    const revStr  = state.rev  ? "{green-fg}ON {/}" : "{red-fg}OFF{/}";

    const modType = MOD_TYPES[state.modType] || `T:${state.modType}`;
    const dlyType = DLY_TYPES[state.dlyType] || `T:${state.dlyType}`;
    const revType = REV_TYPES[state.revType] || `T:${state.revType}`;

    let content = `\n {inverse} PATCH: ${getPatchString()} {/}\n\n`;
    content += ` GATE:${gateStr} COMP:${compStr} MOD:${modStr}[${modType}]\n`;
    content += ` DLY :${dlyStr}[${dlyType}]  REV:${revStr}[${revType}]\n\n`;
    content += `${drawBar(state.gain, 'GAIN')}\n`;
    content += `${drawBar(state.bass, 'BASS')}\n`;
    content += `${drawBar(state.mid,  'MID')}\n`;
    content += `${drawBar(state.treb, 'TREB')}\n`;
    content += `${drawBar(state.vol,  'VOL')}\n`;

    monitorBox.setContent(content);
    screen.render();
}

// --- SYNC & IO ---
function kickstartSync() {
    if (midiOutput) {
        replLog.log(`{magenta-fg}🔄 Sync: Preset UP...{/}`);
        midiOutput.send('cc', { controller: 87, value: 0 }); 
        setTimeout(() => {
            replLog.log(`{magenta-fg}🔄 Sync: Preset DOWN...{/}`);
            midiOutput.send('cc', { controller: 86, value: 0 });
        }, 150);
    } else {
        replLog.log(`{red-fg}Sync fallito: MIDI Out disconnesso.{/}`);
    }
}

// SERIAL
function readFloat(buf, offset) {
    let bytes = [];
    let i = offset;
    while (bytes.length < 4 && i < buf.length) {
        if (buf[i] !== 0x88) bytes.push(buf[i]);
        i++;
    }
    return bytes.length === 4 ? Buffer.from(bytes).readFloatLE(0) : 0;
}

const port = new SerialPort({ path: SERIAL_PATH, baudRate: 115200, autoOpen: false });

port.open((err) => {
    if (err) replLog.log(`{red-fg}Serial Error: ${err.message}{/}`);
    else {
        replLog.log(`{green-fg}✅ Seriale Connessa.{/}`);
        setTimeout(kickstartSync, 1000); 
    }
});

let buffer = Buffer.alloc(0);
port.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    clearTimeout(this.t);
    this.t = setTimeout(() => {
        if (buffer.length >= 2219) {
            state.name = buffer.toString('ascii', 21, 50).replace(/[^\x20-\x7E]/g, '').trim();
            state.gain = readFloat(buffer, OFFSETS.GAIN);
            state.bass = readFloat(buffer, OFFSETS.BASS);
            state.mid  = readFloat(buffer, OFFSETS.MID);
            state.treb = readFloat(buffer, OFFSETS.TREB);
            state.vol  = readFloat(buffer, OFFSETS.VOL);
            
            state.gate = readFloat(buffer, OFFSETS.GATE) > 0.5;
            state.comp = readFloat(buffer, OFFSETS.COMP) > 0.5;
            state.mod  = readFloat(buffer, OFFSETS.MOD_SW) > 0.5;
            state.dly  = readFloat(buffer, OFFSETS.DLY_SW) > 0.5;
            const rVal = readFloat(buffer, OFFSETS.REV);
            state.rev = rVal > -1 && buffer[261] !== 0x00;
            state.modType = Math.round(readFloat(buffer, OFFSETS.MOD_TY));
            state.dlyType = Math.round(readFloat(buffer, OFFSETS.DLY_TY));
            state.revType = Math.round(rVal);

            replLog.log(`{gray-fg}[SERIAL] Dump received.{/}`);
            renderUI();
        }
        buffer = Buffer.alloc(0);
    }, 80);
});

// MIDI IN
if (midiInput) {
    midiInput.on('program', msg => {
        state.pc = msg.number;
        replLog.log(`{magenta-fg}[MIDI IN] PC ${msg.number}{/}`);
        renderUI();
    });

    midiInput.on('cc', msg => {
        const param = CC_MAP[msg.controller];
        if (param) {
            if (['gain','bass','mid','treb','vol'].includes(param)) {
                state[param] = (msg.value / 127) * 10;
            } else if (['modType','dlyType','revType'].includes(param)) {
                state[param] = msg.value;
            } else {
                state[param] = msg.value >= 64;
            }
            replLog.log(`{blue-fg}[MIDI IN] CC ${msg.controller} -> ${msg.value}{/}`);
            renderUI();
        }
    });
}

// HANDLERS
function shutdown() {
    screen.destroy();
    if (port.isOpen) port.close();
    if (midiInput) midiInput.close();
    if (midiOutput) midiOutput.close();
    process.exit(0);
}

inputField.on('submit', line => {
    const args = line.trim().toLowerCase().split(/\s+/);
    
    // Uscita con q, quit o exit
    if (['q', 'quit', 'exit'].includes(args[0])) return shutdown();

    if (!midiOutput) replLog.log(`{red-fg}No MIDI OUT.{/}`);
    else if (args[0] === 'cc' && args.length >= 3) {
        const cc = parseInt(args[1]);
        const val = parseInt(args[2]);
        midiOutput.send('cc', { controller: cc, value: val, channel: 0 });
        replLog.log(`{cyan-fg}[CMD] CC ${cc} -> ${val}{/}`);
        if (midiInput) midiInput.emit('cc', { controller: cc, value: val });
    } else if (args[0] === 'pc' && args.length >= 2) {
        const pc = parseInt(args[1]);
        midiOutput.send('program', { number: pc, channel: 0 });
        replLog.log(`{yellow-fg}[CMD] PC ${pc}{/}`);
    } else if (args[0] === 'sync') {
        kickstartSync();
    }

    inputField.clearValue();
    inputField.focus();
    screen.render();
});

screen.key(['C-c', 'C-d'], () => shutdown());

inputField.focus();
renderUI();