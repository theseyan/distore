/**
 * Utility functions
*/

module.exports = new class Util {

    // Utility function to format time durations
    formatTime = (ms) => {
        if(ms > 1000) {
            return (ms/1000).toFixed(1) + `s`;
        }else {
            return Math.trunc(ms) + `ms`;
        }
    };

    // Utility function to format file size
    formatSize = (bytes) => {
        if(bytes > 1024 * 1024 * 1024) {
            return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ` GiB`;
        }
        if(bytes > 1024 * 1024) {
            return (bytes / (1024 * 1024)).toFixed(1) + ` MiB`;
        }
        if(bytes > 1024) {
            return (bytes / (1024)).toFixed(1) + ` KiB`;
        }
        else return Math.trunc(bytes) + ` bytes`;
    };

};