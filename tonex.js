const { SerialPort } = require('serialport');
const easymidi = require('easymidi');
const { EventEmitter } = require('events');

const OFFSETS = { GATE: 73, COMP: 101, BASS: 126, MID: 136, TREB: 151, GAIN: 171, VOL: 177, REV: 261, MOD_SW: 392, MOD_TY: 397, DLY_SW: 547, DLY_TY: 552 };
const MOD_TYPES = { 0: "CHORUS", 1: "TREMOLO", 2: "PHASER", 3: "FLANGER", 4: "ROTARY" };
const DLY_TYPES = { 0: "DIGITAL", 1: "TAPE" };
const REV_TYPES = { 0: "SPRING 1", 1: "SPRING 2", 2: "SPRING 3", 3: "SPRING 4", 4: "ROOM", 5: "PLATE" };

/**
 * Parses a Float32 value from a ToneX buffer, skipping padding bytes.
 * @param {Buffer} buf - The buffer to read from.
 * @param {number} offset - The starting offset.
 * @returns {number} The parsed float value.
 * @private
 */
function readFloat(buf, offset) {
    let bytes = [];
    let i = offset;
    while (bytes.length < 4 && i < buf.length) {
        if (buf[i] !== 0x88) bytes.push(buf[i]);
        i++;
    }
    return bytes.length === 4 ? Buffer.from(bytes).readFloatLE(0) : 0;
}

/**
 * Manages communication with an IK Multimedia ToneX pedal via Serial and MIDI.
 * @fires serialConnected
 * @fires serialError
 * @fires syncStart
 * @fires syncError
 * @fires midiError
 * @fires dumpReceived
 * @fires midiProgramChange
 * @fires midiControlChange
 * @fires stateChange
 */
class ToneX extends EventEmitter {
    /**
     * Creates an instance of the ToneX controller.
     * @param {string} serialPath - The path to the serial port (e.g., '/dev/tty.usbmodem14301').
     * @param {string} deviceName - The name of the ToneX MIDI device (e.g., 'ToneX').
     * @example
     * const ToneX = require('./tonex.js');
     * const tonex = new ToneX('/dev/tty.usbmodem14301', 'ToneX');
     */
    constructor(serialPath, deviceName) {
        super();
        this.serialPath = serialPath;
        this.deviceName = deviceName;

        /**
         * The current state of the ToneX pedal.
         * @type {object}
         * @property {number} bank - The current bank number.
         * @property {number} pc - The current program change number.
         * @property {string} name - The name of the current patch.
         * // ... and other parameters
         */
        this.state = {
            bank: 0, pc: 0, name: "WAITING SYNC...",
            gain: 0, bass: 0, mid: 0, treb: 0, vol: 0,
            gate: false, comp: false, mod: false, dly: false, rev: false,
            modType: 0, dlyType: 0, revType: 0
        };

        this.port = new SerialPort({ path: this.serialPath, baudRate: 115200, autoOpen: false });
        this.port.on('open', () => this.emit('serialConnected'));
        this.port.on('data', this._handleSerialData.bind(this));
        
        const inputs = easymidi.getInputs();
        const outputs = easymidi.getOutputs();
        const tonexInName = inputs.find(n => n.toLowerCase().includes(this.deviceName.toLowerCase()));
        const tonexOutName = outputs.find(n => n.toLowerCase().includes(this.deviceName.toLowerCase()));

        this.midiInput = tonexInName ? new easymidi.Input(tonexInName) : null;
        this.midiOutput = tonexOutName ? new easymidi.Output(tonexOutName) : null;
        
        if (this.midiInput) {
            this.midiInput.on('program', this._handleMidiProgram.bind(this));
            this.midiInput.on('cc', this._handleMidiCC.bind(this));
        }

        this.buffer = Buffer.alloc(0);
        this.serialTimer = null;
    }

    /**
     * Opens the serial port connection and starts listening for data.
     * Automatically triggers a sync after connection.
     * @example
     * tonex.connect();
     */
    connect() {
        this.port.open((err) => {
            if (err) {
                this.emit('serialError', err.message);
            } else {
                setTimeout(() => this.sync(), 1000);
            }
        });
    }

    /**
     * Initiates a sync process to request a full data dump from the pedal.
     * @example
     * tonex.sync();
     */
    sync() {
        if (this.midiOutput) {
            this.emit('syncStart', 'Preset UP');
            this.midiOutput.send('cc', { controller: 87, value: 0 });
            setTimeout(() => {
                this.emit('syncStart', 'Preset DOWN');
                this.midiOutput.send('cc', { controller: 86, value: 0 });
            }, 150);
        } else {
            this.emit('syncError', 'MIDI Out disconnesso');
        }
    }
    
    /**
     * Sends a MIDI command to the ToneX pedal.
     * @param {('cc'|'program')} type - The type of MIDI command.
     * @param {object} data - The MIDI message data.
     * @example
     * // Send a Control Change message
     * tonex.sendCommand('cc', { controller: 23, value: 64, channel: 0 });
     * 
     * // Send a Program Change message
     * tonex.sendCommand('program', { number: 5, channel: 0 });
     */
    sendCommand(type, data) {
        if (this.midiOutput) {
            this.midiOutput.send(type, data);
            if (type === 'cc' && this.midiInput) {
                this.midiInput.emit('cc', data);
            }
        } else {
            this.emit('midiError', 'MIDI Out non connesso');
        }
    }

