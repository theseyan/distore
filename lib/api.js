/**
 * API library for Distore
*/

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const nanoid = require('nanoid').nanoid;
const crypto = require('crypto');
const deta = require('deta');
const axios = require('axios').default;
const FormData = require('form-data');
const chalk = require('chalk');
const {performance} = require('perf_hooks');
const {formatSize} = require('./util');

// Max chunk size in bytes
const MAX_CHUNK_SIZE = 24 * 1024 * 1024;

// No. of parallel chunk uploads
let MAX_PARALLEL_CHUNK_UPLOAD = 3;

// No. of parallel chunk downloads
let MAX_PARALLEL_CHUNK_DOWNLOAD = 3;

class API {

    // Console API
    console = {
        error: (message) => {
            console.error(chalk.redBright("error:"), message);
        },

        warn: (message) => {
            console.warn(chalk.yellowBright("warning:"), message);
        },

        info: (message) => {
            console.log(chalk.gray("info:"), message);
        },

        success: (message) => {
            console.log(chalk.greenBright("success:"), message);
        }
    };

    // File manager
    fileManager = {

        /**
         * Downloads a file to disk.
         * @param {string} id - File ID
         * @param {string} savePath - Full path of destination file
        */
        downloadFile: async (id, savePath, parallel, updateFn) => {
            if(typeof updateFn == "undefined") updateFn = () => {};

            // Override parallel chunks to download
            MAX_PARALLEL_CHUNK_DOWNLOAD = parallel;

            // Check if any file exists at this location
            let stat, alreadyExists;
            try {
                stat = await fs.promises.stat(savePath);
                alreadyExists = true;
            }catch(e) {
                alreadyExists = false;
            }

            // Throw if file already exists
            if(alreadyExists === true) {
                this.console.error(`A file or folder already exists at \`${savePath}\`!`);
                process.exit(1);
            }

            let file = await this.db.getFile(id);
            let chunksMeta = await this.db.getChunks(id);

            // Sort chunks by index
            chunksMeta.sort((a, b) => a.index - b.index);

            console.log(chalk.blueBright("download"), `${file.name} (${formatSize(file.size)}, ${chunksMeta.length} chunks)`, `→`, chalk.yellowBright(savePath), chalk.gray(`[${id}]`));

            // Emit `start` event
            updateFn('start', {
                chunks: chunksMeta.length,
                file: file
            });

            let jobs = [];
            let jobsCompleted = [];
            let jobIndex = 0;

            // Downloads a chunk at an index
            const downloadChunk = async (i) => {
                let chunkMeta = chunksMeta[i];
                let response = await axios.get(this.config.data.webhook + `/messages/` + chunkMeta.message_id);
                let dataUrl = response.data.attachments[0].url;

                // Emit `chunkdownload` event
                updateFn('chunkdownload', {
                    meta: chunkMeta,
                    url: dataUrl,
                    index: i
                });

                // Record download start time
                const startTime = performance.now();

                // Download the chunk data
                let chunkResponse = await axios.get(dataUrl, {responseType: 'arraybuffer'});

                const elapsed = performance.now() - startTime;

                // Measure average download speed (bytes per second)
                const avgSpeed = chunkResponse.data.length / (elapsed / 1000);

                // Decrypt chunk data
                let deciphertext = this.crypto.decrypt(this.config.data.encryption_key, chunkResponse.data);

                jobsCompleted++;

                // Emit `chunkdownloaded` event
                updateFn('chunkdownloaded', {
                    meta: chunkMeta,
                    url: dataUrl,
                    avgSpeed: avgSpeed,
                    size: chunkResponse.data.length,
                    time: elapsed
                });

                return {
                    index: i,
                    data: deciphertext
                };
            };

            const queue = (resolve, reject) => {
                if(jobsCompleted === chunksMeta.length) return resolve();

                // Queue download jobs
                for(let i=0; i<MAX_PARALLEL_CHUNK_DOWNLOAD; i++) {
                    if(jobIndex === chunksMeta.length) break;

                    jobs.push(downloadChunk(jobIndex));
                    jobIndex++;
                }

                Promise.all(jobs).then(async data => {
                    // Sort in ascending order
                    data.sort((a, b) => a.index - b.index);

                    // Append data to save file
                    for(let i in data) {
                        await fs.appendFile(savePath, data[i].data);

                        // Emit `chunksaved` event
                        updateFn('chunksaved', {
                            bytes: data[i].data.length
                        });
                    }

                    // Reset jobs
                    jobs = [];

                    // Queue next batch
                    queue(resolve, reject);
                });
            };

            // Wait for all jobs to complete
            await new Promise((resolve, reject) => {
                queue(resolve, reject);
            });

            // Emit `end` event
            updateFn('end', {
                path: savePath,
                file: file,
                chunks: chunksMeta.length
            });
        },

        /**
         * Uploads a chunk to the file system.
         * @param {string} id - File ID the chunk belongs to
         * @param {string} filepath - Full path to the file on disk being uploaded
         * @param {string} index - Index of chunk to upload
        */
        uploadChunk: async (id, filepath, index) => {
            let start = index * MAX_CHUNK_SIZE;
            let end = start + MAX_CHUNK_SIZE;

            // Read entire range of file
            let chunks = [];
            for await (let chunk of fs.createReadStream(filepath, { start, end: end-1, autoClose: true })) {
                chunks.push(chunk);
            }
            chunks = Buffer.concat(chunks);

            // Make sure range end is correct
            if(chunks.length < MAX_CHUNK_SIZE) end = start + chunks.length;

            // Encrypt chunk
            let ciphertext = this.crypto.encrypt(this.config.data.encryption_key, chunks);
            
            // Create new FormData and append data
            const form = new FormData();

            form.append(id + `.chunk` + index, ciphertext, {
                filename: id + `.chunk` + index
            });
            form.append('payload_json', JSON.stringify({
                content: JSON.stringify({
                    size: chunks.length
                }),
                username: 'Distore'
            }));

            // Measure download duration
            const startTime = performance.now();

            // Upload the chunk to Discord
            let response = await axios.post(this.config.data.webhook + `?wait=true`, form);

            let elapsed = performance.now() - startTime;

            // Measure average download speed (bytes per second)
            let avgSpeed = chunks.length / (elapsed / 1000);

            // Register chunk to database
            await this.db.addChunk(id, {
                index: index,
                range: {
                    start,
                    end
                },
                message_id: response.data.id
            });

            // Return upload stats
            return {
                time: elapsed,
                avgSpeed: avgSpeed,
                size: chunks.length
            };
        },

        /**
         * Uploads a file to the file system.
         * @param {string} filepath - Full path to file on disk
         * @param {string} dbpath - Full path to file on database
        */
        uploadFile: async (filepath, dbpath, parallel, updateFn) => {
            if(typeof updateFn == "undefined") updateFn = () => {};

            // Override parallel chunks to upload
            MAX_PARALLEL_CHUNK_UPLOAD = parallel;

            let stat;
            try {
                stat = await fs.promises.stat(filepath);
            }catch(e) {
                if(e.code === 'ENOENT') this.console.error(`No such file or directory`);
                else this.console.error(`Failed to stat file \`${filepath}\``);
                process.exit(1);
            }

            const chunks = Math.ceil(stat.size / MAX_CHUNK_SIZE);

            // Emit `registerfile` event
            updateFn('registerfile', {
                path: filepath,
                destination: dbpath
            });

            // Register file in database
            const fileResult = await this.db.addFile(path.basename(dbpath), path.dirname(dbpath), stat.size);

            console.log(chalk.blueBright("upload"), path.basename(filepath), `(${formatSize(stat.size)}, ${chunks} chunks)`, `→`, chalk.yellowBright(dbpath), chalk.gray(`[${fileResult.key}]`));

            // Emit `start` event
            updateFn('start', {
                path: filepath,
                destination: dbpath,
                file: fileResult,
                chunks: chunks
            });

            let jobs = 0;
            let jobIndex = 0;
            let jobsCompleted = 0;

            const queue = (resolve, reject) => {
                let free = MAX_PARALLEL_CHUNK_UPLOAD - jobs;

                // If jobs completed = no. of chunks, all chunks have been uploaded
                if(jobsCompleted === chunks) return resolve(true);

                for(let i=0; i<free; i++) {
                    // Don't queue more jobs than chunks
                    if(jobIndex === chunks) break;

                    // Emit `chunkupload` event
                    updateFn('chunkupload', {
                        index: jobIndex
                    });

                    // Upload chunk
                    jobs++;
                    this.fileManager.uploadChunk(fileResult.key, filepath, jobIndex).then(stats => {
                        jobs--;
                        jobsCompleted++;

                        // Emit `chunkuploaded` event
                        updateFn('chunkuploaded', stats);

                        queue(resolve, reject);
                    });

                    // Bump job index
                    jobIndex++;
                }
            };

            // Queue chunks
            await new Promise((resolve, reject) => {
                queue(resolve, reject);
            });

            // Emit `end` event
            updateFn('end', {
                path: filepath,
                destination: dbpath,
                file: fileResult,
                chunks: chunks
            });

            return fileResult;
        }

    };

