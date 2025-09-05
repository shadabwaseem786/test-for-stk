// A simple queue to manage API calls to respect rate limits.
// Free tier models can have limits as low as 15 RPM.
// Previous attempts showed that ~10 RPM failed, while ~6 RPM worked.
// We are choosing a safer value in between to balance speed and reliability.
const MIN_INTERVAL = 8100; // 8.1 seconds for a safe margin (approx. 7.4 RPM max)

const requestQueue: Array<{
    apiCall: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
}> = [];
let isProcessing = false;

const processQueue = async () => {
    if (requestQueue.length === 0) {
        isProcessing = false;
        return;
    }

    isProcessing = true;
    const { apiCall, resolve, reject } = requestQueue.shift()!;
    
    try {
        const result = await apiCall();
        resolve(result);
    } catch (error) {
        reject(error);
    }
    
    // Wait for the interval before processing the next request in the queue.
    setTimeout(processQueue, MIN_INTERVAL);
};

/**
 * Schedules an API call to be executed in a rate-limited queue.
 * @param apiCall The function that performs the API call. It should be an async function.
 * @returns A promise that resolves with the result of the API call once it has been completed.
 */
export const scheduleApiCall = <T>(apiCall: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
        requestQueue.push({ apiCall, resolve, reject });
        if (!isProcessing) {
            processQueue();
        }
    });
};