const blessed = require('blessed');
const ToneX = require('./tonex.js');

// --- CONFIGURAZIONE ---
const SERIAL_PATH = '/dev/tty.usbmodem14301';
const DEVICE_NAME = 'ToneX';

const tonex = new ToneX(SERIAL_PATH, DEVICE_NAME);
const { MOD_TYPES, DLY_TYPES, REV_TYPES } = tonex.getTypes();

let state = tonex.state;

// --- TUI SETUP ---
const screen = blessed.screen({ smartCSR: false, fullUnicode: true, title: 'ToneX Commander v60 (Refactored)' });
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

tonex.on('stateChange', (newState) => {
    state = newState;
    renderUI();
});

tonex.on('serialConnected', () => {
    replLog.log('{green-fg}✅ Seriale Connessa.{/}');
});

tonex.on('serialError', (errorMessage) => {
    replLog.log(`{red-fg}Serial Error: ${errorMessage}{/}`);
});

tonex.on('syncStart', (type) => {
    replLog.log(`{magenta-fg}🔄 Sync: ${type}...{/}`);
});

tonex.on('syncError', (errorMessage) => {
    replLog.log(`{red-fg}Sync fallito: ${errorMessage}{/}`);
});

tonex.on('midiError', (errorMessage) => {
    replLog.log(`{red-fg}${errorMessage}{/}`);
});

tonex.on('dumpReceived', () => {
    replLog.log(`{gray-fg}[SERIAL] Dump received.{/}`);
});

tonex.on('midiProgramChange', (pcNumber) => {
    replLog.log(`{magenta-fg}[MIDI IN] PC ${pcNumber}{/}`);
});

tonex.on('midiControlChange', (controller, value) => {
    replLog.log(`{blue-fg}[MIDI IN] CC ${controller} -> ${value}{/}`);
});

// HANDLERS
function shutdown() {
    tonex.disconnect();
    screen.destroy();
    process.exit(0);
}

inputField.on('submit', line => {
    const args = line.trim().toLowerCase().split(/\s+/);
    
    // Uscita con q, quit o exit
    if (['q', 'quit', 'exit'].includes(args[0])) return shutdown();

    if (args[0] === 'cc' && args.length >= 3) {
        const cc = parseInt(args[1]);
        const val = parseInt(args[2]);
        tonex.sendCommand('cc', { controller: cc, value: val, channel: 0 });
        replLog.log(`{cyan-fg}[CMD] CC ${cc} -> ${val}{/}`);
    } else if (args[0] === 'pc' && args.length >= 2) {
        const pc = parseInt(args[1]);
        tonex.sendCommand('program', { number: pc, channel: 0 });
        replLog.log(`{yellow-fg}[CMD] PC ${pc}{/}`);
    } else if (args[0] === 'sync') {
        tonex.sync();
    }

    inputField.clearValue();
    inputField.focus();
    screen.render();
});

inputField.focus();
renderUI();
tonex.connect();