    // Database related functions
    db = {

        // Initialized instance of Deta
        deta: null,

        /**
         * Returns a authenticated Deta instance
         * @param {string} key - Deta Collection API Key
        */
        init: () => {
            this.db.deta = deta.Deta(this.config.data.deta_api_key);

            return this.db.deta;
        },

        /**
         * Registers a file in the file system
         * @param {string} name - Name of the file
         * @param {string} dirpath - Full path upto file's parent directory
         * @param {number} size - Size of the file in bytes
        */
        addFile: async (name, dirpath, size) => {
            const files = this.db.deta.Base('files');
            const id = nanoid();

            return await files.put({
                name: name,
                path: dirpath,
                size: size
            }, id);
        },

        /**
         * Registers a file chunk to the database
         * @param {string} id - ID of file in database
         * @param {number} data.index - Index of chunk among all chunks
         * @param {number} data.range.start - Starting byte offset of chunk
         * @param {number} data.range.end - Ending byte offset of chunk
         * @param {string} data.message_id - Discord Message ID
        */
        addChunk: async (id, data) => {
            const chunks = this.db.deta.Base('file_chunks');

            return await chunks.put({
                file: id,
                index: data.index,
                message_id: data.message_id,
                range: {
                    start: data.range.start,
                    end: data.range.end
                }
            });
        },

        /**
         * Fetches file metadata for a given ID
         * @param {string} id - File ID
        */
        getFile: async (id) => {
            const files = this.db.deta.Base('files');

            return files.get(id);
        },

        /**
         * Fetches file metadata for a given path
         * @param {string} filepath - File Path on virtual filesystem
        */
        getFileFromPath: async (filepath) => {
            const files = this.db.deta.Base('files');

            const result = await files.fetch({
                name: path.basename(filepath),
                path: path.dirname(filepath)
            }, {limit: 1});

            if(result.items.length < 1) return null;
            else return result.items[0];
        },

        /**
         * Fetches the list of chunks for a given File ID
         * @param {string} id - File ID
        */
        getChunks: async (id) => {
            const chunks = this.db.deta.Base('file_chunks');
            let chunksList = [];
            let last = null;

            const fetchChunks = async () => {
                let response;
                if(last === null) {
                    response = await chunks.fetch({
                        file: id
                    });
                }else {
                    response = await chunks.fetch({
                        file: id
                    }, {last: last});
                }

                chunksList.push.apply(chunksList, response.items);

                // Check if there are further items to fetch
                if(response.last) {
                    last = response.last;
                    await fetchChunks();
                }else {
                    return;
                }
            };

            // Start fetching list of chunks
            await fetchChunks();

            return chunksList;
        },

        /**
         * Deletes a given File ID and all of it's chunks
         * This also deletes the Discord messages for each chunk
         * @param {string} id - File ID
        */
        deleteFile: async (id, updateFn) => {
            const files = this.db.deta.Base('files');
            const chunks = this.db.deta.Base('file_chunks');

            // Emit `start` event
            updateFn(`start`, {});

            // Get list of chunks for file
            const chunksList = await this.db.getChunks(id);

            if(chunksList.length < 1) throw new Error(`Invalid File: \`${id}\` has no chunks in database.`);

            // Emit `fetchchunks` event
            updateFn(`fetchchunks`, {chunksList});

            // Delete the file entry
            await files.delete(id);

            // Delete file chunks
            for(let i in chunksList) {
                // Emit `chunkdelete` event
                updateFn(`chunkdelete`, {
                    id: i,
                    key: chunksList[i].key
                });

                await chunks.delete(chunksList[i].key);

                // Delete Discord message for this chunk
                const response = await axios.delete(this.config.data.webhook + `/messages/` + chunksList[i].message_id);
                if(response.status != 204) throw new Error(`Unexpected Response from Discord: Deleting message ${chunksList[i].message_id} returned ${response.statusText}.`);
                
                // Emit `chunkdeleted` event
                updateFn(`chunkdeleted`, {
                    id: i
                });
            }

            // Emit `end` event
            updateFn(`end`, {});
        }

    };

