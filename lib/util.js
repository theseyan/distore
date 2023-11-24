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

    // Utility function to recursively fetch all items from a Base
    fetchAll = async (db, condition) => {
        let list = [];
        let last = null;

        const fetchMore = async () => {
            let response;
            if(last === null) {
                response = await db.fetch(condition);
            }else {
                response = await db.fetch(condition, {last: last});
            }

            list.push.apply(list, response.items);

            // Check if there are further items to fetch
            if(response.last) {
                last = response.last;
                await fetchMore();
            }else {
                return;
            }
        };

        // Start fetching
        await fetchMore();

        return list;
    };

};