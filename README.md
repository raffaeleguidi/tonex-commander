# TONEX Commander Project

This repository contains various Node.js scripts for interacting with the IK Multimedia ToneX pedal, primarily focusing on serial communication and MIDI control.

## `tonex-ui-commander.js`

This script provides a Terminal User Interface (TUI) for real-time control and monitoring of the ToneX pedal. It leverages `blessed` for the TUI, `easymidi` for MIDI communication, and `serialport` for serial data interaction.

### Features:
-   **Real-time Parameter Display**: Shows current patch name, gain, bass, mid, treble, volume, and effect states (Noise Gate, Compressor, Modulation, Delay, Reverb).
-   **Effect Type Indication**: Displays the active type for Modulation, Delay, and Reverb effects (e.g., Chorus, Digital, Spring 1).
-   **MIDI Control**: Sends MIDI CC and Program Change messages to the ToneX pedal.
-   **Serial Data Sync**: Automatically initiates a sync process upon connection to retrieve the current patch state from the pedal.
-   **Interactive Command Line**: Allows users to send MIDI commands (`cc`, `pc`) and trigger a sync (`sync`) directly from the TUI.
-   **MIDI Log**: Displays incoming MIDI messages for monitoring.
-   **Cheat Sheet**: Provides a quick reference for MIDI CC mappings and effect type values.

### Usage:
Run the script and interact via the provided command line. Type `q`, `quit`, or `exit` to close the application.

## `tonex_hexdump.js`

This utility script provides a colorful hexdump of data received from the ToneX pedal via serial communication. It's useful for debugging and understanding the raw serial data stream, especially how parameters and padding bytes are transmitted.

### Features:
-   **Serial Data Monitoring**: Listens for data on the specified serial port.
-   **Colorful Hexdump**: Presents incoming serial data in a formatted hexdump, using different colors to highlight various bytes and distinguish them from the padding byte (`0x88`).
-   **ASCII Representation**: Shows the ASCII interpretation alongside the hexadecimal values.
-   **MIDI Event Logging**: Monitors and logs any incoming MIDI messages from the ToneX device.
-   **Padding Byte Identification**: Specifically highlights the `0x88` padding byte, which is crucial for correct data parsing as described in the `tonexprotocol.txt`.

### Usage:
Execute the script to start monitoring serial and MIDI traffic.

## `tonex.js` Library Documentation

The `tonex.js` module provides a class-based interface to manage communication with an IK Multimedia ToneX pedal via Serial and MIDI.

### `ToneX` Class

#### `new ToneX(serialPath, deviceName)`

Creates an instance of the ToneX controller.

-   `serialPath` (string): The path to the serial port (e.g., `/dev/tty.usbmodem14301`).
-   `deviceName` (string): The name of the ToneX MIDI device (e.g., 'ToneX').

**Example:**

```javascript
const ToneX = require('./tonex.js');
const tonex = new ToneX('/dev/tty.usbmodem14301', 'ToneX');
```

### Complete Example

Here is a complete example of how to use the `ToneX` class to connect to the pedal, listen for state changes, send a command, and disconnect.

