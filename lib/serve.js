/**
 * HTTP Server for Distore
*/

const api = require('./api');
const fastify = require('fastify');
const {Readable} = require('node:stream');
const rangeParser = require('range-parser');

// Default port to use
const DEFAULT_PORT = 3000;

class DistoreServer {

    // The fastify instance
    server = fastify();

    /**
     * @constructor
    */
    constructor() {
        this.server.get('*', async (request, reply) => {
            const file = await api.db.getFileFromPath(request.originalUrl);

            if(file === null) {
                // File does not exist
                return reply.code(404).type('text/html').send('Not Found');
            }else {
                reply.header('Content-Disposition', `attachment; filename="${file.name}"`);
                reply.header('Content-Length', file.size);

                let range;
                if(typeof request.headers.range === "undefined") {
                    range = {
                        start: 0,
                        end: file.size - 1
                    };
                }else {
                    range = rangeParser(file.size, request.headers.range)[0];
                }

                let byteStream = await api.fileManager.getBytes(file.key, range.start, range.end);

                return reply.type('application/octet-stream').send(byteStream);
            }
        });
    }

    /**
     * Starts the HTTP server.
     * @param {number} port - Port to serve HTTP.
    */
    start = async (port) => {
        if(typeof port === "undefined") port = DEFAULT_PORT;

        await this.server.listen({ port });
    }
}

module.exports = new DistoreServer();