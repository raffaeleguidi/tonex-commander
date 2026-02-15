const { SerialPort } = require('serialport');
const easymidi = require('easymidi');
const { EventEmitter } = require('events');

const OFFSETS = { GATE: 73, COMP: 101, BASS: 126, MID: 136, TREB: 151, GAIN: 171, VOL: 177, REV: 261, MOD_SW: 392, MOD_TY: 397, DLY_SW: 547, DLY_TY: 552 };
const MOD_TYPES = { 0: "CHORUS", 1: "TREMOLO", 2: "PHASER", 3: "FLANGER", 4: "ROTARY" };
const DLY_TYPES = { 0: "DIGITAL", 1: "TAPE" };
const REV_TYPES = { 0: "SPRING 1", 1: "SPRING 2", 2: "SPRING 3", 3: "SPRING 4", 4: "ROOM", 5: "PLATE" };

function readFloat(buf, offset) {
    let bytes = [];
    let i = offset;
    while (bytes.length < 4 && i < buf.length) {
        if (buf[i] !== 0x88) bytes.push(buf[i]);
        i++;
    }
    return bytes.length === 4 ? Buffer.from(bytes).readFloatLE(0) : 0;
}

class ToneX extends EventEmitter {
    constructor(serialPath, deviceName) {
        super();
        this.serialPath = serialPath;
        this.deviceName = deviceName;

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

    connect() {
        this.port.open((err) => {
            if (err) {
                this.emit('serialError', err.message);
            } else {
                setTimeout(() => this.sync(), 1000);
            }
        });
    }

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
    
    _handleMidiProgram(msg) {
        this.state.pc = msg.number;
        this.emit('midiProgramChange', msg.number);
        this.emit('stateChange', this.state);
    }
    
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

    disconnect() {
        if (this.port.isOpen) this.port.close();
        if (this.midiInput) this.midiInput.close();
        if (this.midiOutput) this.midiOutput.close();
    }
    
    getTypes() {
        return {
            MOD_TYPES,
            DLY_TYPES,
            REV_TYPES
        }
    }
}

module.exports = ToneX;