    // Configuration related functions
    config = {

        /**
         * Cached configuration
        */
        data: null,

        /**
         * Path to directory containing the config file
        */
        dir: path.join(os.homedir(), ".distore"),

        /**
         * Full path to config file
        */
        path: path.join(os.homedir(), ".distore", "config.json"),

        /**
         * Initializes the configuration file and loads it in memory
        */
        init: async () => {
            // Ensure config directory exists
            await fs.ensureDir(this.config.dir);

            // Check if config JSON file exists
            let exists;
            try {
                await fs.promises.access(this.config.path, fs.constants.F_OK);
                exists = true;
            }catch(e) {
                exists = false;
            }

            if(exists === true) {
                const contents = JSON.parse((await fs.readFile(this.config.path)).toString());
                this.config.data = contents;

                return contents;
            }else {
                // Initialize new configuration with encryption key
                const nullConfig = {
                    webhook: null,
                    deta_api_key: null,
                    encryption_key: this.crypto.generateKey()
                };

                // Make config JSON file
                await fs.writeFile(this.config.path, JSON.stringify(nullConfig));

                this.console.info(`Initialized configuration file at \`${this.config.path}\` with new encryption key.`);

                this.config.data = nullConfig;
                
                return nullConfig;
            }
        },

        /**
         * Sets the contents of the config file
         * @param {string} config.webhook - Discord Webhook URL
         * @param {string} config.deta_api_key - Deta Collection API key
         * @param {string} config.encryption_key - Encryption key for E2EE
        */
        setConfig: async (config) => {
            await fs.writeFile(this.config.path, JSON.stringify(config));
            this.config.data = config;
        }
    };

