const easymidi = require('easymidi');

// --- CONFIGURAZIONE ---
// Se lo script si connetteva già, questi nomi vanno bene.
const DEVICE_NAME = 'ToneX'; 

console.log(`--- TONEX BRUTE FORCE TOOL V2 ---`);

let input, output;

try {
    const inputs = easymidi.getInputs();
    const outputs = easymidi.getOutputs();
    
    // Cerca una porta che contenga "ToneX" (case insensitive)
    const realInput = inputs.find(name => name.toLowerCase().includes(DEVICE_NAME.toLowerCase()));
    const realOutput = outputs.find(name => name.toLowerCase().includes(DEVICE_NAME.toLowerCase()));

    if (!realInput || !realOutput) {
        console.error("ERRORE: Dispositivo ToneX non trovato.");
        console.log("Input disponibili:", inputs);
        process.exit(1);
    }

    console.log(`Connesso a: ${realInput}`);
    input = new easymidi.Input(realInput);
    output = new easymidi.Output(realOutput);

} catch (e) {
    console.error("Errore apertura porte:", e);
    process.exit(1);
}

// --- ASCOLTATORE (Cosa risponde il pedale?) ---
input.on('sysex', (msg) => {
    // Converte l'array di byte in stringa Hex leggibile (es. F0 7E ...)
    const hex = msg.bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    
    console.log(`\n\n>>> RISPOSTA RICEVUTA! <<<`);
    console.log(`RAW HEX: ${hex}`);
    
    // Analisi al volo
    if (hex.startsWith('F0 7E')) {
        console.log("   [INFO] Questa è una Identity Reply!");
        // F0 7E <channel> 06 02 <ID Manuf> <Family> <Model> ...
    } else if (hex.startsWith('F0 00 20 2B')) {
        console.log("   [INFO] Risposta IK Multimedia rilevata!");
    }
});

// --- ATTACCO 1: UNIVERSAL IDENTITY REQUEST ---
console.log("\n[1] Invio Universal Identity Request (Chi sei?)...");
// F0 = Start, 7E = Universal, 7F = All Devices, 06 01 = Identity Req, F7 = End
output.send('sysex', [0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]);


// --- ATTACCO 2: IK MULTIMEDIA SCANNER ---
console.log("\n[2] Avvio scansione Model ID IK Multimedia...");

// IK Multimedia Manufacturer ID: 00 20 2B
const MANUF_ID = [0x00, 0x20, 0x2B]; 

let modelId = 0x00; // Partiamo da 00 e saliamo

const scanner = setInterval(() => {
    if (modelId > 0x7F) { // Fino a 127
        console.log("\nScansione terminata.");
        clearInterval(scanner);
        return;
    }

    // Costruiamo il pacchetto corretto con F0 e F7
    // Struttura ipotetica: F0 | MANUF | ModelID | Command (01=Info?) | F7
    const payload = [0xF0, ...MANUF_ID, modelId, 0x01, 0xF7];
    
    // Feedback visivo minimo per non intasare la console
    process.stdout.write(`\rProbe ModelID: ${modelId.toString(16).toUpperCase().padStart(2,'0')} `);
    
    output.send('sysex', payload);
    modelId++;

}, 150); // Rallentato a 150ms per dare tempo al pedale di rispondere