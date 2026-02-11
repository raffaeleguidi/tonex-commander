const easymidi = require('easymidi');

const MIDI_NAME = 'ToneX';
const outputName = easymidi.getOutputs().find(n => n.toLowerCase().includes(MIDI_NAME.toLowerCase()));

if (!outputName) {
    console.error("❌ Porta ToneX non trovata");
    process.exit(1);
}

const output = new easymidi.Output(outputName);

/**
 * Simuliamo la pressione dei tasti:
 * CC 87 (Value 127) -> Preset UP
 * Attesa 100ms
 * CC 86 (Value 127) -> Preset DOWN
 */

console.log(`🚀 Inviando trigger CC 87/86 a ${outputName}...`);

// 1. Spostiamoci su (UP)
output.send('cc', {
    controller: 87,
    value: 127,
    channel: 0
});

setTimeout(() => {
    // 2. Torniamo giù (DOWN)
    output.send('cc', {
        controller: 86,
        value: 127,
        channel: 0
    });
    console.log("✅ Sequenza UP/DOWN inviata.");
}, 100); // Un po' di respiro per il processore del pedale


setTimeout(() => {
    output.close();
    process.exit(0);
}, 500);