    /**
     * Handles incoming serial data chunks and parses them.
     * @param {Buffer} chunk - The data chunk from the serial port.
     * @private
     */
    _handleSerialData(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        clearTimeout(this.serialTimer);
        this.serialTimer = setTimeout(() => {
            if (this.buffer.length >= 2219) {
                this.state.name = this.buffer.toString('ascii', 21, 50).replace(/[^\x20-\x7E]/g, '').trim();
                this.state.gain = readFloat(this.buffer, OFFSETS.GAIN);
                this.state.bass = readFloat(this.buffer, OFFSETS.BASS);
                this.state.mid  = readFloat(this.buffer, OFFSETS.MID);
                this.state.treb = readFloat(this.buffer, OFFSETS.TREB);
                this.state.vol  = readFloat(this.buffer, OFFSETS.VOL);
                
                this.state.gate = readFloat(this.buffer, OFFSETS.GATE) > 0.5;
                this.state.comp = readFloat(this.buffer, OFFSETS.COMP) > 0.5;
                this.state.mod  = readFloat(this.buffer, OFFSETS.MOD_SW) > 0.5;
                this.state.dly  = readFloat(this.buffer, OFFSETS.DLY_SW) > 0.5;
                const rVal = readFloat(this.buffer, OFFSETS.REV);
                this.state.rev = rVal > -1 && this.buffer[261] !== 0x00;
                this.state.modType = Math.round(readFloat(this.buffer, OFFSETS.MOD_TY));
                this.state.dlyType = Math.round(readFloat(this.buffer, OFFSETS.DLY_TY));
                this.state.revType = Math.round(rVal);

                this.emit('dumpReceived');
                this.emit('stateChange', this.state);
            }
            this.buffer = Buffer.alloc(0);
        }, 80);
    }
    
    /**
     * Handles incoming MIDI Program Change messages.
     * @param {object} msg - The MIDI message.
     * @private
     */
    _handleMidiProgram(msg) {
        this.state.pc = msg.number;
        this.emit('midiProgramChange', msg.number);
        this.emit('stateChange', this.state);
    }
    
    /**
     * Handles incoming MIDI Control Change messages.
     * @param {object} msg - The MIDI message.
     * @private
     */
    _handleMidiCC(msg) {
        const CC_MAP = {
            102: 'gain', 23: 'bass', 25: 'mid', 28: 'treb', 103: 'vol',
            15: 'gate', 17: 'comp', 32: 'mod', 41: 'dly', 50: 'rev',
            33: 'modType', 42: 'dlyType', 51: 'revType'
        };
        
        const param = CC_MAP[msg.controller];
        if (param) {
            if (['gain','bass','mid','treb','vol'].includes(param)) {
                this.state[param] = (msg.value / 127) * 10;
            } else if (['modType','dlyType','revType'].includes(param)) {
                this.state[param] = msg.value;
            } else {
                this.state[param] = msg.value >= 64;
            }
            this.emit('midiControlChange', msg.controller, msg.value);
            this.emit('stateChange', this.state);
        }
    }

    /**
     * Closes all MIDI and Serial connections.
     * @example
     * function shutdown() {
     *     tonex.disconnect();
     *     // ... exit process
     * }
     */
    disconnect() {
        if (this.port.isOpen) this.port.close();
        if (this.midiInput) this.midiInput.close();
        if (this.midiOutput) this.midiOutput.close();
    }
    
    /**
     * Retrieves the dictionaries for effect types.
     * @returns {{MOD_TYPES: object, DLY_TYPES: object, REV_TYPES: object}}
     * @example
     * const { MOD_TYPES, DLY_TYPES, REV_TYPES } = tonex.getTypes();
     * const modType = MOD_TYPES[state.modType];
     */
    getTypes() {
        return {
            MOD_TYPES,
            DLY_TYPES,
            REV_TYPES
        }
    }
}

/**
 * Emitted when the serial port is successfully connected.
 * @event serialConnected
 * @example
 * tonex.on('serialConnected', () => {
 *     console.log('Serial Connected!');
 * });
 */

/**
 * Emitted when a serial port error occurs.
 * @event serialError
 * @type {string}
 * @example
 * tonex.on('serialError', (errorMessage) => {
 *     console.error(`Serial Error: ${errorMessage}`);
 * });
 */

/**
 * Emitted when a sync process is started.
 * @event syncStart
 * @type {string}
 * @example
 * tonex.on('syncStart', (type) => {
 *     console.log(`Syncing: ${type}...`);
 * });
 */

/**
 * Emitted when a sync process fails.
 * @event syncError
 * @type {string}
 * @example
 * tonex.on('syncError', (errorMessage) => {
 *     console.error(`Sync failed: ${errorMessage}`);
 * });
 */

/**
 * Emitted when a MIDI command fails (e.g., output is not connected).
 * @event midiError
 * @type {string}
 */

/**
 * Emitted when a full data dump is received from the pedal.
 * @event dumpReceived
 */

/**
 * Emitted when a MIDI Program Change message is received.
 * @event midiProgramChange
 * @type {number}
 */

/**
 * Emitted when a MIDI Control Change message is received.
 * @event midiControlChange
 * @type {number}
 */

/**
 * Emitted whenever the pedal's state changes.
 * @event stateChange
 * @type {object}
 * @example
 * tonex.on('stateChange', (newState) => {
 *     renderUI(newState);
 * });
 */

module.exports = ToneX;
