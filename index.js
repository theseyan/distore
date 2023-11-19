const api = require('./lib/api');
const { Command } = require('commander');
const path = require('path');

// Create new Commander instance
const program = new Command();

(async () => {

    const ora = (await import('ora')).default;
    
    // Initialize configuration
    await api.config.init();

    // Exit if configuration file is incomplete
    if(!api.config.data.webhook || !api.config.data.deta_api_key) {
        return api.console.error(`Discord Webhook URL or Deta Collection Key is missing in \`${api.config.path}\`. Exiting!`);
    }else if(!api.config.data.encryption_key) {
        return api.console.error(`No encryption key found at \`${api.config.path}\`. Exiting!`);
    }

    // Initialize database
    api.db.init();

    // Initialize CLI program
    program
        .name('Distore')
        .description('Fast, unlimited, encrypted storage on Discord')
        .version('1.0.0');

    // Upload command
    program.command('upload')
    .description('Uploads a file to the virtual filesystem')
    .argument('<path>', 'Path to file on disk')
    .argument('[destination]', 'Destination file in virtual filesystem')
    .action(async (filepath, destination) => {
        if(typeof destination == "undefined") destination = `/` + path.basename(filepath);

        // Initialize spinner
        let spinner = ora('Queueing jobs');
        let chunks = 0;
        let chunksDone = 0;

        let file = await api.fileManager.uploadFile(path.resolve(filepath), destination, (type, data) => {
            if(type === 'start') {
                chunks = data.chunks;
                spinner.start();
            }
            if(type === 'registerfile') {
                spinner.text = `Registering file to database`;
            }
            if(type === 'chunkupload') {
                spinner.text = `Uploading chunks [${chunksDone}/${chunks}]`;
            }
            if(type === 'chunkuploaded') {
                chunksDone++;
                spinner.text = `Uploading chunks [${chunksDone}/${chunks}]`;
            }
            if(type === 'end') {
                spinner.succeed(`Uploaded to \`${data.destination}\` in virtual filesystem`);
            }
        });
    });

    // Download command
    program.command('download')
    .description('Downloads a file from the virtual filesystem to disk')
    .argument('<path>', 'Path to file on virtual filesystem')
    .argument('[destination]', 'Destination file on disk')
    .action(async (filepath, destination) => {
        if(typeof destination == "undefined") destination = path.resolve('./', path.basename(filepath));
        
        let fileMeta = await api.db.getFileFromPath(filepath);
        if(fileMeta === null) {
            return api.console.error(`No file exists at \`${filepath}\`!`);
        }

        // Initialize spinner
        let spinner = ora('Queueing jobs');
        let chunks = 0;
        let chunksDone = 0;

        // Begin download
        let file = await api.fileManager.downloadFile(fileMeta.key, destination, (type, data) => {
            if(type === 'start') {
                chunks = data.chunks;
                spinner.start();
            }
            if(type === 'chunkdownload') {
                spinner.text = `Downloading chunks [${chunksDone}/${chunks}]`;
            }
            if(type === 'chunkdownloaded') {
                chunksDone++;
                spinner.text = `Downloading chunks [${chunksDone}/${chunks}]`;
            }
            if(type === 'end') {
                spinner.succeed(`Saved to ${data.path}`);
            }
        });
    });

    // Start parsing CLI commands
    program.parse();

})();