    //Cryptography related functions
    crypto = {

        /**
         * Generates a 256-bit safe, random key for AES-GCM-256 cryptography
        */
        generateKey: () => {
            return nanoid(32);
        },

        /**
         * Generates a 96-bit safe, random IV for AES-GCM-256 cryptography
        */
        generateIV: () => {
            return nanoid(12);
        },

        /**
         * Encrypts a given buffer using AES-GCM-256 algorithm
         * Generated ciphertext contains 12-byte IV, 16-byte auth tag inserted before payload
         * @param {string} key - Encryption key
         * @param {Buffer} data - Data to encrypt
        */
        encrypt: (key, data) => {
            // Generate IV
            const iv = Buffer.from(this.crypto.generateIV(), 'utf8');

            // Create AES 256 GCM Mode cipher
            let cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

            // Encrypt the given buffer
            let encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);

            // Extract the auth tag
            const tag = cipher.getAuthTag();

            return Buffer.concat([iv, tag, encrypted]);
        },

        /**
         * Decrypts an encrypted payload
         * @param {string} key - Encryption key
         * @param {Buffer} data - Encrypted payload to decrypt
        */
        decrypt: (key, data) => {
            let bData = Buffer.from(data, 'base64');

            // Extract data from ciphertext
            const iv = bData.subarray(0, 12);
            const tag = bData.subarray(12, 28);
            const text = bData.subarray(28);

            // Decipher with AES 256 GCM Mode
            let decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);

            // Decrypt the given payload
            let decrypted;
            try {
                decrypted = Buffer.concat([decipher.update(text), decipher.final()]);
            }catch(e) {
                this.console.error("Failed to decrypt data!");
                process.exit(1);
            }

            return decrypted;
        }

    };

};

module.exports = new API();