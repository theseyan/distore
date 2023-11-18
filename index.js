const api = require('./lib/api');

(async () => {

    // Initialize configuration
    await api.config.init();

    // Exit if configuration file is incomplete
    if(!api.config.data.webhook || !api.config.data.deta_api_key) {
        return console.log(`Discord Webhook URL or Deta Collection Key is missing in \`${api.config.path}\`. Exiting!`);
    }else if(!api.config.data.encryption_key) {
        return console.log(`No encryption key found at \`${api.config.path}\`. Exiting!`);
    }

    // Initialize database
    await api.db.init();

    
    let file = await api.fileManager.uploadFile("C:/ziglang/zig.exe");

    await api.fileManager.downloadFile(file.key, "D:/Projects/distore/zig.exe");

})();