```javascript
const ToneX = require('./tonex.js');

// Replace with your actual serial port and MIDI device name
const SERIAL_PATH = '/dev/tty.usbmodem14301'; // or 'COM3' on Windows
const MIDI_NAME = 'ToneX';

const tonex = new ToneX(SERIAL_PATH, MIDI_NAME);

console.log('Attempting to connect to ToneX pedal...');

// Listen for the 'stateChange' event to get real-time updates
tonex.on('stateChange', (newState) => {
    console.log('State updated:');
    console.log(`  Patch Name: ${newState.name}`);
    console.log(`  Gain: ${newState.gain.toFixed(2)}`);
    console.log(`  Volume: ${newState.vol.toFixed(2)}`);
    console.log(`  Reverb: ${newState.rev ? 'ON' : 'OFF'}`);
});

// Listen for the 'serialConnected' event
tonex.on('serialConnected', () => {
    console.log('✅ Serial connection successful! Waiting for first data sync...');
});

// Listen for errors
tonex.on('serialError', (errorMessage) => {
    console.error(`❌ Serial Error: ${errorMessage}`);
    console.log('Please check your serial port path and ensure the pedal is connected.');
});

tonex.on('syncError', (errorMessage) => {
    console.error(`❌ Sync Error: ${errorMessage}`);
});

// Connect to the pedal
// This will automatically trigger an initial sync.
tonex.connect();

// Example of sending a command: Set gain to 5 after 5 seconds
setTimeout(() => {
    console.log('\nSending command: Set Gain to 5.0');
    // MIDI CC for GAIN is 10. The value is 0-127.
    // We map 5.0 (out of 10.0) to 64 (out of 127).
    tonex.sendCommand('cc', { controller: 10, value: 64 });
}, 5000);


// Disconnect after 10 seconds
setTimeout(() => {
    console.log('\nDisconnecting...');
    tonex.disconnect();
    console.log('Disconnected. Exiting.');
    process.exit(0);
}, 10000);

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Caught interrupt signal. Disconnecting...');
    tonex.disconnect();
    process.exit();
});
```

### Methods

#### `.connect()`

Opens the serial port connection and starts listening for data. Automatically triggers a sync after connection.

**Example:**

```javascript
tonex.connect();
```

#### `.sync()`

Initiates a sync process to request a full data dump from the pedal.

**Example:**

```javascript
tonex.sync();
```

#### `.sendCommand(type, data)`

Sends a MIDI command to the ToneX pedal.

-   `type` (string): The type of MIDI command (`'cc'` or `'program'`).
-   `data` (object): The MIDI message data.

**Example:**

```javascript
// Send a Control Change message
tonex.sendCommand('cc', { controller: 23, value: 64, channel: 0 });

// Send a Program Change message
tonex.sendCommand('program', { number: 5, channel: 0 });
```

#### `.disconnect()`

Closes all MIDI and Serial connections.

**Example:**

```javascript
function shutdown() {
    tonex.disconnect();
    process.exit(0);
}
```

#### `.getTypes()`

Retrieves the dictionaries for effect types.

-   **Returns**: `{MOD_TYPES: object, DLY_TYPES: object, REV_TYPES: object}`

**Example:**

```javascript
const { MOD_TYPES, DLY_TYPES, REV_TYPES } = tonex.getTypes();
const modType = MOD_TYPES[state.modType];
```

### Events

You can listen to events emitted by the `ToneX` instance.

**Example:**

```javascript
tonex.on('stateChange', (newState) => {
    // Update your UI with the new state
    console.log('New state:', newState);
});

tonex.on('serialConnected', () => {
    console.log('Serial Connected!');
});
```

-   `serialConnected`: Emitted when the serial port is successfully connected.
-   `serialError`: Emitted when a serial port error occurs.
    -   **Parameter**: `errorMessage` (string)
-   `syncStart`: Emitted when a sync process is started.
    -   **Parameter**: `type` (string) - e.g., 'Preset UP'
-   `syncError`: Emitted when a sync process fails.
    -   **Parameter**: `errorMessage` (string)
-   `midiError`: Emitted when a MIDI command fails (e.g., output is not connected).
    -   **Parameter**: `errorMessage` (string)
-   `dumpReceived`: Emitted when a full data dump is received from the pedal.
-   `midiProgramChange`: Emitted when a MIDI Program Change message is received.
    -   **Parameter**: `pcNumber` (number)
-   `midiControlChange`: Emitted when a MIDI Control Change message is received.
    -   **Parameter**: `controller` (number)
    -   **Parameter**: `value` (number)
-   `stateChange`: Emitted whenever the pedal's state changes.
    -   **Parameter**: `newState` (object) - The complete new state object.
    

## TONEX SERIAL PROTOCOL & MIDI MAPPING DOCUMENTATION v46

