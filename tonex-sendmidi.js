const easymidi = require('easymidi');
const readline = require('readline');

// --- SETUP ---
const DEVICE_NAME = 'ToneX';
const outputs = easymidi.getOutputs();
const tonexOutputName = outputs.find(n => n.toLowerCase().includes(DEVICE_NAME.toLowerCase()));

if (!tonexOutputName) {
    console.error(`❌ Errore: Porta MIDI '${DEVICE_NAME}' non trovata.`);
    console.log("Porte disponibili:", outputs);
    process.exit(1);
}

const output = new easymidi.Output(tonexOutputName);
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'tonex> '
});

console.log(`✅ Connesso a: ${tonexOutputName}`);
console.log("Digita i comandi (es: 'cc 32 127' o 'pc 5'). Digita 'exit' per uscire.");
rl.prompt();

rl.on('line', (line) => {
    const args = line.trim().toLowerCase().split(/\s+/);
    const command = args[0];

    try {
        switch (command) {
            case 'cc':
                // Sintassi: cc [controller] [value]
                if (args.length < 3) {
                    console.log("Uso: cc <controller> <value>");
                } else {
                    const controller = parseInt(args[1]);
                    const value = parseInt(args[2]);
                    output.send('cc', {
                        controller: controller,
                        value: value,
                        channel: 0 // Canale 1
                    });
                    console.log(`📤 Inviato CC ${controller} con valore ${value}`);
                }
                break;

            case 'pc':
                // Sintassi: pc [number]
                if (args.length < 2) {
                    console.log("Uso: pc <number>");
                } else {
                    const number = parseInt(args[1]);
                    output.send('program', {
                        number: number,
                        channel: 0
                    });
                    console.log(`📤 Inviato Program Change: ${number}`);
                }
                break;

            case 'exit':
            case 'quit':
                rl.close();
                break;

            default:
                console.log("Comando non riconosciuto. Usa 'cc' o 'pc'.");
                break;
        }
    } catch (err) {
        console.error("❌ Errore nell'invio:", err.message);
    }
    rl.prompt();
}).on('close', () => {
    console.log('\nChiusura commander.');
    process.exit(0);
});