const chalk = require('chalk');
const api = require('./lib/api');
const { Command } = require('commander');
const path = require('path');
const {performance} = require('perf_hooks');
const {formatTime, formatSize} = require('./lib/util');
const server = require('./lib/serve');

// Create new Commander instance
const program = new Command();

(async () => {

    const ora = (await import('ora')).default;
    
    // Initialize configuration
    await api.config.init();

    // Exit if configuration file is incomplete
    if(!api.config.data.webhook || !api.config.data.deta_api_key) {
        return api.console.warn(`Discord Webhook URL or Deta Collection Key is missing in \`${api.config.path}\`. Please update configuration and try again.`);
    }else if(!api.config.data.encryption_key) {
        return api.console.error(`No encryption key found at \`${api.config.path}\`. Exiting!`);
    }

    // Initialize database
    api.db.init();

    await server.start();
    return;
    
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
    .option('-p, --parallel <number>', 'No. of parallel chunks to upload', 3)
    .action(async (filepath, destination, options) => {
        if(typeof destination == "undefined") destination = `/` + path.basename(filepath);

        // Initialize spinner
        let spinner = ora('Queueing jobs');
        let chunks = 0;
        let chunksDone = 0;
        let avg = 0;

        // Measure time start
        let startTime = performance.now();

        let file = await api.fileManager.uploadFile(path.resolve(filepath), destination, options.parallel, (type, data) => {
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
                // Update average upload speed
                avg = ((avg * chunksDone) + data.avgSpeed) / (chunksDone + 1);
                chunksDone++;
                spinner.text = `Uploading chunks [${chunksDone}/${chunks}]`;
            }
            if(type === 'end') {
                // Compute elapsed time in ms
                let elapsed = performance.now() - startTime;

                spinner.succeed(`Uploaded to \`${data.destination}\` in virtual filesystem ` + chalk.gray(`(${formatTime(elapsed)}, ${formatSize(avg)}/sec)`));
            }
        });
    });

    // Download command
    program.command('download')
    .description('Downloads a file from the virtual filesystem to disk')
    .argument('<path>', 'Path to file on virtual filesystem')
    .argument('[destination]', 'Destination file on disk')
    .option('-p, --parallel <number>', 'No. of parallel chunks to download', 3)
    .action(async (filepath, destination, options) => {
        if(typeof destination == "undefined") destination = path.resolve('./', path.basename(filepath));
    
        // Initialize spinner
        let spinner = ora('Fetching file metadata');
        spinner.start();
        let chunks = 0;
        let chunksDone = 0;
        let avg = 0;

        let fileMeta = await api.db.getFileFromPath(filepath);
        if(fileMeta === null) {
            spinner.stop();
            return api.console.error(`No file exists at \`${filepath}\`!`);
        }

        // Clear the spinner so text doesn't overlap
        spinner.stop();

        // Measure time start
        let startTime = performance.now();

        // Begin download
        let file = await api.fileManager.downloadFile(fileMeta.key, destination, options.parallel, (type, data) => {
            if(type === 'start') {
                spinner.text = 'Queueing jobs';
                spinner.start();
                chunks = data.chunks;
            }
            if(type === 'chunkdownload') {
                spinner.text = `Downloading chunks [${chunksDone}/${chunks}]`;
            }
            if(type === 'chunkdownloaded') {
                // Update average upload speed
                avg = ((avg * chunksDone) + data.avgSpeed) / (chunksDone + 1);
                chunksDone++;
                spinner.text = `Downloading chunks [${chunksDone}/${chunks}]`;
            }
            if(type === 'end') {
                // Compute elapsed time in ms
                let elapsed = performance.now() - startTime;

                spinner.succeed(`Saved to ${data.path} ` + chalk.gray(`(${formatTime(elapsed)}, ${formatSize(avg)}/sec)`));
            }
        });
    });

    // Delete command
    program.command('delete')
    .description('Deletes a file in the virtual filesystem')
    .argument('<path>', 'Path to file on virtual filesystem')
    .action(async (filepath) => {
        // Initialize spinner
        let spinner = ora('Fetching chunk list');
        spinner.start();
        let chunks = 0;
        let chunksDone = 0;

        let fileMeta = await api.db.getFileFromPath(filepath);
        if(fileMeta === null) {
            spinner.stop();
            return api.console.error(`No file exists at \`${filepath}\`!`);
        }

        // Clear the spinner so text doesn't overlap
        spinner.stop();

        // Measure time start
        let startTime = performance.now();

        // Begin deletion
        await api.db.deleteFile(fileMeta.key, (type, data) => {
            if(type === 'start') {
                spinner.text = 'Fetching chunk list';
                spinner.start();
            }
            if(type === 'fetchchunks') {
                chunks = data.chunksList.length;
            }
            if(type === 'chunkdelete') {
                spinner.text = `Deleting chunk ${chalk.gray(data.key)} [${chunksDone}/${chunks}]`;
            }
            if(type === 'chunkdeleted') {
                chunksDone++;
            }
            if(type === 'end') {
                // Compute elapsed time in ms
                let elapsed = performance.now() - startTime;

                spinner.succeed(`Deleted \`${fileMeta.name}\` ` + chalk.gray(`(${formatTime(elapsed)})`));
            }
        });
    });

    // List command
    program.command('ls')
    .description('Lists files in a directory')
    .argument('[path]', 'Path to directory in virtual filesystem', '/')
    .action(async (dirpath) => {
        console.log(chalk.blueBright("list"), dirpath);

        let spinner = ora('Fetching files list');
        spinner.start();
        
        // Fetch list of files
        let {files, dirs} = await api.db.listDirectory(dirpath);

        // Handle empty list
        if(files.length < 1 && dirs.length < 1) return spinner.info(`Empty directory or directory does not exist`);
        else spinner.stop();
        
        for(let dir of dirs) {
            console.log(`📁`, chalk.yellowBright(path.basename(dir.key)));
        }
        for(let file of files) {
            console.log(`-`, file.name, chalk.gray(`(${formatSize(file.size)})`));
        }
    });

    // Search command
    program.command('search')
    .description('Search for files')
    .argument('<name>', 'Name of file to search for')
    .action(async (name) => {
        console.log(chalk.blueBright("search"), name);

        let spinner = ora('Searching');
        spinner.start();
        
        // Fetch list of files
        let files = await api.db.searchFile(name);

        // Handle empty list
        if(files.length < 1) return spinner.info(`No files found for this search query`);
        else spinner.stop();
        
        for(let file of files) {
            console.log(`-`, chalk.yellowBright(file.path + `/`) + file.name, chalk.gray(`(${formatSize(file.size)})`));
        }
    });

    // Config command
    program.command('config')
    .description('Updates the configuration file')
    .argument('<item>', 'Configuration item to update')
    .argument('<value>', 'Value of the item')
    .action(async (item, value) => {
        if(item in api.config.data) {
            api.config.data[item] = value;

            // Update the config file
            await api.config.setConfig(api.config.data);

            return api.console.success(`Configuration has been updated`);
        }else {
            return api.console.error(`Configuration item \`${item}\` does not exist!`);
        }
    });

    // Start parsing CLI commands
    program.parse();

})();