This section details the communication protocol and MIDI mapping for the ToneX pedal, derived from `tonexprotocol.txt`.

### 1. Connection Specifications
-   **Serial Port**: `/dev/tty.usbmodem14301`
-   **Baud Rate**: `115200`
-   **Buffer Dump Size**: `2219 bytes` (Full Patch Dump)

### 2. Data Extraction Logic (JavaScript/Node.js)
The ToneX protocol inserts a padding byte (`0x88`) between Float32 data bytes. The following functions demonstrate how to filter this byte for correct data reading:

#### A. Reading Analog Parameters (Float32):
```javascript
function readFloat(buf, offset) {
    let bytes = [];
    let i = offset;
    while (bytes.length < 4 && i < buf.length) {
        if (buf[i] !== 0x88) bytes.push(buf[i]);
        i++;
    }
    return bytes.length === 4 ? Buffer.from(bytes).readFloatLE(0) : 0;
}
```

#### B. Reading Logical States (Bypass):
```javascript
function readSwitch(buf, offset) {
    return readFloat(buf, offset) > 0.5;
}
```

#### C. Reading Strings (Patch Name):
```javascript
function readName(buf, offset, length = 30) {
    return buf.toString('ascii', offset, offset + length)
              .replace(/[^\x20-\x7E]/g, '').trim();
}
```

### 3. Serial Offset and MIDI CC Mapping
| PARAMETER    | SERIAL OFFSET | METHOD       | MIDI CC | RANGE / NOTE       |
| :----------- | :------------ | :----------- | :------ | :----------------- |
| PATCH NAME   | 21            | readName     | --      | ASCII String       |
| NOISE GATE   | 73            | readSwitch   | 15      | 0=OFF / 127=ON     |
| COMPRESSOR   | 101           | readSwitch   | 17      | 0=OFF / 127=ON     |
| BASS         | 126           | readFloat    | 11      | 0.0 - 10.0         |
| MID          | 136           | readFloat    | 12      | 0.0 - 10.0         |
| TREBLE       | 151           | readFloat    | 13      | 0.0 - 10.0         |
| GAIN         | 171           | readFloat    | 10      | 0.0 - 10.0         |
| VOLUME       | 177           | readFloat    | 14      | 0.0 - 10.0         |
| REV MASTER   | 261           | readFloat    | 27      | Switch (Bypass)    |
| REV TYPE     | 261           | readFloat    | 29      | 0-3:Spr, 4:Rm, 5:Pl|
| MOD SWITCH   | 392           | readSwitch   | 19      | 0=OFF / 127=ON     |
| MOD TYPE     | 397           | readFloat    | 21      | 0:Cho, 1:Tre, etc. |
| DLY SWITCH   | 547           | readSwitch   | 23      | 0=OFF / 127=ON     |
| DLY TYPE     | 552           | readFloat    | 25      | 0:Dig, 1:Tap       |

### 4. Algorithm Dictionary

#### REVERB (CC 29):
-   `0`: SPRING 1
-   `1`: SPRING 2
-   `2`: SPRING 3
-   `3`: SPRING 4
-   `4`: ROOM
-   `5`: PLATE

#### MODULATION (CC 21):
-   `0`: CHORUS
-   `1`: TREMOLO
-   `2`: PHASER
-   `3`: FLANGER
-   `4`: ROTARY

#### DELAY (CC 25):
-   `0`: DIGITAL
-   `1`: TAPE

### 5. Technical Notes and Synchronization
-   **MIDI SYNC**: To calculate the slot (e.g., 01B), combine the current Program Change. Formula: `Bank = floor(PC / 3)`, `Letter = PC % 3` (where `0=A`, `1=B`, `2=C`).
-   **DUMP TRIGGER**: The pedal sends a complete dump only upon a patch change or when the SAVE button is physically pressed. Parameter modifications via knobs are not transmitted via serial in real-time without a dump.